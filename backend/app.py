from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import json
import logging
import pandas as pd
import math
import statistics
import threading
import time
from contextlib import asynccontextmanager
from apscheduler.schedulers.background import BackgroundScheduler
import numpy as np
from scipy.stats import norm, poisson
import os
import requests
from dotenv import load_dotenv
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

# Load environment variables
load_dotenv()
ODDS_API_KEY = os.getenv("ODDS_API_KEY")

# ── Tenacity Retry Decorator for nba_api ──────────────────────────────────────
auto_retry = retry(
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1.5, min=2, max=10),
    retry=retry_if_exception_type(Exception),
    reraise=True
)

# nba_api imports
from nba_api.stats.endpoints import (
    commonplayerinfo, playergamelog, scoreboardv2,
    leaguedashteamstats, shotchartdetail, commonteamroster,
    leaguedashplayerstats, boxscoretraditionalv2, playbyplayv2
)
from nba_api.stats.static import players, teams

from database import SessionLocal, engine, Player, Game, GameLog, TeamStat, CacheMeta, OddsHistory, EdgeAnalysis
from ml_model import train_and_predict_prop

# ── Team lookup maps ───────────────────────────────────────────────────────────
all_teams = teams.get_teams()
team_lookup     = {t['abbreviation']: t for t in all_teams}  # abbr -> team dict
team_id_lookup  = {t['id']: t for t in all_teams}            # id   -> team dict

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Cache helpers ─────────────────────────────────────────────────────────────
CACHE_TTL_STATS   = 1    # hours  (player game logs)
CACHE_TTL_TEAMS   = 24   # hours  (team defense / pace)
CACHE_TTL_PLAYER  = 24   # hours  (player bio)

# Player name overrides for known collision cases (fuzzy matcher ambiguities)
PLAYER_NAME_OVERRIDES = {
    "seth curry": 203552,
    "anthony davis": 203076,
    "robert williams": 1629684,
    "isaiah stewart": 1630198,
}

_odds_cache = {'data': {}, 'ts': None, 'persisted': False}  # In-memory cache for The-Odds-API

def is_cache_valid(updated_at: datetime, hours: int = 1) -> bool:
    if not updated_at:
        return False
    return datetime.utcnow() - updated_at < timedelta(hours=hours)


# ── Advanced Analytics ─────────────────────────────────────────────────────────

def calculate_probability_model(values: list, line: float) -> float:
    """P(X > line) using Normal Distribution."""
    if len(values) < 5:
        return 50.0
    mean = np.mean(values)
    std  = np.std(values)
    if std == 0:
        return 100.0 if mean > line else 0.0
    return round(float(norm.sf(line, loc=mean, scale=std) * 100), 1)


def run_monte_carlo(values: list, line: float, iterations: int = 5000, consistency_weight: float = 1.0) -> float:
    """
    P(X > line) via Monte Carlo simulation with optional consistency weighting.
    
    consistency_weight: float (0.0-1.0)
      - High-consistency players (weight > 0.8): Reduces variance for more predictable outcomes
      - Low-consistency players (weight < 0.4): Increases variance for tail risk consideration
    """
    if len(values) < 5:
        return 50.0
    mean = np.mean(values)
    std  = np.std(values)
    if std == 0:
        return 100.0 if mean > line else 0.0
    
    # Adjust variance based on consistency_weight
    # High consistency (weight ~1.0) → variance drops 6%
    # Low consistency (weight ~0.4) → variance rises 18%
    variance_adjustment = 1.0 + (1.0 - consistency_weight) * 0.3
    adjusted_std = std * math.sqrt(variance_adjustment)
    
    sim = np.random.normal(mean, adjusted_std, iterations)
    return round(float(np.sum(sim > line) / iterations * 100), 1)


def calculate_win_probability(home_stats, visitor_stats) -> dict:
    """Win probability from Net Rating + 3-pt home-court advantage.
    When DB has no team stats yet, returns home=55.0 (standard home-court edge).
    """
    if not home_stats or not visitor_stats:
        # No DB data yet → use standard home-court-advantage baseline
        return {"home": 55.0, "visitor": 45.0}

    # Prefer stored net_rating; else compute from off/def
    h_net = home_stats.net_rating
    v_net = visitor_stats.net_rating

    if h_net is None:
        h_off = home_stats.off_rating or 0
        h_def = home_stats.def_rating or 0
        h_net = (h_off - h_def) if (h_off and h_def) else None

    if v_net is None:
        v_off = visitor_stats.off_rating or 0
        v_def = visitor_stats.def_rating or 0
        v_net = (v_off - v_def) if (v_off and v_def) else None

    if h_net is None or v_net is None:
        return {"home": 55.0, "visitor": 45.0}

    # Expected margin: net rating diff + 3-pt home court
    expected_margin = float(h_net) - float(v_net) + 3.0
    # scale=12 roughly maps to empirical NBA game outcome distribution
    prob_home_win   = norm.cdf(expected_margin, loc=0, scale=12.0) * 100
    prob_home_win   = max(25.0, min(75.0, prob_home_win))  # cap realistic range
    return {
        "home":    round(float(prob_home_win), 1),
        "visitor": round(float(100 - prob_home_win), 1)
    }


def calculate_poisson_probability(mean_value: float, line: float) -> float:
    """P(X > line) via Poisson — best for discrete counts (3PM, REB, STL)."""
    if mean_value <= 0:
        return 0.0
    prob_over = (1 - poisson.cdf(math.floor(line), mu=mean_value)) * 100
    return round(float(prob_over), 1)


def calculate_consistency_score(values: list) -> float:
    """
    Calculate consistency score (1-100) based on coefficient of variation.
    
    Score = 100 - ((CV - 0.1) * 150)
    - CV = StdDev / Mean
    - High consistency (low variance): Score > 80 (🔥 Highly Consistent)
    - Medium consistency: 50-80
    - Low consistency (high variance): < 40 (⚠️ Volatile)
    
    Returns: float (1-100)
    """
    if len(values) < 2:
        return 50.0  # Unknown
    
    values_clean = [v for v in values if v > 0]
    if not values_clean:
        return 50.0
    
    mean = np.mean(values_clean)
    if mean == 0:
        return 50.0
    
    std = np.std(values_clean)
    cv = std / mean  # Coefficient of Variation
    
    # Formula: 100 - ((CV - 0.1) * 150)
    # When CV = 0.1 (very consistent): score = 100
    # When CV = 0.4 (moderate): score = 55
    # When CV = 0.6 (volatile): score = 25
    score = 100.0 - ((cv - 0.1) * 150.0)
    return round(float(max(1.0, min(100.0, score))), 1)


def calculate_minutes_projection(logs, current_opponent_pace: float = 100.0) -> dict:
    """
    Project player minutes for next game considering:
    1. Rolling minutes average (last 10 games)
    2. Variance in minutes (injury risk, rest management)
    3. Opponent pace (affects game length/intensity)
    4. Blowout risk adjustment
    
    Args:
        logs: List of GameLog objects with game data
        current_opponent_pace: Opponent pace (possessions/48min, default 100)
    
    Returns:
        {
            'projected_minutes': float,
            'rolling_avg': float (L10 average),
            'consistency': float (minutes consistency 0-100),
            'variance_range': tuple (min, max expected minutes),
            'blowout_risk_adjustment': float (-5 to +5),
            'confidence': str ('High' | 'Medium' | 'Low'),
            'explanation': str
        }
    """
    try:
        if not logs:
            return {
                'projected_minutes': 24.0,
                'rolling_avg': 24.0,
                'consistency': 50.0,
                'variance_range': (18.0, 30.0),
                'blowout_risk_adjustment': 0.0,
                'confidence': 'Low',
                'explanation': 'Insufficient data for minutes projection'
            }
        
        # Extract minutes from game logs (format: "MM:SS")
        minutes_played = []
        for log in logs:
            if log.mins and isinstance(log.mins, str):
                try:
                    m, s = log.mins.split(':')
                    total_min = int(m) + int(s) / 60.0
                    if total_min > 0:
                        minutes_played.append(total_min)
                except:
                    continue
        
        if not minutes_played:
            return {
                'projected_minutes': 24.0,
                'rolling_avg': 24.0,
                'consistency': 50.0,
                'variance_range': (18.0, 30.0),
                'blowout_risk_adjustment': 0.0,
                'confidence': 'Low',
                'explanation': 'Could not parse minutes from logs'
            }
        
        # L10 average
        l10_minutes = minutes_played[:10]
        rolling_avg = np.mean(l10_minutes)
        
        # Consistency of minutes
        minutes_std = np.std(minutes_played)
        minutes_cv = minutes_std / rolling_avg if rolling_avg > 0 else 0.5
        minutes_consistency = 100.0 - ((minutes_cv - 0.05) * 200.0)
        minutes_consistency = max(1.0, min(100.0, minutes_consistency))
        
        # Variance range (confidence interval)
        variance_min = rolling_avg - (minutes_std * 1.5)
        variance_max = rolling_avg + (minutes_std * 1.5)
        variance_min = max(0.0, variance_min)
        variance_max = min(48.0, variance_max)
        
        # Blowout risk: If last 3 games had extreme +/- (DNP or 48min), flag it
        recent_minutes = minutes_played[:3]
        blowout_adjustment = 0.0
        blowout_risk = 'Low'
        
        if recent_minutes:
            if any(m < 10 for m in recent_minutes) or any(m > 46 for m in recent_minutes):
                blowout_adjustment = -2.0  # Could be reduced minutes in blowout
                blowout_risk = 'High'
            elif any(abs(rolling_avg - m) > 10 for m in recent_minutes):
                blowout_adjustment = -1.0
                blowout_risk = 'Medium'
        
        # Adjusted projection
        projected_minutes = rolling_avg + blowout_adjustment
        projected_minutes = max(0.0, min(48.0, projected_minutes))
        
        # Pace adjustment: Faster pace = more possessions = potentially more minutes
        pace_adjustment = (current_opponent_pace - 100.0) / 100.0 * 1.5  # Up to ±1.5 min
        projected_minutes += pace_adjustment
        
        # Confidence level
        if len(minutes_played) >= 15 and minutes_consistency > 70:
            confidence = 'High'
        elif len(minutes_played) >= 10 and minutes_consistency > 50:
            confidence = 'Medium'
        else:
            confidence = 'Low'
        
        # Explanation
        explanation = f"L10 avg: {rolling_avg:.1f}m | Std: {minutes_std:.1f}m"
        if blowout_risk == 'High':
            explanation += " | ⚠️ Recent blowout risk"
        if abs(pace_adjustment) > 0.5:
            direction = "faster" if pace_adjustment > 0 else "slower"
            explanation += f" | Opponent {direction} pace (+{pace_adjustment:.1f}m)"
        
        return {
            'projected_minutes': round(projected_minutes, 1),
            'rolling_avg': round(rolling_avg, 1),
            'consistency': round(minutes_consistency, 1),
            'variance_range': (round(variance_min, 1), round(variance_max, 1)),
            'blowout_risk_adjustment': round(blowout_adjustment, 1),
            'confidence': confidence,
            'explanation': explanation
        }
    except Exception as e:
        logger.error(f"Minutes projection calculation failed: {e}")
        return {
            'projected_minutes': 24.0,
            'rolling_avg': 24.0,
            'consistency': 50.0,
            'variance_range': (18.0, 30.0),
            'blowout_risk_adjustment': 0.0,
            'confidence': 'Low',
            'explanation': f'Error: {str(e)}'
        }


