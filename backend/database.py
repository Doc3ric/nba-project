from sqlalchemy import create_engine, Column, Integer, String, Text, Float, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
import datetime
from pathlib import Path

# Create a local SQLite database file in the backend folder
DB_PATH = Path(__file__).parent / "nba_cache.db"
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class Player(Base):
    """Historical Database Table for Players"""
    __tablename__ = "players"

    id = Column(Integer, primary_key=True, index=True)  # Official NBA Player ID
    first_name = Column(String)
    last_name = Column(String)
    full_name = Column(String, index=True)
    position = Column(String)
    team_abbreviation = Column(String)
    team_id = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True)
    # Extended player details from commonplayerinfo
    jersey_number = Column(String, nullable=True)
    height = Column(String, nullable=True)
    weight = Column(String, nullable=True)
    country = Column(String, nullable=True)
    school = Column(String, nullable=True)
    draft_year = Column(Integer, nullable=True)
    experience = Column(Integer, nullable=True)
    injury_status = Column(String, nullable=True)  # Active, Inactive, Out, Questionable
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    game_logs = relationship("GameLog", back_populates="player")

class Game(Base):
    """Historical Database Table for Games"""
    __tablename__ = "games"

    id = Column(String, primary_key=True, index=True)  # Official NBA Game ID
    game_date = Column(String, index=True)  # Format: YYYY-MM-DD
    home_team_id = Column(Integer)
    home_team_abbreviation = Column(String)
    home_team_score = Column(Integer, nullable=True)
    visitor_team_id = Column(Integer)
    visitor_team_abbreviation = Column(String)
    visitor_team_score = Column(Integer, nullable=True)
    status = Column(String)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)

class GameLog(Base):
    """Relational table tying a Player to a Game with their full stats"""
    __tablename__ = "game_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    player_id = Column(Integer, ForeignKey("players.id"), index=True)
    game_id = Column(String, ForeignKey("games.id"), index=True)

    # Core stats
    pts = Column(Integer, default=0)
    reb = Column(Integer, default=0)
    ast = Column(Integer, default=0)
    fg3m = Column(Integer, default=0)
    mins = Column(String)  # Stored as '35:00' format

    # Extended stats (newly added)
    stl = Column(Integer, default=0)
    blk = Column(Integer, default=0)
    oreb = Column(Integer, default=0)
    dreb = Column(Integer, default=0)
    tov = Column(Integer, default=0)
    fg_pct = Column(Float, default=0.0)
    fg3_pct = Column(Float, default=0.0)
    plus_minus = Column(Integer, default=0)

    updated_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    player = relationship("Player", back_populates="game_logs")
    game = relationship("Game")

class TeamStat(Base):
    """Caches Team Defensive Ratings and Pace - real values from LeagueDashTeamStats"""
    __tablename__ = "team_stats"

    team_id = Column(Integer, primary_key=True, index=True)
    team_abbreviation = Column(String, index=True)
    team_name = Column(String, nullable=True)
    # Real values from nba_api LeagueDashTeamStats Advanced
    pace = Column(Float, nullable=True)               # Real possessions/48min
    off_rating = Column(Float, nullable=True)         # Points scored per 100 possessions
    def_rating = Column(Float, nullable=True)         # Points allowed per 100 possessions
    net_rating = Column(Float, nullable=True)         # Off - Def rating
    def_rating_rank = Column(Integer, nullable=True)  # 1 = best defense
    # Opponent stats for matchup context
    opp_pts_pg = Column(Float, nullable=True)         # Opponent points per game allowed
    opp_fg3_pct = Column(Float, nullable=True)        # Opponent 3PT% allowed
    opp_reb_pg = Column(Float, nullable=True)         # Opponent rebounds allowed per game
    wins = Column(Integer, nullable=True)
    losses = Column(Integer, nullable=True)

    updated_at = Column(DateTime, default=datetime.datetime.utcnow)

class CacheMeta(Base):
    """Tracks when standard API searches happened so we don't spam endpoints"""
    __tablename__ = "cache_meta"

    key = Column(String, primary_key=True, index=True)  # e.g. "player_search:lebron"
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)

class OddsHistory(Base):
    """Historical odds data for tracking line movement and edge detection"""
    __tablename__ = "odds_history"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    player_id = Column(Integer, ForeignKey("players.id"), index=True)
    game_id = Column(String, ForeignKey("games.id"), nullable=True, index=True)
    stat_category = Column(String, index=True)  # e.g., "PTS", "REB", "AST", "3PT", "STL", "BLK"
    current_line = Column(Float)  # e.g., 25.5
    american_odds = Column(Integer)  # e.g., -110, +150
    implied_probability = Column(Float)  # 0-100, calculated from odds
    bookmaker = Column(String, default="draftkings")  # bookmaker source
    recorded_at = Column(DateTime, index=True, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)

class EdgeAnalysis(Base):
    """Stores calculated edge metrics for props: EV, Kelly Criterion, confidence scoring, CLV"""
    __tablename__ = "edge_analysis"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    player_id = Column(Integer, ForeignKey("players.id"), index=True)
    game_id = Column(String, ForeignKey("games.id"), nullable=True, index=True)
    stat_category = Column(String, index=True)  # e.g., "PTS", "REB", "AST"
    model_probability = Column(Float)  # Our model's probability (0-100)
    implied_probability = Column(Float)  # Sportsbook's implied probability (0-100)
    ev_percentage = Column(Float)  # Expected Value as percentage (can be negative)
    kelly_fraction_full = Column(Float)  # Full Kelly Criterion (typically 5-20%)
    kelly_fraction_quarter = Column(Float)  # Quarter Kelly for live betting (1-5%)
    confidence_score = Column(Float)  # Unified confidence 1-100
    confidence_rating = Column(String)  # "High", "Medium", "Low"
    
    # Phase 2.5: Minutes Projection & CLV Tracking
    projected_minutes = Column(Float, nullable=True)  # Projected minutes for this player
    minutes_consistency = Column(Float, nullable=True)  # Consistency of minutes (1-100)
    opening_line = Column(Float, nullable=True)  # Line when we calculated the prop
    opening_odds = Column(Integer, nullable=True)  # Odds at calculation time
    closing_line = Column(Float, nullable=True)  # Actual closing line (post-game)
    closing_odds = Column(Integer, nullable=True)  # Actual closing odds
    clv_value = Column(Float, nullable=True)  # Closing Line Value (opening - closing, positive = edge)
    
    # Phase 1: Calibration & Variance Metrics
    model_std_dev = Column(Float, nullable=True)  # Standard deviation of model probability (for confidence intervals)
    confidence_interval_low = Column(Float, nullable=True)  # 95% CI lower bound
    confidence_interval_high = Column(Float, nullable=True)  # 95% CI upper bound
    calibration_applied = Column(Boolean, default=False)  # Whether Platt scaling was applied
    
    # Inference/Explanation
    pick_explanation = Column(Text, nullable=True)  # Why we like this pick
    
    calculated_at = Column(DateTime, index=True, default=datetime.datetime.utcnow)

# Create tables (will not drop existing, only add new)
Base.metadata.create_all(bind=engine)