def calculate_ev_and_kelly(model_prob: float, implied_prob: float, odds_american: float, model_std_dev: float = None) -> dict:
    """
    Calculate true Expected Value (EV), Kelly Criterion, and variance metrics.
    
    IMPORTANT: Uses correct betting EV formula:
    EV = (model_prob * (decimal_odds - 1)) - ((1 - model_prob) * 1)
    This represents profit per $1 wagered, accounting for both win and loss scenarios.
    
    Args:
        model_prob: Our model's probability (0-100)
        implied_prob: Sportsbook's implied probability (0-100)
        odds_american: American odds format (-110, +150, etc.)
        model_std_dev: Optional standard deviation of model (for confidence intervals)
    
    Returns:
        {
            'ev_percentage': float (true EV as % ROI per $1, can be negative),
            'kelly_full': float (0-1, full Kelly fraction),
            'kelly_quarter': float (0-1, quarter Kelly for live betting),
            'recommended_units': float (suggested bet sizing as % of bankroll),
            'edge_vs_market': float (model_prob - implied_prob, for reference),
            'confidence_interval_low': float (95% CI lower bound),
            'confidence_interval_high': float (95% CI upper bound),
            'std_dev': float (standard deviation of probability estimate)
        }
    """
    # Convert probabilities from 0-100 to 0-1 range
    p = model_prob / 100.0
    q = 1.0 - p
    
    # Calculate edge % vs market (for informational purposes)
    edge_vs_market = model_prob - implied_prob
    
    try:
        # Convert American odds to decimal odds
        if odds_american > 0:
            decimal_odds = (odds_american / 100.0) + 1.0
        else:
            decimal_odds = 1.0 + (100.0 / abs(odds_american))
        
        # TRUE EV FORMULA (correct betting mathematics):
        # EV = (probability_of_win * profit_if_win) - (probability_of_loss * stake_if_loss)
        # EV = (p * (decimal_odds - 1)) - (q * 1)
        # This gives profit per $1 wagered
        ev_true = (p * (decimal_odds - 1.0)) - (q * 1.0)
        ev_percentage = ev_true * 100.0  # Convert to percentage ROI
        ev_percentage = max(-100.0, min(100.0, ev_percentage))  # Bound realistic range
        
        # Kelly Criterion: f* = (bp - q) / b
        # where: b = (decimal_odds - 1), p = probability, q = 1-p
        b = decimal_odds - 1.0
        kelly_full = (b * p - q) / b if b != 0 else 0.0
        kelly_full = max(0.0, min(0.25, kelly_full))  # Bound to 0-25%
        
        # Quarter Kelly (safer for live betting)
        kelly_quarter = kelly_full / 4.0
        
        # Recommended unit sizing based on TRUE EV
        # If EV > 10%: 1 unit
        # If EV 5-10%: 0.5 units
        # If EV 2-5%: 0.25 units
        # If EV 0-2%: 0.1 units
        # If EV < 0%: 0 units (pass)
        if ev_percentage < 0:
            recommended_units = 0.0
        elif ev_percentage < 2.0:
            recommended_units = 0.1
        elif ev_percentage < 5.0:
            recommended_units = 0.25
        elif ev_percentage < 10.0:
            recommended_units = 0.5
        else:
            recommended_units = 1.0
        
        # Confidence intervals (95% CI using normal distribution)
        # If no std_dev provided, use default of 8% (typical for binary classification)
        if model_std_dev is None:
            model_std_dev = min(model_prob * 0.15, 15.0)  # 15% of value, capped at 15%
        
        # 95% CI: ±1.96 * std_dev
        ci_low = max(0.5, model_prob - (1.96 * model_std_dev))
        ci_high = min(99.5, model_prob + (1.96 * model_std_dev))
        
        return {
            'ev_percentage': round(ev_percentage, 2),
            'kelly_full': round(kelly_full, 4),
            'kelly_quarter': round(kelly_quarter, 4),
            'recommended_units': round(recommended_units, 2),
            'edge_vs_market': round(edge_vs_market, 2),
            'confidence_interval_low': round(ci_low, 1),
            'confidence_interval_high': round(ci_high, 1),
            'std_dev': round(model_std_dev, 2)
        }
    except Exception as e:
        logger.error(f"EV/Kelly calculation failed: {e}")
        return {
            'ev_percentage': 0.0,
            'kelly_full': 0.0,
            'kelly_quarter': 0.0,
            'recommended_units': 0.0,
            'edge_vs_market': round(edge_vs_market, 2)
        }


def calculate_confidence_score(hit_rates: dict, consistency: float, matchup_rating: float, mc_prob: float) -> dict:
    """
    Calculate unified confidence score combining multiple factors.
    
    Args:
        hit_rates: {l5: float, l10: float, l20: float} (percentages 0-100)
        consistency: float (1-100)
        matchup_rating: float (0-100, where 50 is neutral)
        mc_prob: float (0-100, full probability from MC sim)
    
    Returns:
        {
            'confidence_score': float (1-100),
            'rating': str ('High' | 'Medium' | 'Low'),
            'factors': { breakdown of component scores }
        }
    """
    try:
        # Normalize factors to 0-1 scale
        l5_score = int(hit_rates.get('l5', 50)) / 100.0
        l10_score = int(hit_rates.get('l10', 50)) / 100.0
        consistency_normalized = consistency / 100.0
        matchup_normalized = max(0.0, min(1.0, matchup_rating / 100.0))
        
        # Certainty from MC probability (how far from 50%)
        mc_certainty = abs(mc_prob - 50.0) / 50.0  # 0-1
        mc_certainty_normalized = (mc_certainty ** 0.8) * 1.2  # Soften the curve
        mc_certainty_normalized = max(0.0, min(1.0, mc_certainty_normalized))
        
        # Weighted combination
        weights = {
            'l5': 0.30,
            'l10': 0.25,
            'consistency': 0.20,
            'matchup': 0.15,
            'mc_certainty': 0.10
        }
        
        component_scores = {
            'l5': l5_score,
            'l10': l10_score,
            'consistency': consistency_normalized,
            'matchup': matchup_normalized,
            'mc_certainty': mc_certainty_normalized
        }
        
        # Calculate weighted score
        confidence = (
            weights['l5'] * component_scores['l5'] +
            weights['l10'] * component_scores['l10'] +
            weights['consistency'] * component_scores['consistency'] +
            weights['matchup'] * component_scores['matchup'] +
            weights['mc_certainty'] * component_scores['mc_certainty']
        )
        
        confidence_score = round(confidence * 100.0, 1)
        
        # Determine rating
        if confidence_score >= 70:
            rating = "High"
        elif confidence_score >= 50:
            rating = "Medium"
        else:
            rating = "Low"
        
        return {
            'confidence_score': max(1.0, min(100.0, confidence_score)),
            'rating': rating,
            'factors': {
                'l5_hit_rate': round(l5_score * 100, 1),
                'l10_hit_rate': round(l10_score * 100, 1),
                'consistency': round(consistency, 1),
                'matchup_rating': round(matchup_rating, 1),
                'mc_certainty': round(mc_certainty_normalized * 100, 1)
            }
        }
    except Exception as e:
        logger.error(f"Confidence score calculation failed: {e}")
        return {
            'confidence_score': 50.0,
            'rating': 'Medium',
            'factors': {}
        }


def generate_pick_explanation(player_name: str, stat_label: str, line: float, ev_perc: float, 
                             confidence: float, hit_rate_l5: float, hit_rate_l10: float, 
                             opponent_text: str = "", minutes_info: dict = None, component_breakdown: dict = None) -> str:
    """
    Generate human-readable explanation for why this pick has edge with detailed breakdown.
    
    Args:
        player_name: Player full name
        stat_label: Stat category (PTS, REB, etc.)
        line: Prop line
        ev_perc: EV percentage
        confidence: Confidence score (1-100)
        hit_rate_l5: Hit rate last 5 games (%)
        hit_rate_l10: Hit rate last 10 games (%)
        opponent_text: Opponent name/defense info
        minutes_info: Dict with minutes projection info
        component_breakdown: Dict showing how confidence score is built
    
    Returns:
        str - Natural language explanation with component breakdown
    """
    sentences = []
    
    # EV strength
    if ev_perc > 10:
        sentences.append(f"📊 **{ev_perc:.1f}% EV** - Strong positive expectation")
    elif ev_perc > 5:
        sentences.append(f"📊 **{ev_perc:.1f}% EV** - Solid edge detected")
    elif ev_perc > 0:
        sentences.append(f"📊 **+{ev_perc:.1f}% EV** - Marginal advantage")
    else:
        sentences.append(f"⚠️ **{ev_perc:.1f}% EV** - Negative expected value")
    
    # Component breakdown (NEW)
    if component_breakdown:
        sentences.append("\n**Edge Components:**")
        components = []
        if component_breakdown.get('form_boost'):
            components.append(f"  • Recent Form: +{component_breakdown['form_boost']:.1f}%")
        if component_breakdown.get('matchup_boost'):
            components.append(f"  • Matchup Advantage: +{component_breakdown['matchup_boost']:.1f}%")
        if component_breakdown.get('minutes_adjustment'):
            adj = component_breakdown['minutes_adjustment']
            sign = "+" if adj > 0 else ""
            components.append(f"  • Minutes Adjustment: {sign}{adj:.1f}%")
        if component_breakdown.get('consistency_boost'):
            components.append(f"  • Consistency: +{component_breakdown['consistency_boost']:.1f}%")
        if components:
            sentences.append("\n".join(components))
    
    # Recent form
    if hit_rate_l5 >= 80:
        sentences.append(f"🔥 **8/10 last 5** - Extremely hot streak")
    elif hit_rate_l5 >= 60:
        sentences.append(f"✅ **{int(hit_rate_l5/10)}/10 last 5** - Strong recent form")
    elif hit_rate_l5 >= 40:
        sentences.append(f"📈 **{int(hit_rate_l5/10)}/10 last 5** - Neutral recent trend")
    else:
        sentences.append(f"⚠️ **{int(hit_rate_l5/10)}/10 last 5** - Cold streak, caution advised")
    
    # Long-term consistency
    if hit_rate_l10 >= 70:
        sentences.append(f"💪 **{int(hit_rate_l10)}% L10** - Reliable performer")
    elif hit_rate_l10 >= 50:
        sentences.append(f"✔️ **{int(hit_rate_l10)}% L10** - Consistent baseline")
    
    # Opponent/Matchup
    if opponent_text and "weak" in opponent_text.lower():
        sentences.append(f"🎯 {opponent_text} - Favorable matchup")
    elif opponent_text and "elite" in opponent_text.lower():
        sentences.append(f"⛔ {opponent_text} - Difficult matchup")
    
    # Minutes projection
    if minutes_info:
        proj_min = minutes_info.get('projected_minutes', 0)
        confidence_min = minutes_info.get('confidence', 'Medium')
        if proj_min < 20:
            sentences.append(f"⏱️ **{proj_min:.0f}m projected** - Limited minutes risk ⚠️")
        elif proj_min >= 35:
            sentences.append(f"✅ **{proj_min:.0f}m projected** - Full-usage opportunity")
        else:
            sentences.append(f"📊 **{proj_min:.0f}m projected** - Standard usage ({confidence_min} confidence)")
    
    # Confidence tier
    if confidence >= 70:
        sentences.append(f"🏆 **HIGH CONFIDENCE** ({confidence:.0f}/100) - Data-driven edge")
    elif confidence >= 50:
        sentences.append(f"📌 **MEDIUM CONFIDENCE** ({confidence:.0f}/100) - Reasonable risk/reward")
    else:
        sentences.append(f"⚠️ **LOW CONFIDENCE** ({confidence:.0f}/100) - Limited edge, consider passing")
    
    return "\n".join(sentences)


def get_rest_and_splits(logs, current_game: dict = None):
    """Returns (modifier, factors_list) for rest, hot/cold streak, home/away."""
    factors  = []
    modifier = 0.0

    if not logs:
        return 0.0, ["No historical data"]

    # 1. Rest Factor
    try:
        last_date = datetime.strptime(logs[0].game.game_date, '%Y-%m-%d')
        rest_days = (datetime.utcnow() - last_date).days
        if rest_days <= 1:
            modifier -= 0.05
            factors.append("Back-to-Back/Fatigue (-5%)")
        elif rest_days >= 3:
            modifier += 0.03
            factors.append("Well Rested (+3%)")
    except Exception:
        pass

    # 2. Hot / Cold Streak (L5 vs season avg)
    pts_list   = [l.pts for l in logs]
    season_avg = np.mean(pts_list) if pts_list else 0
    recent_avg = np.mean(pts_list[:5]) if len(pts_list) >= 5 else season_avg
    if season_avg > 0:
        if recent_avg > season_avg * 1.15:
            modifier += 0.07
            factors.append("Hot Streak (+7%)")
        elif recent_avg < season_avg * 0.85:
            modifier -= 0.07
            factors.append("Cold Slump (-7%)")

    # 3. Home / Away split (proxy)
    if current_game:
        is_home   = current_game.get('is_home', False)
        home_pts  = [l.pts for l in logs if '@' not in (l.game.visitor_team_abbreviation or '')]
        away_pts  = [l.pts for l in logs if '@'     in (l.game.visitor_team_abbreviation or '')]
        if is_home and len(home_pts) > 3 and season_avg > 0:
            if np.mean(home_pts) > season_avg * 1.1:
                modifier += 0.05
                factors.append("Home Court Advantage (+5%)")
        elif not is_home and len(away_pts) > 3 and season_avg > 0:
            if np.mean(away_pts) > season_avg * 1.1:
                modifier += 0.05
                factors.append("Road Warrior (+5%)")

    return modifier, factors


def apply_matchup_penalty(modifier: float, factors: list,
                          opp_stats, opponent_abbr: str):
    """Adjusts modifier based on opponent defensive strength."""
    if not opp_stats:
        return modifier, factors
    rank = opp_stats.def_rating_rank or 15
    pace = opp_stats.pace or 100

    if rank <= 5:
        modifier -= 0.15
        factors.append(f"Elite Defense {opponent_abbr} (#{ rank }) (-15%)")
    elif rank <= 12:
        modifier -= 0.08
        factors.append(f"Strong Defense {opponent_abbr} (#{ rank }) (-8%)")
    elif rank >= 25:
        modifier += 0.08
        factors.append(f"Weak Defense {opponent_abbr} (#{ rank }) (+8%)")

    if pace and pace > 103:
        modifier += 0.06
        factors.append(f"High Pace ({round(pace,1)}) (+6%)")
    elif pace and pace < 97:
        modifier -= 0.03
        factors.append(f"Slow Pace ({round(pace,1)}) (-3%)")

    return modifier, factors


def player_name_mapper(name: str) -> str:
    mapping = {
        "nic claxton":     "Nicolas Claxton",
        "cam thomas":      "Cameron Thomas",
        "otto porter":     "Otto Porter Jr.",
        "kelly oubre":     "Kelly Oubre Jr.",
        "marvin bagley":   "Marvin Bagley III",
        "gary trent":      "Gary Trent Jr.",
        "tim hardaway":    "Tim Hardaway Jr.",
        "danuel house":    "Danuel House Jr.",
        "derrick jones":   "Derrick Jones Jr.",
        "lonnie walker":   "Lonnie Walker IV",
        "kevin porter":    "Kevin Porter Jr.",
        "jabari smith":    "Jabari Smith Jr.",
        "wendell carter":  "Wendell Carter Jr.",
        "marcus morris":   "Marcus Morris Sr.",
        "robert williams": "Robert Williams III",
    }
    return mapping.get(name.lower(), name)


# ── DB dependency ──────────────────────────────────────────────────────────────
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Internal sync helpers ──────────────────────────────────────────────────────

def _parse_gamelog_row(row) -> dict:
    """Extract all stat fields from a nba_api PlayerGameLog row."""
    mins = str(row.get('MIN', '0'))
    if ':' not in mins:
        mins = f"{mins}:00"

    matchup = row.get('MATCHUP', '')
    parts   = matchup.replace(' vs. ', ',').replace(' @ ', ',').split(',')
    if ' vs. ' in matchup:
        home_abbr, visit_abbr = parts[0].strip(), parts[1].strip()
    else:
        home_abbr, visit_abbr = parts[1].strip(), parts[0].strip()

    try:
        iso_date = datetime.strptime(str(row['GAME_DATE']), '%b %d, %Y').strftime('%Y-%m-%d')
    except Exception:
        iso_date = str(row.get('GAME_DATE', '2024-01-01'))

    return {
        'game_id':    str(row['Game_ID']),
        'iso_date':   iso_date,
        'home_abbr':  home_abbr,
        'visit_abbr': visit_abbr,
        'mins':       mins,
        'pts':        int(row.get('PTS',   0)),
        'reb':        int(row.get('REB',   0)),
        'ast':        int(row.get('AST',   0)),
        'fg3m':       int(row.get('FG3M',  0)),
        'stl':        int(row.get('STL',   0)),
        'blk':        int(row.get('BLK',   0)),
        'oreb':       int(row.get('OREB',  0)),
        'dreb':       int(row.get('DREB',  0)),
        'tov':        int(row.get('TOV',   0)),
        'fg_pct':     float(row.get('FG_PCT',  0.0) or 0.0),
        'fg3_pct':    float(row.get('FG3_PCT', 0.0) or 0.0),
        'plus_minus': int(row.get('PLUS_MINUS', 0) or 0),
    }


def sync_player_stats(player_id: int, db: Session) -> bool:
    """Fetch last-20 game logs from nba_api and store all stats in DB."""
    try:
        gl = playergamelog.PlayerGameLog(player_id=player_id, timeout=60)
        df = gl.get_data_frames()[0].head(20)

        # Safe upsert: only INSERT if the player doesn't already exist
        p = db.query(Player).filter(Player.id == player_id).first()
        if not p:
            try:
                p = Player(id=player_id, first_name="Unknown",
                           last_name="Player", full_name="Unknown Player")
                db.add(p)
                db.flush()  # flush to catch constraint before commit
            except Exception:
                db.rollback()
                p = db.query(Player).filter(Player.id == player_id).first()

        # Wipe old logs for this player before re-inserting
        db.query(GameLog).filter(GameLog.player_id == player_id).delete()

        seen = set()
        for _, row in df.iterrows():
            d = _parse_gamelog_row(row)
            if d['game_id'] in seen:
                continue
            seen.add(d['game_id'])

            # Look up team IDs from abbreviations
            home_team_data = team_lookup.get(d['home_abbr'], {})
            visitor_team_data = team_lookup.get(d['visit_abbr'], {})
            home_team_id = home_team_data.get('id')
            visitor_team_id = visitor_team_data.get('id')

            # Upsert Game record
            g = db.query(Game).filter(Game.id == d['game_id']).first()
            if not g:
                g = Game(
                    id=d['game_id'],
                    game_date=d['iso_date'],
                    home_team_id=home_team_id,
                    home_team_abbreviation=d['home_abbr'],
                    visitor_team_id=visitor_team_id,
                    visitor_team_abbreviation=d['visit_abbr'],
                    status="Final"
                )
                db.add(g)

            log = GameLog(
                player_id=player_id, game_id=d['game_id'],
                pts=d['pts'], reb=d['reb'], ast=d['ast'], fg3m=d['fg3m'],
                stl=d['stl'], blk=d['blk'], oreb=d['oreb'], dreb=d['dreb'],
                tov=d['tov'], fg_pct=d['fg_pct'], fg3_pct=d['fg3_pct'],
                plus_minus=d['plus_minus'], mins=d['mins']
            )
            db.add(log)

        # Refresh cache timestamp
        meta = db.query(CacheMeta).filter(
            CacheMeta.key == f"player_stats:{player_id}").first()
        if meta:
            meta.updated_at = datetime.utcnow()
        else:
            db.add(CacheMeta(key=f"player_stats:{player_id}"))

        db.commit()
        return True
    except Exception as e:
        logger.error(f"sync_player_stats failed for {player_id}: {e}")
        db.rollback()
        return False


# ── Background cron ────────────────────────────────────────────────────────────
def fetch_daily_data_background():
    """Runs every 12 h to pre-warm team defensive stats."""
    logger.info("Cron: refreshing team stats …")
    db = SessionLocal()
    try:
        _sync_team_defense(db)
        logger.info("Cron: done.")
    except Exception as e:
        logger.error(f"Cron failed: {e}")
        db.rollback()
    finally:
        db.close()


def _safe_float(val, default=None):
    """Convert to float; return default only if truly missing/None (not if val==0)."""
    if val is None or val == '' or (isinstance(val, float) and math.isnan(val)):
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


@auto_retry
def _sync_team_defense(db: Session):
    """
    Pull real Pace, Off/Def Rating from LeagueDashTeamStats.
    Uses two calls:
      1. Advanced  → PACE, OFF_RATING, DEF_RATING, NET_RATING
      2. Base/PerGame → W, L, TEAM_ABBREVIATION, OPP_PTS
    """
    try:
        # Advanced measure gives PACE, DEF_RATING, OFF_RATING, NET_RATING
        ts_adv = leaguedashteamstats.LeagueDashTeamStats(
            per_mode_detailed='PerGame',
            measure_type_detailed_defense='Advanced',
            timeout=60
        )
        df_adv = ts_adv.get_data_frames()[0]
    except Exception as e:
        logger.error(f"_sync_team_defense Advanced call failed: {e}")
        df_adv = None

    try:
        # Base gives W, L, TEAM_ABBREVIATION (always present in base)
        ts_base = leaguedashteamstats.LeagueDashTeamStats(
            per_mode_detailed='PerGame',
            timeout=60
        )
        df_base = ts_base.get_data_frames()[0]
    except Exception as e:
        logger.error(f"_sync_team_defense Base call failed: {e}")
        df_base = None

    # Use advanced df if available (it has all ratings), fall back to base
    df = df_adv if df_adv is not None else df_base
    if df is None:
        logger.error("Both team-defense calls failed — skipping sync")
        return

    # Build a base lookup by team_id for W/L and abbreviation
    base_lookup = {}
    if df_base is not None:
        for _, r in df_base.iterrows():
            base_lookup[int(r['TEAM_ID'])] = r

    # Sort by DEF_RATING ascending (lower = better D) to compute rank
    def_col = 'DEF_RATING' if 'DEF_RATING' in df.columns else None
    if def_col:
        df = df.copy().sort_values(def_col)
        df = df.reset_index(drop=True)
        df['DEF_RANK'] = range(1, len(df) + 1)
    else:
        df['DEF_RANK'] = 15  # fallback

    for _, row in df.iterrows():
        team_id = int(row['TEAM_ID'])

        # Use static team map (team_id_lookup is built at module load from nba_api.stats.static.teams)
        # leaguedashteamstats does NOT include TEAM_ABBREVIATION, only TEAM_NAME
        static_team = team_id_lookup.get(team_id, {})
        abbr = static_team.get('abbreviation') or str(row.get('TEAM_NAME', str(team_id)).split()[-1])
        base_row = base_lookup.get(team_id)

        rec = db.query(TeamStat).filter(TeamStat.team_id == team_id).first()
        if not rec:
            rec = TeamStat(team_id=team_id)
            db.add(rec)

        rec.team_abbreviation = abbr
        rec.team_name         = str(row.get('TEAM_NAME', abbr))
        # FIX: Use _safe_float — the old `float(val) or None` would set 0.0 → None
        rec.pace           = _safe_float(row.get('PACE'))
        rec.off_rating     = _safe_float(row.get('OFF_RATING'))
        rec.def_rating     = _safe_float(row.get('DEF_RATING'))
        rec.net_rating     = _safe_float(row.get('NET_RATING'))
        rec.def_rating_rank = int(row.get('DEF_RANK', 15))

        # Wins / losses from base lookup
        if base_row is not None:
            rec.wins   = int(base_row.get('W', 0) or 0)
            rec.losses = int(base_row.get('L', 0) or 0)

    meta_key = "team_defense_stats"
    meta = db.query(CacheMeta).filter(CacheMeta.key == meta_key).first()
    if meta:
        meta.updated_at = datetime.utcnow()
    else:
        db.add(CacheMeta(key=meta_key))

    db.commit()
    logger.info(f"Team defense synced for {len(df)} teams.")


# ── App startup ────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Environment validation ────
    if not ODDS_API_KEY:
        logger.warning(
            "⚠️  ODDS_API_KEY not set in environment (.env file). "
            "The-Odds-API integration is disabled. Set ODDS_API_KEY=your_key to enable real sportsbook odds. "
            "Running in demo mode with mock odds data."
        )
    else:
        logger.info(f"✓ ODDS_API_KEY configured. Using real sportsbook odds from The-Odds-API.")
    
    # Sync team defense immediately on startup (in background so server is ready fast)
    def _startup_sync():
        time.sleep(3)  # let server fully start first
        logger.info("Startup: syncing team defense stats…")
        db = SessionLocal()
        try:
            _sync_team_defense(db)
            logger.info("Startup: team defense sync complete.")
        except Exception as e:
            logger.error(f"Startup team sync failed: {e}")
        finally:
            db.close()

    threading.Thread(target=_startup_sync, daemon=True).start()

    scheduler = BackgroundScheduler()
    scheduler.add_job(fetch_daily_data_background, 'interval', hours=12)
    scheduler.start()
    logger.info("Background scheduler started.")
    yield
    scheduler.shutdown()

app = FastAPI(title="NBA Analytics PropEdge API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# ──────────────────────────────────────────────────────────────────────────────
# ENDPOINTS
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/")
def read_root():
    return {"message": "NBA Analytics PropEdge API — Live"}


# ── Player Search ─────────────────────────────────────────────────────────────
@app.get("/api/players")
@auto_retry
def search_players(search: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """Search NBA players by name with 1-hour DB cache."""
    term      = search.lower()
    cache_key = f"player_search:{term}"
    meta      = db.query(CacheMeta).filter(CacheMeta.key == cache_key).first()

    if meta and is_cache_valid(meta.updated_at, CACHE_TTL_STATS):
        db_players = (db.query(Player)
                        .filter(Player.full_name.ilike(f"%{term}%"))
                        .limit(8).all())
        if db_players:
            results = []
            for p in db_players:
                t_info = team_lookup.get(p.team_abbreviation or '', {})
                results.append({
                    "id": p.id,
                    "first_name": p.first_name,
                    "last_name":  p.last_name,
                    "full_name":  p.full_name,
                    "position":   p.position,
                    "team": {
                        "id":           t_info.get("id", 0),
                        "abbreviation": p.team_abbreviation,
                        "full_name":    t_info.get("full_name", p.team_abbreviation)
                    }
                })
            return {"data": results}

    # Cache miss → query nba_api static list (instant, no rate limit)
    all_nba = players.get_players()
    matched  = [p for p in all_nba if term in p['full_name'].lower()][:8]

    results = []
    for p in matched:
        p_rec = db.query(Player).filter(Player.id == p['id']).first()
        if not p_rec:
            p_rec = Player(
                id=p['id'], first_name=p['first_name'],
                last_name=p['last_name'], full_name=p['full_name'],
                position="", team_abbreviation=""
            )
            db.add(p_rec)
        results.append({
            "id": p['id'],
            "first_name": p['first_name'],
            "last_name":  p['last_name'],
            "full_name":  p['full_name'],
            "position":   p_rec.position or "",
            "team": {
                "id":           0,
                "abbreviation": p_rec.team_abbreviation or "",
                "full_name":    ""
            }
        })

    if meta:
        meta.updated_at = datetime.utcnow()
    else:
        db.add(CacheMeta(key=cache_key))
    db.commit()
    return {"data": results}


# ── Player Bio / Details ──────────────────────────────────────────────────────
@app.get("/api/players/{player_id}")
@auto_retry
def get_player_details(player_id: int, db: Session = Depends(get_db)):
    """
    Return player bio: name, team, position, height, weight, jersey, etc.
    Cached for 24 h per player.
    """
    cache_key = f"player_bio:{player_id}"
    meta      = db.query(CacheMeta).filter(CacheMeta.key == cache_key).first()
    p_rec     = db.query(Player).filter(Player.id == player_id).first()

    if meta and is_cache_valid(meta.updated_at, CACHE_TTL_PLAYER) and p_rec and p_rec.team_abbreviation:
        t_info = team_lookup.get(p_rec.team_abbreviation or '', {})
        return {"data": _player_to_dict(p_rec, t_info)}

    # Fetch from nba_api
    try:
        info     = commonplayerinfo.CommonPlayerInfo(player_id=player_id)
        info_df  = info.get_data_frames()[0]
        if info_df.empty:
            raise HTTPException(status_code=404, detail="Player not found")

        row = info_df.iloc[0]

        if not p_rec:
            p_rec = Player(id=player_id)
            db.add(p_rec)

        # Populate all fields
        p_rec.first_name      = str(row.get('FIRST_NAME', ''))
        p_rec.last_name       = str(row.get('LAST_NAME',  ''))
        p_rec.full_name       = f"{p_rec.first_name} {p_rec.last_name}".strip()
        p_rec.position        = str(row.get('POSITION',   ''))
        p_rec.jersey_number   = str(row.get('JERSEY',     ''))
        p_rec.height          = str(row.get('HEIGHT',     ''))
        p_rec.weight          = str(row.get('WEIGHT',     ''))
        p_rec.country         = str(row.get('COUNTRY',    ''))
        p_rec.school          = str(row.get('SCHOOL',     ''))
        p_rec.experience      = int(row.get('SEASON_EXP', 0) or 0)
        p_rec.is_active       = str(row.get('ROSTERSTATUS', 'Inactive')) == 'Active'
        p_rec.injury_status   = 'Active' if p_rec.is_active else 'Inactive'

        # Team info
        team_abbr = str(row.get('TEAM_ABBREVIATION', ''))
        team_id   = int(row.get('TEAM_ID', 0) or 0)
        p_rec.team_abbreviation = team_abbr
        p_rec.team_id           = team_id

        if meta:
            meta.updated_at = datetime.utcnow()
        else:
            db.add(CacheMeta(key=cache_key))

        db.commit()
        t_info = team_lookup.get(team_abbr, {})
        return {"data": _player_to_dict(p_rec, t_info)}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"commonplayerinfo failed for {player_id}: {e}")
        if p_rec:
            t_info = team_lookup.get(p_rec.team_abbreviation or '', {})
            return {"data": _player_to_dict(p_rec, t_info)}
        raise HTTPException(status_code=500, detail="Failed to fetch player info")


def _player_to_dict(p: Player, t_info: dict) -> dict:
    return {
        "id":           p.id,
        "first_name":   p.first_name or "",
        "last_name":    p.last_name  or "",
        "full_name":    p.full_name  or "",
        "position":     p.position   or "",
        "jersey_number":p.jersey_number or "",
        "height":       p.height  or "",
        "weight":       p.weight  or "",
        "country":      p.country or "",
        "experience":   p.experience or 0,
        "is_active":    p.is_active,
        "injury_status":p.injury_status or "Active",
        "team": {
            "id":           t_info.get("id", p.team_id or 0),
            "abbreviation": p.team_abbreviation or "",
            "full_name":    t_info.get("full_name", "")
        }
    }


# ── Player Stats / Game Logs ──────────────────────────────────────────────────
@app.get("/api/stats")
@auto_retry
def get_player_stats(
    player_ids: list[int] = Query(None, alias="player_ids[]"),
    db: Session = Depends(get_db)
):
    """Return last-20 game logs (all stats) for a player."""
    if not player_ids:
        raise HTTPException(status_code=400, detail="Missing player_id")

    player_id  = player_ids[0]
    cache_key  = f"player_stats:{player_id}"
    meta       = db.query(CacheMeta).filter(CacheMeta.key == cache_key).first()

    if meta and is_cache_valid(meta.updated_at, CACHE_TTL_STATS):
        logs = (db.query(GameLog)
                  .filter(GameLog.player_id == player_id)
                  .order_by(GameLog.id.desc())
                  .limit(20).all())
        if logs:
            return {"data": [_log_to_dict(l) for l in logs]}

    # Cache miss → fetch from nba_api
    try:
        success = sync_player_stats(player_id, db)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to fetch stats")

        logs = (db.query(GameLog)
                  .filter(GameLog.player_id == player_id)
                  .order_by(GameLog.id.desc())
                  .limit(20).all())
        return {"data": [_log_to_dict(l) for l in logs]}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_player_stats error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch player stats")


def _log_to_dict(log: GameLog) -> dict:
    g = log.game
    return {
        "id": str(log.game_id),
        "player_id": log.player_id,
        "team": {
            "id": log.player.team_id if log.player else None,
            "abbreviation": log.player.team_abbreviation if log.player else ""
        },
        "game": {
            "date":         g.game_date if g else "2024-01-01",
            "home_team":    {"id": g.home_team_id if g else None, "abbreviation": g.home_team_abbreviation  if g else ""},
            "visitor_team": {"id": g.visitor_team_id if g else None, "abbreviation": g.visitor_team_abbreviation if g else ""},
            "home_team_id": g.home_team_id if g else None,
            "visitor_team_id": g.visitor_team_id if g else None,
            "home_team_score": g.home_team_score if g else None,
            "visitor_team_score": g.visitor_team_score if g else None,
        },
        "pts":        log.pts        or 0,
        "reb":        log.reb        or 0,
        "ast":        log.ast        or 0,
        "fg3m":       log.fg3m       or 0,
        "stl":        log.stl        or 0,
        "blk":        log.blk        or 0,
        "oreb":       log.oreb       or 0,
        "dreb":       log.dreb       or 0,
        "tov":        log.tov        or 0,
        "fg_pct":     log.fg_pct     or 0.0,
        "fg3_pct":    log.fg3_pct    or 0.0,
        "plus_minus": log.plus_minus or 0,
        "min":        log.mins       or "0:00",
    }


# ── Today's Games / Scoreboard ────────────────────────────────────────────────
@app.get("/api/games")
@auto_retry
def get_daily_games(
    dates: list[str] = Query(None, alias="dates[]"),
    db: Session = Depends(get_db)
):
    """Today's scoreboard with win probabilities."""
    import zoneinfo
    
    if dates:
        target_date = dates[0]
    else:
        now_et = datetime.now(zoneinfo.ZoneInfo("America/New_York"))
        target_date = now_et.strftime('%Y-%m-%d')
        
    cache_key   = f"daily_games:{target_date}"
    meta        = db.query(CacheMeta).filter(CacheMeta.key == cache_key).first()

    if meta and is_cache_valid(meta.updated_at, CACHE_TTL_STATS):
        games = db.query(Game).filter(Game.game_date == target_date).all()
        
        # If any cached game is currently live (not 'Final' and not a scheduled time like '7:00 pm ET'),
        # we must force a refresh instead of serving the cache, so it can correctly reach 'Final'.
        force_refresh = False
        if games:
            for g in games:
                s = (g.status or "").lower()
                if "final" not in s and "et" not in s and "tbd" not in s and s.strip() != "":
                    force_refresh = True
                    break
        
        if games and not force_refresh:
            results = []
            for g in games:
                h  = db.query(TeamStat).filter(TeamStat.team_id == g.home_team_id).first()
                v  = db.query(TeamStat).filter(TeamStat.team_id == g.visitor_team_id).first()
                results.append(_game_to_dict(g, h, v))
            return {"data": results}

    # Cache miss → pull from nba_api
    try:
        fmt   = datetime.strptime(target_date, '%Y-%m-%d').strftime('%m/%d/%Y')
        board = scoreboardv2.ScoreboardV2(game_date=fmt)
        g_df  = board.get_data_frames()[0]
        l_df  = board.get_data_frames()[1]

        results   = []
        seen_games = set()
        all_roster_teams = []

        for _, row in g_df.iterrows():
            gid = row['GAME_ID']
            if gid in seen_games:
                continue
            seen_games.add(gid)

            home_id    = row['HOME_TEAM_ID']
            visitor_id = row['VISITOR_TEAM_ID']

            # Scores from linescore
            h_pts_s = l_df[(l_df['GAME_ID'] == gid) & (l_df['TEAM_ID'] == home_id)]['PTS'].values
            v_pts_s = l_df[(l_df['GAME_ID'] == gid) & (l_df['TEAM_ID'] == visitor_id)]['PTS'].values
            home_score = int(h_pts_s[0]) if len(h_pts_s) > 0 and not pd.isna(h_pts_s[0]) else None
            vis_score  = int(v_pts_s[0]) if len(v_pts_s) > 0 and not pd.isna(v_pts_s[0]) else None

            # Abbreviations
            h_abbr_s = l_df[l_df['TEAM_ID'] == home_id]['TEAM_ABBREVIATION'].values
            v_abbr_s = l_df[l_df['TEAM_ID'] == visitor_id]['TEAM_ABBREVIATION'].values
            home_abbr = h_abbr_s[0] if len(h_abbr_s) else f"TM{home_id}"
            vis_abbr  = v_abbr_s[0] if len(v_abbr_s) else f"TM{visitor_id}"

            # Upsert Game
            g_rec = db.query(Game).filter(Game.id == gid).first()
            if not g_rec:
                g_rec = Game(id=gid)
                db.add(g_rec)
            g_rec.game_date                = target_date
            g_rec.home_team_id             = home_id
            g_rec.home_team_abbreviation   = home_abbr
            g_rec.home_team_score          = home_score
            g_rec.visitor_team_id          = visitor_id
            g_rec.visitor_team_abbreviation= vis_abbr
            g_rec.visitor_team_score       = vis_score
            g_rec.status                   = row['GAME_STATUS_TEXT']

            # Team stats for win probability
            h_stats = db.query(TeamStat).filter(TeamStat.team_id == home_id).first()
            v_stats = db.query(TeamStat).filter(TeamStat.team_id == visitor_id).first()
            win_prob = calculate_win_probability(h_stats, v_stats)

            home_tm = team_id_lookup.get(home_id, {"full_name": home_abbr})
            vis_tm  = team_id_lookup.get(visitor_id, {"full_name": vis_abbr})

            results.append({
                "id":     gid,
                "date":   target_date,
                "status": row['GAME_STATUS_TEXT'],
                "win_probability": win_prob,
                "home_team": {
                    "id":           home_id,
                    "abbreviation": home_abbr,
                    "full_name":    home_tm.get("full_name", ""),
                    "score":        home_score
                },
                "visitor_team": {
                    "id":           visitor_id,
                    "abbreviation": vis_abbr,
                    "full_name":    vis_tm.get("full_name", ""),
                    "score":        vis_score
                }
            })

            # Collect teams for single background pre-warm
            all_roster_teams.append((int(home_id), home_abbr))
            all_roster_teams.append((int(visitor_id), vis_abbr))

        # Kick off roster pre-warm in ONE background thread
        unique_teams = list(dict.fromkeys(all_roster_teams))
        
        if unique_teams:
            def _prewarm(teams, date_str):
                _db = SessionLocal()
                try:
                    for t_id, t_abbr in teams:
                        try:
                            time.sleep(0.6)  # respect NBA API rate limit
                            roster_df = commonteamroster.CommonTeamRoster(
                                team_id=t_id, timeout=30).get_data_frames()[0]
                            for _, r in roster_df.head(8).iterrows():
                                p_id = int(r['PLAYER_ID'])
                                p    = _db.query(Player).filter(Player.id == p_id).first()
                                if not p:
                                    name  = str(r['PLAYER'])
                                    parts = name.split(' ', 1)
                                    p = Player(
                                        id=p_id, full_name=name,
                                        first_name=parts[0],
                                        last_name=parts[1] if len(parts) > 1 else '',
                                        team_abbreviation=t_abbr,
                                        position=str(r.get('POSITION', ''))
                                    )
                                    _db.add(p)
                                else:
                                    p.team_abbreviation = t_abbr
                                n_logs = _db.query(GameLog).filter(GameLog.player_id == p_id).count()
                                if n_logs < 5:
                                    time.sleep(0.6)
                                    sync_player_stats(p_id, _db)
                            _db.commit()
                        except Exception as re:
                            logger.warning(f"Pre-warm failed for {t_abbr}: {re}")
                            _db.rollback()
                finally:
                    _db.close()

            threading.Thread(
                target=_prewarm,
                args=(unique_teams, target_date),
                daemon=True
            ).start()

        if meta:
            meta.updated_at = datetime.utcnow()
        else:
            db.add(CacheMeta(key=cache_key))
        db.commit()
        return {"data": results}

    except Exception as e:
        logger.error(f"scoreboard failed: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to fetch scoreboard")


def _game_to_dict(g: Game, h_stats, v_stats) -> dict:
    win_prob = calculate_win_probability(h_stats, v_stats)
    home_tm  = team_id_lookup.get(g.home_team_id or 0,    {"full_name": g.home_team_abbreviation})
    vis_tm   = team_id_lookup.get(g.visitor_team_id or 0, {"full_name": g.visitor_team_abbreviation})
    return {
        "id":     g.id,
        "date":   g.game_date,
        "status": g.status,
        "win_probability": win_prob,
        "home_team": {
            "id":           g.home_team_id,
            "abbreviation": g.home_team_abbreviation,
            "full_name":    home_tm.get("full_name", ""),
            "score":        g.home_team_score
        },
        "visitor_team": {
            "id":           g.visitor_team_id,
            "abbreviation": g.visitor_team_abbreviation,
            "full_name":    vis_tm.get("full_name", ""),
            "score":        g.visitor_team_score
        }
    }


# ── Team Defense ──────────────────────────────────────────────────────────────
@app.get("/api/teams/defense")
@auto_retry
def get_team_defense(db: Session = Depends(get_db)):
    """Real team pace, off/def rating, and rank — cached 24 h."""
    cache_key = "team_defense_stats"
    meta      = db.query(CacheMeta).filter(CacheMeta.key == cache_key).first()

    if meta and is_cache_valid(meta.updated_at, CACHE_TTL_TEAMS):
        all_ts = db.query(TeamStat).all()
        if all_ts:
            return {"data": {
                t.team_abbreviation: {
                    "pace":          t.pace,
                    "offRating":     t.off_rating,
                    "defRating":     t.def_rating,
                    "netRating":     t.net_rating,
                    "defRatingRank": t.def_rating_rank,
                    "oppPtsPg":      t.opp_pts_pg,
                    "wins":          t.wins,
                    "losses":        t.losses,
                } for t in all_ts
            }}

    try:
        _sync_team_defense(db)
        all_ts = db.query(TeamStat).all()
        return {"data": {
            t.team_abbreviation: {
                "pace":          t.pace,
                "offRating":     t.off_rating,
                "defRating":     t.def_rating,
                "netRating":     t.net_rating,
                "defRatingRank": t.def_rating_rank,
                "oppPtsPg":      t.opp_pts_pg,
                "wins":          t.wins,
                "losses":        t.losses,
            } for t in all_ts
        }}
    except Exception as e:
        logger.error(f"team defense failed: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to fetch team stats")


# ── Best Prop Recommendation ──────────────────────────────────────────────────
PROP_STATS = [
    # (db_attr, label, is_discrete, implied_break_even)
    ("pts",  "PTS",  False, 52.4),
    ("reb",  "REB",  True,  52.4),
    ("ast",  "AST",  True,  52.4),
    ("fg3m", "3PT",  True,  52.4),
    ("stl",  "STL",  True,  52.4),
    ("blk",  "BLK",  True,  52.4),
]

@app.get("/api/props/best")
@auto_retry
def get_best_prop(db: Session = Depends(get_db)):
    """Elite Prop Recommendation Engine — covers PTS, REB, AST, 3PT, STL, BLK."""
    today = datetime.utcnow().strftime('%Y-%m-%d')

    # Only suggest props for players active today
    active_games = db.query(Game).filter(Game.game_date == today).all()
    active_teams = set()
    for g in active_games:
        if g.home_team_abbreviation:    active_teams.add(g.home_team_abbreviation)
        if g.visitor_team_abbreviation: active_teams.add(g.visitor_team_abbreviation)

    if not active_teams:
        return {"data": None, "message": "No games scheduled for today."}

    playing_today = (db.query(Player)
                       .filter(Player.team_abbreviation.in_(active_teams)).all())

    # Fetch live Vegas odds (and persist to OddsHistory)
    vegas_odds = fetch_real_vegas_odds(db)

    recommendations = []
    for player in playing_today:
        logs = (db.query(GameLog)
                  .filter(GameLog.player_id == player.id)
                  .order_by(GameLog.id.desc()).all())
        if len(logs) < 10:
            continue

        # Injury / activity gate — if last game > 14 days ago, skip
        try:
            last_date = datetime.strptime(logs[0].game.game_date, '%Y-%m-%d')
            if (datetime.utcnow() - last_date).days > 14:
                continue
        except Exception:
            continue

        # Find this player's game today → get opponent
        player_game = next(
            (g for g in active_games
             if g.home_team_abbreviation    == player.team_abbreviation
             or g.visitor_team_abbreviation == player.team_abbreviation),
            None
        )
        opponent_abbr = None
        opp_stats     = None
        if player_game:
            opponent_abbr = (player_game.visitor_team_abbreviation
                             if player.team_abbreviation == player_game.home_team_abbreviation
                             else player_game.home_team_abbreviation)
            opp_stats = (db.query(TeamStat)
                           .filter(TeamStat.team_abbreviation == opponent_abbr).first())

        mapped_name = player_name_mapper(player.full_name)
        player_vegas = vegas_odds.get(mapped_name, {})

        for stat_attr, stat_label, is_discrete, default_breakeven in PROP_STATS:
            arr = [getattr(l, stat_attr, 0) or 0 for l in logs]
            if max(arr) == 0:
                continue  # Player never records this stat — skip

            avg_val  = statistics.mean(arr)
            if avg_val < 0.5:
                continue  # Avoid trivially small props
                
            # Check Vegas mapping
            vegas_prop = player_vegas.get(stat_label)
            if vegas_prop:
                line = vegas_prop["line"]
                odds_american = vegas_prop['odds']
                odds_str = f"{odds_american}" if odds_american < 0 else f"+{odds_american}"
                implied_prob = vegas_prop["implied_prob"]
                is_real_line = True
            else:
                line = round(avg_val - 0.5) + 0.5
                odds_american = -110  # Simulated flat line
                odds_str = "-110"
                implied_prob = default_breakeven
                is_real_line = False

            # ─ PHASE 2: Enhanced Analytics ─
            consistency = calculate_consistency_score(arr)
            
            # ML Probability model
            model_prob = train_and_predict_prop(logs, stat_attr, line)

            # Monte Carlo with consistency weighting
            consistency_weight = max(0.0, min(1.0, consistency / 100.0))
            mc_prob = run_monte_carlo(arr, line, consistency_weight=consistency_weight)

            # Context adjustments
            modifier, factors = get_rest_and_splits(logs)
            modifier, factors = apply_matchup_penalty(
                modifier, factors, opp_stats, opponent_abbr or "OPP")

            final_prob = model_prob * (1 + modifier)
            final_prob = min(max(final_prob, 5.0), 95.0)

            # Calculate EV and Kelly Criterion
            ev_kelly = calculate_ev_and_kelly(final_prob, implied_prob, odds_american)
            
            # Calculate unified confidence score
            hit_rates_l10 = arr[-10:] if len(arr) >= 10 else arr
            hit_rate_l10 = (sum(1 for v in hit_rates_l10 if v > line) / len(hit_rates_l10) * 100) if hit_rates_l10 else 50
            hit_rate_l5 = (sum(1 for v in arr[-5:] if v > line) / min(5, len(arr)) * 100) if arr else 50
            
            matchup_modifier = 50 + (modifier * 50)  # Convert -1 to +1 scale into 0-100 confidence
            matchup_modifier = max(0, min(100, matchup_modifier))
            
            conf_score = calculate_confidence_score(
                hit_rates={'l5': hit_rate_l5, 'l10': hit_rate_l10, 'l20': 50},
                consistency=consistency,
                matchup_rating=matchup_modifier,
                mc_prob=mc_prob
            )

            # ─ PHASE 2.5: Minutes Projection & Explanation ─
            minutes_proj = calculate_minutes_projection(logs, opp_stats.pace if opp_stats else 100.0)
            
            # Minutes-based probability adjustment
            if minutes_proj['projected_minutes'] < 15:
                final_prob *= 0.85  # Significant minutes reduction
            elif minutes_proj['projected_minutes'] < 20:
                final_prob *= 0.92  # Moderate minutes reduction
            elif minutes_proj['projected_minutes'] > 40:
                final_prob *= 1.08  # Full usage boost
            
            final_prob = min(max(final_prob, 5.0), 95.0)
            
            # Recalculate EV/Kelly with adjusted probability
            ev_kelly = calculate_ev_and_kelly(final_prob, implied_prob, odds_american)
            
            # Generate explanation
            opp_text = opponent_abbr or "TBD"
            if opp_stats and opp_stats.def_rating_rank:
                rank = opp_stats.def_rating_rank
                if rank <= 10:
                    opp_text += " (elite defense rank)"
                elif rank >= 20:
                    opp_text += " (weak defense rank)"
            
            # Build component breakdown for explainability
            component_breakdown = {
                'form_boost': (hit_rate_l5 - 50) * 0.1,  # How much recent form boosts edge
                'matchup_boost': (matchup_modifier - 50) * 0.08,  # Matchup advantage
                'minutes_adjustment': (minutes_proj['projected_minutes'] - 30) * 0.02,  # Minutes impact
                'consistency_boost': (consistency - 50) * 0.04  # Consistency impact
            }
            
            explanation = generate_pick_explanation(
                player_name=mapped_name,
                stat_label=stat_label,
                line=line,
                ev_perc=ev_kelly['ev_percentage'],
                confidence=conf_score['confidence_score'],
                hit_rate_l5=hit_rate_l5,
                hit_rate_l10=hit_rate_l10,
                opponent_text=opp_text,
                minutes_info=minutes_proj,
                component_breakdown=component_breakdown
            )

            # Determine category by EV and Kelly
            category = "High Edge"
            if ev_kelly['kelly_quarter'] > 0.05:
                category = "High Edge"
            elif ev_kelly['kelly_quarter'] > 0.02:
                category = "Medium Edge"
            elif ev_kelly['kelly_quarter'] > 0.005:
                category = "Low Edge"
            else:
                category = "Fade"

            recommendations.append({
                "player":      mapped_name,
                "playerId":    player.id,
                "team":        player.team_abbreviation,
                "prop":        f"Over {line} {stat_label}",
                "stat":        stat_label,
                "line":        line,
                "odds":        odds_str,
                "isRealVegas": is_real_line,
                "probability": round(final_prob, 1),
                "breakeven":   round(implied_prob, 1),
                "monteCarlo":  mc_prob,
                "consistency": round(consistency, 1),
                # PHASE 2: New metrics
                "ev_percentage": ev_kelly['ev_percentage'],
                "kelly_fraction_quarter": ev_kelly['kelly_quarter'],
                "confidence_score": round(conf_score['confidence_score'], 1),
                "confidence_rating": conf_score['rating'],
                "recommended_units": ev_kelly['recommended_units'],
                # PHASE 2.5: Minutes & Explanation
                "projected_minutes": minutes_proj['projected_minutes'],
                "minutes_confidence": minutes_proj['confidence'],
                "explanation": explanation,
                # Legacy fields for backward compatibility
                "confidence":  conf_score['confidence_rating'],
                "edge":        f"+{round(max(ev_kelly['ev_percentage'],0),1)}%" if ev_kelly['ev_percentage'] >= 0 else f"{round(ev_kelly['ev_percentage'],1)}%",
                "edgeValue":   round(ev_kelly['ev_percentage'], 1),
                "factors":     factors[:3],
                "category":    category,
                "opponent":    opponent_abbr or "TBD",
            })
    
    # Persist edge analysis for all recommendations (Phase 3 + 2.5)
    try:
        for rec in recommendations:
            edge = EdgeAnalysis(
                player_id=rec['playerId'],
                stat_category=rec['stat'],
                model_probability=rec['probability'],
                implied_probability=rec['breakeven'],
                ev_percentage=rec['ev_percentage'],
                kelly_fraction_full=rec['kelly_fraction_quarter'] * 4,  # Reverse quarter calculation
                kelly_fraction_quarter=rec['kelly_fraction_quarter'],
                confidence_score=rec['confidence_score'],
                confidence_rating=rec['rating'],
                # Phase 2.5 additions
                projected_minutes=rec.get('projected_minutes'),
                opening_line=rec['line'],
                opening_odds=rec['odds'],
                pick_explanation=rec.get('explanation', '')
            )
            db.add(edge)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to persist edge analysis: {e}")
        db.rollback()
    
    recommendations.sort(key=lambda x: (x['ev_percentage'], x['confidence_score']), reverse=True)

    if not recommendations:
        return {"data": None, "message": "Not enough data for today's games yet."}

    return {"data": recommendations[0]}


# ── The-Odds-API Integration ──────────────────────────────────────────────────
def fetch_real_vegas_odds(db: Session = None):
    """
    Fetches real player props from The-Odds-API using correct two-step endpoint.
    Step 1: Get event IDs from /events
    Step 2: Get player props from /events/{id}/odds
    Persists odds history to the database for line movement tracking.
    Returns: dict of { "player_name": { "PTS": {"line": 25.5, "odds": -110, "implied_prob": 52.4}, ... } }
    """
    if not ODDS_API_KEY:
        logger.warning("ODDS_API_KEY not set in environment - using mock data for demo purposes")
        return {}
        
    global _odds_cache
    if _odds_cache.get('ts') and (datetime.utcnow() - _odds_cache['ts']) < timedelta(hours=1):
        return _odds_cache['data']

    PLAYER_MARKETS = [
        "player_points", "player_rebounds", "player_assists",
        "player_threes", "player_steals", "player_blocks"
    ]
    market_map = {
        'player_points': 'PTS',
        'player_rebounds': 'REB',
        'player_assists': 'AST',
        'player_threes': '3PT',
        'player_steals': 'STL',
        'player_blocks': 'BLK',
    }

    try:
        # Step 1: Get event IDs
        events_resp = requests.get(
            "https://api.the-odds-api.com/v4/sports/basketball_nba/events",
            params={"apiKey": ODDS_API_KEY},
            timeout=10
        )
        events_resp.raise_for_status()
        events = events_resp.json()
        
        # Fresh API fetch — reset persisted flag
        _odds_cache['persisted'] = False

        parsed_odds = {}
        odds_to_persist = []

        # Step 2: Fetch props for each event
        for event in events:
            event_id = event["id"]
            try:
                props_resp = requests.get(
                    f"https://api.the-odds-api.com/v4/sports/basketball_nba/events/{event_id}/odds",
                    params={
                        "apiKey": ODDS_API_KEY,
                        "markets": ",".join(PLAYER_MARKETS),
                        "oddsFormat": "american",
                        "bookmakers": "draftkings,fanduel",
                    },
                    timeout=10
                )
                if props_resp.status_code != 200:
                    logger.warning(f"Props fetch failed for event {event_id}: {props_resp.status_code}")
                    continue

                event_data = props_resp.json()
                for bookmaker in event_data.get("bookmakers", []):
                    for market in bookmaker.get("markets", []):
                        stat_label = market_map.get(market["key"])
                        if not stat_label:
                            continue
                        for outcome in market.get("outcomes", []):
                            if outcome["name"] != "Over":
                                continue
                            player_name = outcome["description"]
                            line = outcome.get("point")
                            price = outcome.get("price")
                            if not line or not price:
                                continue
                            if player_name not in parsed_odds:
                                parsed_odds[player_name] = {}
                            implied = (100 / (price + 100) * 100) if price > 0 else (abs(price) / (abs(price) + 100) * 100)
                            parsed_odds[player_name][stat_label] = {
                                "line": line, "odds": price, "implied_prob": round(implied, 1)
                            }
                            odds_to_persist.append({
                                "player_name": player_name, "stat_category": stat_label,
                                "line": line, "american_odds": price,
                                "implied_probability": round(implied, 1),
                                "bookmaker": bookmaker["key"]
                            })
                    break  # one bookmaker per event

            except Exception as e:
                logger.warning(f"Props fetch failed for event {event_id}: {e}")
                continue

        # Persist odds to database if db session provided
        if db and odds_to_persist and not _odds_cache.get('persisted'):
            try:
                for odds_record in odds_to_persist:
                    # Find player ID from name
                    player = db.query(Player).filter(
                        Player.full_name.ilike(f"%{odds_record['player_name']}%")
                    ).first()
                    
                    if player:
                        # Check if record already exists within last 5 minutes
                        recent = db.query(OddsHistory).filter(
                            OddsHistory.player_id == player.id,
                            OddsHistory.stat_category == odds_record['stat_category'],
                            OddsHistory.recorded_at >= datetime.utcnow() - timedelta(minutes=5)
                        ).first()
                        
                        if not recent:
                            # Insert new odds history record
                            history = OddsHistory(
                                player_id=player.id,
                                stat_category=odds_record['stat_category'],
                                current_line=odds_record['line'],
                                american_odds=odds_record['american_odds'],
                                implied_probability=odds_record['implied_probability'],
                                bookmaker=odds_record['bookmaker']
                            )
                            db.add(history)
                
                db.commit()
                logger.info(f"Persisted {len(odds_to_persist)} odds records to OddsHistory")
                _odds_cache['persisted'] = True  # Mark as persisted to prevent duplicate inserts
            except Exception as e:
                logger.error(f"Failed to persist odds to database: {e}")
                db.rollback()

        _odds_cache['data'] = parsed_odds
        _odds_cache['ts'] = datetime.utcnow()
        return parsed_odds
        
    except Exception as e:
        logger.error(f"Failed to fetch The-Odds-API: {e}")
        return {}


# ── Game-Specific Props ───────────────────────────────────────────────────────
@app.get("/api/games/{game_id}/props")
@auto_retry
def get_game_props(game_id: str, db: Session = Depends(get_db)):
    """Return calculated props for all players in a specific game."""
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    team_abbrs = [game.home_team_abbreviation, game.visitor_team_abbreviation]
    game_players = db.query(Player).filter(
        Player.team_abbreviation.in_(team_abbrs)).all()

    # Opponent map
    opp_map = {
        game.home_team_abbreviation:    game.visitor_team_abbreviation,
        game.visitor_team_abbreviation: game.home_team_abbreviation,
    }

    # Fetch live Vegas odds (and persist to OddsHistory)
    vegas_odds = fetch_real_vegas_odds(db)

    results = []
    for player in game_players:
        logs = (db.query(GameLog)
                  .filter(GameLog.player_id == player.id)
                  .order_by(GameLog.id.desc()).limit(20).all())
        if len(logs) < 5:
            continue

        opponent_abbr = opp_map.get(player.team_abbreviation, "")
        opp_stats     = (db.query(TeamStat)
                           .filter(TeamStat.team_abbreviation == opponent_abbr).first()
                         if opponent_abbr else None)

        mapped_name = player_name_mapper(player.full_name)
        player_vegas = vegas_odds.get(mapped_name, {})

        for stat_attr, stat_label, is_discrete, default_breakeven in PROP_STATS:
            arr = [getattr(l, stat_attr, 0) or 0 for l in logs]
            if max(arr) == 0 or statistics.mean(arr) < 0.5:
                continue

            avg_val = statistics.mean(arr)
            
            # Check Vegas mapping
            vegas_prop = player_vegas.get(stat_label)
            if vegas_prop:
                line = vegas_prop["line"]
                odds_str = f"{vegas_prop['odds']}" if vegas_prop['odds'] < 0 else f"+{vegas_prop['odds']}"
                breakeven = vegas_prop["implied_prob"]
                is_real_line = True
            else:
                line = round(avg_val - 0.5) + 0.5
                odds_str = "-110"  # Simulated flat line
                breakeven = default_breakeven
                is_real_line = False

            # Calculate our internal custom ML model probability
            model_prob = train_and_predict_prop(logs, stat_attr, line)

            modifier, factors = get_rest_and_splits(logs)
            modifier, factors = apply_matchup_penalty(
                modifier, factors, opp_stats, opponent_abbr)

            final_model_prob = model_prob * (1 + modifier)
            final_model_prob = min(max(final_model_prob, 5.0), 95.0)
            
            # Edge is the difference between what our model predicts vs what the sportsbooks thinks
            edge = final_model_prob - breakeven

            results.append({
                "playerId":    player.id,
                "playerName":  mapped_name,
                "team":        player.team_abbreviation,
                "stat":        stat_label,
                "prop":        f"Over {line} {stat_label}",
                "line":        line,
                "odds":        odds_str,
                "isRealVegas": is_real_line,
                "probability": round(final_model_prob, 1),
                "breakeven":   breakeven,
                "confidence":  "High" if final_model_prob >= 70 else "Medium" if final_model_prob >= 55 else "Low",
                "edge":        f"+{round(max(edge,0),1)}%" if edge >= 0 else f"{round(edge,1)}%",
                "edgeValue":   round(edge, 1),
                "factors":     factors[:2],
            })

    # Sort by probability (best first)
    results.sort(key=lambda x: x['probability'], reverse=True)
    return {"data": results}


# ── Player Shot Chart ─────────────────────────────────────────────────────────
@app.get("/api/players/{player_id}/shots")
@auto_retry
def get_player_shots(player_id: int):
    """Shot chart data grouped by zone for current season (auto-detects season)."""
    # Determine current NBA season (season starts in Oct)
    now = datetime.utcnow()
    year = now.year if now.month >= 10 else now.year - 1
    season_str = f"{year}-{str(year+1)[-2:]}"  # e.g. "2024-25"

    try:
        shot_data = shotchartdetail.ShotChartDetail(
            player_id=player_id,
            team_id=0,
            context_measure_simple='FGA',
            season_nullable=season_str
        )
        df = shot_data.get_data_frames()[0]

        if df.empty:
            return {"data": {"summary": [], "shots": [], "season": season_str}}

        zones = (df.groupby('SHOT_ZONE_RANGE')
                   .agg({'SHOT_MADE_FLAG': ['sum', 'count']})
                   .reset_index())
        zones.columns = ['zone', 'made', 'attempts']
        zones['pct']  = (zones['made'] / zones['attempts'] * 100).round(1)

        shots = (df[['LOC_X', 'LOC_Y', 'SHOT_MADE_FLAG', 'SHOT_ZONE_RANGE']]
                   .head(300).to_dict('records'))

        return {"data": {
            "summary": zones.to_dict('records'),
            "shots":   shots,
            "season":  season_str
        }}
    except Exception as e:
        logger.error(f"Shot chart failed for {player_id}: {e}")
        return {"data": {"summary": [], "shots": [], "season": season_str}}




# ── Live Scores (No Cache) ─────────────────────────────────────────────────────
@app.get("/api/games/live")
@auto_retry
def get_live_scores():
    """Always-fresh scoreboard — call this from the frontend polling loop."""
    def _safe_int(val):
        try:
            return int(val)
        except (ValueError, TypeError):
            return 0

    try:
        import zoneinfo
        now_et   = datetime.now(zoneinfo.ZoneInfo("America/New_York"))
        date_str = now_et.strftime('%m/%d/%Y')
        board    = scoreboardv2.ScoreboardV2(game_date=date_str, timeout=10)
        g_df     = board.get_data_frames()[0]
        l_df     = board.get_data_frames()[1]

        results, seen = [], set()
        for _, row in g_df.iterrows():
            gid = row['GAME_ID']
            if gid in seen:
                continue
            seen.add(gid)
            home_id    = row['HOME_TEAM_ID']
            visitor_id = row['VISITOR_TEAM_ID']

            h_pts = l_df[(l_df['GAME_ID'] == gid) & (l_df['TEAM_ID'] == home_id   )]['PTS'].values
            v_pts = l_df[(l_df['GAME_ID'] == gid) & (l_df['TEAM_ID'] == visitor_id)]['PTS'].values
            h_abr = l_df[l_df['TEAM_ID'] == home_id   ]['TEAM_ABBREVIATION'].values
            v_abr = l_df[l_df['TEAM_ID'] == visitor_id]['TEAM_ABBREVIATION'].values

            results.append({
                "id":     gid,
                "status": str(row.get('GAME_STATUS_TEXT', '')),
                "clock":  str(row.get('LIVE_PERIOD_TIME_BCAST', '')),
                "period": _safe_int(row.get('LIVE_PC_TIME', 0)),
                "home_team": {
                    "id":           int(home_id),
                    "abbreviation": str(h_abr[0]) if len(h_abr) else "",
                    "full_name":    team_id_lookup.get(int(home_id), {}).get("full_name", ""),
                    "score":        _safe_int(h_pts[0]) if len(h_pts) and h_pts[0] is not None and not pd.isna(h_pts[0]) else None
                },
                "visitor_team": {
                    "id":           int(visitor_id),
                    "abbreviation": str(v_abr[0]) if len(v_abr) else "",
                    "full_name":    team_id_lookup.get(int(visitor_id), {}).get("full_name", ""),
                    "score":        _safe_int(v_pts[0]) if len(v_pts) and v_pts[0] is not None and not pd.isna(v_pts[0]) else None
                }
            })

        return {"data": results, "as_of": datetime.utcnow().isoformat()}
    except Exception as e:
        logger.error(f"get_live_scores failed: {e}")
        raise HTTPException(status_code=500, detail="Could not fetch live scores")


# ── H2H History ────────────────────────────────────────────────────────────────
@app.get("/api/players/{player_id}/h2h")
@auto_retry
def get_player_h2h(player_id: int, opponent: str = Query(...)):
    """
    Last 10 game logs vs opponent team (searches up to 3 prior seasons).
    ?opponent=BOS  (team abbreviation)
    """
    try:
        now  = datetime.utcnow()
        year = now.year if now.month >= 10 else now.year - 1
        games_out = []

        for delta in range(3):
            yr = year - delta
            season_str = f"{yr}-{str(yr + 1)[-2:]}"
            try:
                gl  = playergamelog.PlayerGameLog(player_id=player_id, season=season_str, timeout=30)
                df  = gl.get_data_frames()[0]
                matched = df[df['MATCHUP'].str.contains(opponent.upper(), case=False, na=False)]
                for _, row in matched.iterrows():
                    try:
                        iso = datetime.strptime(str(row['GAME_DATE']), '%b %d, %Y').strftime('%Y-%m-%d')
                    except Exception:
                        iso = str(row.get('GAME_DATE', ''))
                    games_out.append({
                        "date":       iso,
                        "season":     season_str,
                        "matchup":    str(row['MATCHUP']),
                        "result":     str(row.get('WL', '')),
                        "min":        str(row.get('MIN', '0')),
                        "pts":        int(row.get('PTS',  0)),
                        "reb":        int(row.get('REB',  0)),
                        "ast":        int(row.get('AST',  0)),
                        "fg3m":       int(row.get('FG3M', 0)),
                        "stl":        int(row.get('STL',  0)),
                        "blk":        int(row.get('BLK',  0)),
                        "tov":        int(row.get('TOV',  0)),
                        "fg_pct":     float(row.get('FG_PCT', 0.0) or 0.0),
                        "plus_minus": int(row.get('PLUS_MINUS', 0) or 0),
                    })
            except Exception as se:
                logger.warning(f"H2H season {season_str} failed: {se}")

        games_out.sort(key=lambda x: x['date'], reverse=True)
        games_out = games_out[:10]

        if games_out:
            avg = lambda c: round(sum(g[c] for g in games_out) / len(games_out), 1)
            averages = {k: avg(k) for k in ['pts', 'reb', 'ast', 'fg3m', 'stl', 'blk', 'tov']}
        else:
            averages = {k: 0 for k in ['pts', 'reb', 'ast', 'fg3m', 'stl', 'blk', 'tov']}

        return {"data": {"games": games_out, "averages": averages, "opponent": opponent.upper()}}

    except Exception as e:
        logger.error(f"H2H failed {player_id} vs {opponent}: {e}")
        raise HTTPException(status_code=500, detail="H2H fetch failed")


# ── Player Splits Endpoint ─────────────────────────────────────────────────────
@app.get("/api/players/{player_id}/splits")
@auto_retry
def get_player_splits(
    player_id: int,
    stat: str = Query(...),  # e.g., 'pts', 'reb', 'ast', 'fg3m', etc.
    line: float = Query(...),  # e.g., 27.5
    opponent: str = Query(None),  # Optional opponent team for H2H filtering
    db: Session = Depends(get_db)
):
    """
    Calculate hit rate splits for a player against a target line.
    Returns L5, L10, L20, season hit rates, plus avg/median.
    
    Example: GET /api/players/2544/splits?stat=pts&line=27.5
    Optional: ?opponent=LAL for H2H filtering
    """
    try:
        # Fetch all game logs for the player (all seasons)
        logs = (db.query(GameLog)
                .filter(GameLog.player_id == player_id)
                .order_by(GameLog.id.desc())
                .all())
        
        if not logs:
            return {
                "data": {
                    "l5": {"hits": 0, "total": 0, "percentage": 0},
                    "l10": {"hits": 0, "total": 0, "percentage": 0},
                    "l20": {"hits": 0, "total": 0, "percentage": 0},
                    "h2h": {"hits": 0, "total": 0, "percentage": 0},
                    "season": {"hits": 0, "total": 0, "percentage": 0},
                    "avg": 0,
                    "median": 0,
                    "stat": stat,
                    "line": line
                }
            }
        
        # Helper function to calculate hit rate
        def calc_hits(games_list: list, stat_name: str, target_line: float) -> dict:
            valid_games = [g for g in games_list if g.mins and g.mins != '00:00' and g.mins != '0']
            if not valid_games:
                return {"hits": 0, "total": 0, "percentage": 0}
            
            stat_name_lower = stat_name.lower()
            hits = 0
            for g in valid_games:
                stat_val = getattr(g, stat_name_lower, None)
                if stat_val is not None and stat_val > target_line:
                    hits += 1
            
            total = len(valid_games)
            percentage = round((hits / total * 100)) if total > 0 else 0
            
            return {"hits": hits, "total": total, "percentage": percentage}
        
        # Helper function to get average and median
        def calc_stats(games_list: list, stat_name: str) -> tuple:
            valid_games = [g for g in games_list if g.mins and g.mins != '00:00' and g.mins != '0']
            if not valid_games:
                return 0, 0
            
            stat_name_lower = stat_name.lower()
            values = [getattr(g, stat_name_lower, 0) for g in valid_games]
            values = [v for v in values if v is not None and v > 0]
            if not values:
                return 0, 0
            
            avg = round(sum(values) / len(values), 1)
            sorted_vals = sorted(values)
            median = (sorted_vals[len(sorted_vals)//2 - 1] + sorted_vals[len(sorted_vals)//2]) / 2 if len(sorted_vals) % 2 == 0 else sorted_vals[len(sorted_vals)//2]
            median = round(median, 1)
            
            return avg, median
        
        # Filter by opponent if provided
        filtered_logs = logs
        if opponent:
            opponent_upper = opponent.upper()
            filtered_logs = [
                g for g in logs
                if g.game and (
                    g.game.home_team_abbreviation == opponent_upper or
                    g.game.visitor_team_abbreviation == opponent_upper
                )
            ]
        
        # Calculate splits
        l5_hits = calc_hits(filtered_logs[:5], stat, line)
        l10_hits = calc_hits(filtered_logs[:10], stat, line)
        l20_hits = calc_hits(filtered_logs[:20], stat, line)
        season_hits = calc_hits(filtered_logs, stat, line)
        
        # For H2H, if opponent was provided, use filtered logs; otherwise return empty
        if opponent and filtered_logs:
            h2h_hits = calc_hits(filtered_logs, stat, line)
        else:
            h2h_hits = {"hits": 0, "total": 0, "percentage": 0}
        
        avg, median = calc_stats(filtered_logs if filtered_logs else logs, stat)
        
        return {
            "data": {
                "l5": l5_hits,
                "l10": l10_hits,
                "l20": l20_hits,
                "h2h": h2h_hits,
                "season": season_hits,
                "avg": avg,
                "median": median,
                "stat": stat,
                "line": line,
                "opponent": opponent.upper() if opponent else None
            }
        }
    
    except Exception as e:
        logger.error(f"Splits endpoint failed for player {player_id} stat {stat}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to calculate splits: {str(e)}")


# ── Dashboard Summary ──────────────────────────────────────────────────────────
@app.get("/api/dashboard/summary")
def get_dashboard_summary(db: Session = Depends(get_db)):
    """
    Returns top_props, stat_leaders (L7 days), and injury_list — all from DB (fast).
    """
    try:
        from collections import defaultdict

        cutoff = (datetime.utcnow() - timedelta(days=7)).strftime('%Y-%m-%d')
        recent_game_ids = db.query(Game.id).filter(Game.game_date >= cutoff).scalar_subquery()

        logs_with_player = (
            db.query(GameLog, Player)
              .join(Player, GameLog.player_id == Player.id)
              .filter(GameLog.game_id.in_(recent_game_ids))
              .all()
        )

        # Aggregate L7 per player
        player_data = defaultdict(lambda: {"pts": [], "reb": [], "ast": [], "name": "", "team": ""})
        for log, player in logs_with_player:
            d = player_data[log.player_id]
            d["name"] = player.full_name
            d["team"] = player.team_abbreviation or ""
            if log.pts is not None: d["pts"].append(log.pts)
            if log.reb is not None: d["reb"].append(log.reb)
            if log.ast is not None: d["ast"].append(log.ast)

        def top3(stat):
            ranked = sorted(
                [(pid, d) for pid, d in player_data.items() if len(d[stat]) >= 2],
                key=lambda x: sum(x[1][stat]) / len(x[1][stat]), reverse=True
            )[:3]
            return [{"player_id": pid, "name": d["name"], "team": d["team"],
                     "avg": round(sum(d[stat]) / len(d[stat]), 1), "games": len(d[stat])}
                    for pid, d in ranked]

        stat_leaders = {"pts": top3("pts"), "reb": top3("reb"), "ast": top3("ast")}

        # ── Injury list: real data from ESPN ─────────────────────────────────────
        injury_list = []
        try:
            import requests as _req
            espn_resp = _req.get(
                "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries",
                timeout=10
            )
            espn_data = espn_resp.json()
            ORDER = {'Out': 0, 'Doubtful': 1, 'Questionable': 2, 'Day-To-Day': 3, 'IR': 4}
            
            # Map ESPN names to DB IDs for headshots
            name_to_id = {name.lower(): pid for name, pid in db.query(Player.full_name, Player.id).all() if name}
            
            for team_entry in espn_data.get('injuries', []):
                team_abbr_espn = team_entry.get('team', {}).get('abbreviation', '')
                for inj in team_entry.get('injuries', []):
                    athlete = inj.get('athlete', {})
                    status  = inj.get('status', '')
                    player_name = athlete.get('displayName', '')
                    injury_list.append({
                        'player_id': name_to_id.get(player_name.lower()),
                        'name':      player_name,
                        'team':      team_abbr_espn,
                        'status':    status,
                        'reason':    inj.get('type', {}).get('description', ''),
                        'game_date': '',
                    })
            injury_list.sort(key=lambda i: ORDER.get(i['status'], 99))
            injury_list = injury_list[:15]
        except Exception as ie:
            logger.warning(f"InjuryReport API failed, falling back to DB: {ie}")
            # Fallback: players with injury_status recorded in DB (not 'Active')
            injured_db = (
                db.query(Player)
                  .filter(
                      Player.injury_status.isnot(None),
                      Player.injury_status != '',
                      Player.injury_status != 'Active'
                  )
                  .limit(10).all()
            )
            injury_list = [
                {"player_id": p.id, "name": p.full_name,
                 "team": p.team_abbreviation or "",
                 "status": p.injury_status, "reason": "", "game_date": ""}
                for p in injured_db
            ]

        # ── Top props (DB game logs) ───────────────────────────────────
        top_props = []
        active_players = (
            db.query(Player).filter(Player.is_active == True)
              .join(GameLog, GameLog.player_id == Player.id)
              .distinct().limit(60).all()
        )
        team_stats_map = {ts.team_abbreviation: ts for ts in db.query(TeamStat).all()}

        for p in active_players:
            logs_p = (db.query(GameLog).filter(GameLog.player_id == p.id)
                        .order_by(GameLog.id.desc()).limit(20).all())
            if len(logs_p) < 5:
                continue

            # Get opponent defense modifier from team stats
            opp_stats  = None  # can't easily determine opp without today's game

            categories = [
                ("PTS", "pts", 0.92),   # line = 92% of avg (gives good hit rate)
                ("REB", "reb", 0.90),
                ("AST", "ast", 0.90),
                ("3PM", "fg3m", 0.85),
                ("STL", "stl", 0.80),
                ("BLK", "blk", 0.80),
            ]
            for cat, col, line_pct in categories:
                vals = [getattr(g, col) or 0 for g in logs_p]
                if max(vals) == 0:
                    continue   # player never records this stat
                avg  = sum(vals) / len(vals)
                if avg < 0.5:
                    continue   # not a meaningful category for this player
                line = round(avg * line_pct, 1)
                prob = calculate_probability_model(vals, line)
                if prob >= 60:  # lowered from 68 so we show props even early on
                    l5  = [v for v in vals[:5]]
                    top_props.append({
                        "player_id":   p.id,
                        "player":      p.full_name,
                        "team":        p.team_abbreviation or "",
                        "prop":        f"Over {line} {cat}",
                        "probability": round(prob, 1),
                        "edge":        round(prob - 52.4, 1),  # vs -110 breakeven
                        "l5_avg":      round(sum(l5) / len(l5), 1) if l5 else 0,
                        "l10_avg":     round(sum(vals[:10]) / min(len(vals), 10), 1),
                        "category":    cat,
                    })

        top_props.sort(key=lambda x: x["probability"], reverse=True)

        return {"data": {
            "top_props":    top_props[:5],
            "stat_leaders": stat_leaders,
            "injury_list":  injury_list,
            "as_of":        datetime.utcnow().isoformat()
        }}

    except Exception as e:
        logger.error(f"dashboard/summary failed: {e}")
        raise HTTPException(status_code=500, detail="Dashboard summary failed")


# ── Dedicated Injury Report Endpoint ─────────────────────────────────────
_injury_cache: dict = {}

@app.get("/api/injuries")
def get_injury_report(db: Session = Depends(get_db)):
    """
    Today's NBA injury report. Cached for 2 minutes.
    Fetches real data from ESPN unofficial API, falls back to DB.
    Returns list of {name, team, status, reason, game_date, player_id}.
    """
    cached = _injury_cache.get('report')
    if cached and datetime.utcnow() - cached['ts'] < timedelta(minutes=2):
        return {"data": cached['data'], "as_of": cached['ts'].isoformat()}

    def find_player_id(player_name: str):
        """Match ESPN name to DB player — exact match first, then fuzzy fallback"""
        if not player_name:
            return None
        
        # Strategy 0: Hard override for known collision cases
        override = PLAYER_NAME_OVERRIDES.get(player_name.lower())
        if override:
            logger.info(f"[Injury] Override matched '{player_name}' → ID: {override}")
            return override
        
        from fuzzywuzzy import fuzz
        
        all_players = db.query(Player.id, Player.full_name).all()
        player_name_lower = player_name.lower()
        
        # Strategy 1: Exact match first (prevents Seth/Stephen Curry collision)
        for pid, full_name in all_players:
            if full_name and full_name.lower() == player_name_lower:
                logger.info(f"[Injury] Exact matched '{player_name}' → ID: {pid}")
                return pid
        
        # Strategy 2: Fuzzy fallback
        best_match = None
        best_score = 0
        for pid, full_name in all_players:
            if not full_name:
                continue
            score = max(
                fuzz.ratio(player_name_lower, full_name.lower()),
                fuzz.token_sort_ratio(player_name_lower, full_name.lower())
            )
            if score > best_score:
                best_score = score
                best_match = pid
        
        if best_score >= 75 and best_match:
            logger.info(f"[Injury] Fuzzy matched '{player_name}' with score {best_score} → ID: {best_match}")
            return best_match
        
        logger.debug(f"[Injury] Low confidence match for '{player_name}' (best: {best_score}, threshold: 75)")
        return None

    try:
        import requests as _req
        espn_resp = _req.get(
            "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries",
            timeout=10
        )
        espn_data = espn_resp.json()
        logger.info(f"[Injury] Fetched ESPN injury data, processing...")

        report = []
        ORDER = {'Out': 0, 'Doubtful': 1, 'Questionable': 2, 'Day-To-Day': 3, 'IR': 4}
        
        for team_entry in espn_data.get('injuries', []):
            for inj in team_entry.get('injuries', []):
                athlete = inj.get('athlete', {})
                status  = inj.get('status', '')
                player_name = athlete.get('displayName', '')
                
                # ESPN API update: team abbreviation is under athlete -> team
                team_abbr_espn = athlete.get('team', {}).get('abbreviation', '')
                
                logger.debug(f"[Injury] Processing ESPN player: {player_name} ({team_abbr_espn}) - {status}")
                
                pid = find_player_id(player_name)
                
                report.append({
                    "player_id": pid,
                    "name":      player_name,
                    "team":      team_abbr_espn,
                    "status":    status,
                    "reason":    inj.get('type', {}).get('description', ''),
                    "game_date": '',
                })

        report.sort(key=lambda i: ORDER.get(i['status'], 99))

        _injury_cache['report'] = {'data': report, 'ts': datetime.utcnow()}
        return {"data": report, "as_of": datetime.utcnow().isoformat()}

    except Exception as e:
        logger.warning(f"ESPN InjuryReport failed, falling back to DB: {e}")
        # Fallback: players in DB with a non-Active injury status
        try:
            injured_db = (
                db.query(Player)
                  .filter(
                      Player.injury_status.isnot(None),
                      Player.injury_status != '',
                      Player.injury_status != 'Active'
                  )
                  .limit(15).all()
            )
            report = [
                {"player_id": p.id, "name": p.full_name, "team": p.team_abbreviation or '',
                 "status": p.injury_status, "reason": '', "game_date": ''}
                for p in injured_db
            ]
            return {"data": report, "as_of": datetime.utcnow().isoformat()}
        except Exception as db_e:
            logger.error(f"DB injury fallback also failed: {db_e}")
            raise HTTPException(status_code=500, detail="Injury report unavailable")


@app.get("/api/injuries/refresh")
def refresh_injury_cache(db: Session = Depends(get_db)):
    """Force-refresh the injury report cache (debugging endpoint)"""
    global _injury_cache
    _injury_cache.clear()  # Clear the entire cache
    logger.info("[Injury] Cache cleared, fetching fresh data...")
    
    # Call the main injury endpoint to repopulate
    result = get_injury_report(db)
    return {"message": "Cache refreshed", **result}# ── Phase 3: Odds History & Line Movement Tracking ──────────────────────────────
@app.get("/api/odds-history/{player_id}")
def get_odds_history(
    player_id: int,
    stat: str = "pts",
    days: int = 7,
    db: Session = Depends(get_db)
):
    """
    Query historical odds data for line movement analysis.
    
    Args:
        player_id: NBA player ID
        stat: Stat category (pts, reb, ast, 3pt, stl, blk)
        days: Number of days back to retrieve (default 7)
    
    Returns:
        {
            'player_id': int,
            'stat': str,
            'history': [
                {
                    'timestamp': ISO datetime,
                    'line': float,
                    'american_odds': int,
                    'implied_probability': float,
                    'bookmaker': str
                },
                ...
            ],
            'line_movement': float (current - 7d avg),
            'sharp_movement_detected': bool,
            'summary': {
                'lowest_line': float,
                'highest_line': float,
                'avg_line': float,
                'current_line': float
            }
        }
    """
    try:
        stat_map = {
            'pts': 'PTS', 'reb': 'REB', 'ast': 'AST',
            '3pt': '3PT', 'stl': 'STL', 'blk': 'BLK'
        }
        stat_key = stat_map.get(stat.lower(), 'PTS')
        
        # Query odds history for the past N days
        cutoff = datetime.utcnow() - timedelta(days=days)
        history = (db.query(OddsHistory)
                   .filter(
                       OddsHistory.player_id == player_id,
                       OddsHistory.stat_category == stat_key,
                       OddsHistory.recorded_at >= cutoff
                   )
                   .order_by(OddsHistory.recorded_at.desc())
                   .all())
        
        if not history:
            return {
                'player_id': player_id,
                'stat': stat,
                'history': [],
                'line_movement': 0.0,
                'sharp_movement_detected': False,
                'summary': {
                    'lowest_line': None,
                    'highest_line': None,
                    'avg_line': None,
                    'current_line': None
                },
                'message': 'No odds history available'
            }
        
        # Format history for response
        formatted_history = [
            {
                'timestamp': h.recorded_at.isoformat(),
                'line': h.current_line,
                'american_odds': h.american_odds,
                'implied_probability': h.implied_probability,
                'bookmaker': h.bookmaker
            }
            for h in history
        ]
        
        # Calculate summary metrics
        lines = [h.current_line for h in history]
        current_line = lines[0] if lines else None
        avg_line = statistics.mean(lines) if lines else None
        line_movement = (current_line - avg_line) if current_line and avg_line else 0.0
        
        # Detect sharp movement: if line moved > 1.0 and odds moved opposite direction
        sharp_movement = False
        if len(history) >= 2:
            recent = history[0]
            old = history[-1]
            line_diff = abs(recent.current_line - old.current_line)
            odds_diff_sign = (recent.american_odds - old.american_odds) * (recent.current_line - old.current_line)
            # Sharp action: big line movement but odds slightly worse (bookmaker protecting liability)
            sharp_movement = line_diff > 1.0 and odds_diff_sign < 0
        
        return {
            'player_id': player_id,
            'stat': stat,
            'history': formatted_history,
            'line_movement': round(line_movement, 2),
            'sharp_movement_detected': sharp_movement,
            'summary': {
                'lowest_line': round(min(lines), 2) if lines else None,
                'highest_line': round(max(lines), 2) if lines else None,
                'avg_line': round(avg_line, 2) if avg_line else None,
                'current_line': round(current_line, 2) if current_line else None
            }
        }
    except Exception as e:
        logger.error(f"Odds history query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/players/{player_id}/edge-analysis")
def get_player_edge_analysis(
    player_id: int,
    days: int = 7,
    db: Session = Depends(get_db)
):
    """
    Query historical edge analysis data for a player across all stats.
    Tracks EV, Kelly, and confidence over time.
    
    Args:
        player_id: NBA player ID
        days: Number of days back to retrieve (default 7)
    
    Returns:
        {
            'player_id': int,
            'player_name': str,
            'analysis_history': [
                {
                    'date': YYYY-MM-DD,
                    'stat_category': str,
                    'model_probability': float,
                    'implied_probability': float,
                    'ev_percentage': float,
                    'kelly_quarter': float,
                    'confidence_score': float,
                    'confidence_rating': str
                },
                ...
            ],
            'summary': {
                'avg_ev': float,
                'avg_confidence': float,
                'volatility': float (std dev of EV),
                'high_edge_count': int
            }
        }
    """
    try:
        # Get player info
        player = db.query(Player).filter(Player.id == player_id).first()
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")
        
        # Query edge analysis for the past N days
        cutoff = datetime.utcnow() - timedelta(days=days)
        edge_records = (db.query(EdgeAnalysis)
                        .filter(
                            EdgeAnalysis.player_id == player_id,
                            EdgeAnalysis.calculated_at >= cutoff
                        )
                        .order_by(EdgeAnalysis.calculated_at.desc())
                        .all())
        
        # Format for response
        analysis_history = [
            {
                'date': r.calculated_at.strftime('%Y-%m-%d'),
                'time': r.calculated_at.strftime('%H:%M:%S'),
                'stat_category': r.stat_category,
                'model_probability': round(r.model_probability, 1),
                'implied_probability': round(r.implied_probability, 1),
                'ev_percentage': round(r.ev_percentage, 2),
                'kelly_quarter': round(r.kelly_fraction_quarter, 4),
                'confidence_score': round(r.confidence_score, 1),
                'confidence_rating': r.confidence_rating
            }
            for r in edge_records
        ]
        
        # Calculate summary stats
        if edge_records:
            evs = [r.ev_percentage for r in edge_records]
            confidences = [r.confidence_score for r in edge_records]
            
            avg_ev = statistics.mean(evs)
            avg_confidence = statistics.mean(confidences)
            volatility = statistics.stdev(evs) if len(evs) > 1 else 0.0
            high_edge_count = sum(1 for r in edge_records if r.ev_percentage > 3.0)
            
            summary = {
                'avg_ev': round(avg_ev, 2),
                'avg_confidence': round(avg_confidence, 1),
                'volatility': round(volatility, 2),
                'high_edge_count': high_edge_count,
                'total_analysis_points': len(edge_records)
            }
        else:
            summary = {
                'avg_ev': 0.0,
                'avg_confidence': 0.0,
                'volatility': 0.0,
                'high_edge_count': 0,
                'total_analysis_points': 0
            }
        
        return {
            'player_id': player_id,
            'player_name': player.full_name,
            'analysis_history': analysis_history,
            'summary': summary
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Edge analysis query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Per-Position Defense ───────────────────────────────────────────────────────
from nba_api.stats.endpoints import leaguedashptdefend as _ptdefend_module

_pos_defense_cache: dict = {}

@app.get("/api/teams/{team_abbr}/defense-by-position")
def get_defense_by_position(team_abbr: str):
    """
    How an opponent team defends each position (PG/SG/SF/PF/C).
    Uses LeagueDashPtDefend defense_category='3'.
    """
    key = f"pos_def:{team_abbr.upper()}"
    cached = _pos_defense_cache.get(key)
    if cached and datetime.utcnow() - cached['ts'] < timedelta(hours=6):
        return {"data": cached['data']}

    try:
        now = datetime.utcnow()
        yr  = now.year if now.month >= 10 else now.year - 1
        season_str = f"{yr}-{str(yr + 1)[-2:]}"

        defend = _ptdefend_module.LeagueDashPtDefend(
            league_id='00',
            per_mode_simple='PerGame',
            season=season_str,
            defense_category='3',
            timeout=45
        )
        df = defend.get_data_frames()[0]

        team_df = df[df['TEAM_ABBREVIATION'].str.upper() == team_abbr.upper()]
        positions = {}
        for _, row in team_df.iterrows():
            pos = str(row.get('PLAYER_POSITION', row.get('DEFENSE_CATEGORY', 'UNK')))
            positions[pos] = {
                "pts_allowed":    float(row.get('PTS',     0) or 0),
                "reb_allowed":    float(row.get('REB',     0) or 0),
                "ast_allowed":    float(row.get('AST',     0) or 0),
                "fg_pct_allowed": float(row.get('FG_PCT',  0) or 0),
                "gp":             int(row.get('GP',        0) or 0),
            }

        result = {"team": team_abbr.upper(), "positions": positions, "season": season_str}
        _pos_defense_cache[key] = {'data': result, 'ts': datetime.utcnow()}
        return {"data": result}

    except Exception as e:
        logger.error(f"defense-by-position failed for {team_abbr}: {e}")
        raise HTTPException(status_code=500, detail="Position defense fetch failed")


# ── Live Game Tracker (Phase 4) ───────────────────────────────────────────────

@app.get("/api/games/{game_id}/boxscore")
@auto_retry
def get_game_boxscore(game_id: str):
    """Fetch live boxscore statistics for a specific game."""
    try:
        formatted_id = str(game_id).zfill(10)
        box = boxscoretraditionalv2.BoxScoreTraditionalV2(game_id=formatted_id, timeout=30)
        df = box.get_data_frames()[0]
        
        teams = {}
        for _, row in df.iterrows():
            t_id = row['TEAM_ID']
            if pd.isna(t_id): continue
            
            if t_id not in teams:
                teams[t_id] = {
                    "team_id": t_id,
                    "team_abbreviation": row['TEAM_ABBREVIATION'],
                    "team_city": row['TEAM_CITY'],
                    "players": []
                }
            
            if not pd.isna(row['PLAYER_ID']):
                teams[t_id]["players"].append({
                    "player_id": row['PLAYER_ID'],
                    "player_name": row['PLAYER_NAME'],
                    "start_position": row['START_POSITION'] if not pd.isna(row['START_POSITION']) else "",
                    "min": row['MIN'] if not pd.isna(row['MIN']) else "0:00",
                    "pts": int(row['PTS']) if not pd.isna(row['PTS']) else 0,
                    "ast": int(row['AST']) if not pd.isna(row['AST']) else 0,
                    "reb": int(row['REB']) if not pd.isna(row['REB']) else 0,
                    "stl": int(row['STL']) if not pd.isna(row['STL']) else 0,
                    "blk": int(row['BLK']) if not pd.isna(row['BLK']) else 0,
                    "fg_pct": float(row['FG_PCT']) if not pd.isna(row['FG_PCT']) else 0.0,
                    "fg3_pct": float(row['FG3_PCT']) if not pd.isna(row['FG3_PCT']) else 0.0,
                    "plus_minus": int(row['PLUS_MINUS']) if not pd.isna(row['PLUS_MINUS']) else 0,
                })
        
        return {"data": list(teams.values())}
    except Exception as e:
        logger.error(f"get_game_boxscore failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch boxscore")

@app.get("/api/games/{game_id}/playbyplay")
def get_game_play_by_play(game_id: str):
    """Fetch live play-by-play events for a specific game."""
    try:
        formatted_id = str(game_id).zfill(10)
        pbp = playbyplayv2.PlayByPlayV2(game_id=formatted_id, timeout=30)
        # PlayByPlayV2 raises a KeyError on 'resultSet' when the game hasn't started
        try:
            frames = pbp.get_data_frames()
        except (KeyError, IndexError):
            return {"data": []}      # game not started yet — return empty gracefully
        if not frames or len(frames) == 0:
            return {"data": []}
        df = frames[0]
        if df is None or df.empty:
            return {"data": []}

        plays = []
        recent_df = df.tail(50).sort_values(by="EVENTNUM", ascending=False)

        for _, row in recent_df.iterrows():
            desc = ""
            if not pd.isna(row.get('HOMEDESCRIPTION', float('nan'))):
                desc = row['HOMEDESCRIPTION']
            elif not pd.isna(row.get('VISITORDESCRIPTION', float('nan'))):
                desc = row['VISITORDESCRIPTION']
            elif not pd.isna(row.get('NEUTRALDESCRIPTION', float('nan'))):
                desc = row['NEUTRALDESCRIPTION']

            plays.append({
                "event_num": int(row.get('EVENTNUM', 0)),
                "period":    int(row.get('PERIOD', 0)),
                "clock":     str(row.get('PCTIMESTRING', '')),
                "score":     str(row['SCORE']) if not pd.isna(row.get('SCORE', float('nan'))) else "",
                "score_margin": str(row['SCOREMARGIN']) if not pd.isna(row.get('SCOREMARGIN', float('nan'))) else "",
                "description":   desc,
                "event_msg_type": int(row.get('EVENTMSGTYPE', 0)),
                "player1": {
                    "id":        int(row.get('PLAYER1_ID', 0)),
                    "name":      str(row.get('PLAYER1_NAME', '')),
                    "team_abbr": str(row.get('PLAYER1_TEAM_ABBREVIATION', '')),
                },
            })

        return {"data": plays}
    except Exception as e:
        logger.error(f"get_game_play_by_play failed: {e}")
        return {"data": []}  # never crash the client — return empty

