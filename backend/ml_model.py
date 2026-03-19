import pandas as pd
import numpy as np
from datetime import datetime
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import CalibratedClassifierCV
import logging
from datetime import timedelta

logger = logging.getLogger(__name__)

# ── In-memory model cache to avoid retraining on every request ────────────────
_model_cache: dict = {}
MODEL_CACHE_TTL = timedelta(hours=1)


def train_and_predict_prop(logs, stat_category: str, line: float) -> float:
    """
    Trains a lightweight LogisticRegression classification model strictly on the
    historical logs provided for the player to determine P(Over > Line).

    Features built on the fly:
    - 5-game rolling average of the target stat
    - Home/Away status
    - Days of Rest since previous game

    Returns: float representing Edge Probability % (0.0 to 100.0)
    """
    if len(logs) < 10:
        # Not enough data — fallback to simple hit rate
        if len(logs) >= 3:
            hits = sum(1 for l in logs if (getattr(l, stat_category, 0) or 0) > line)
            return round(hits / len(logs) * 100, 1)
        return 50.0

    # ── Cache check ───────────────────────────────────────────────────────────
    try:
        cache_key = (
            getattr(logs[0], 'player_id', 0),
            stat_category,
            line,
            logs[0].game_id  # invalidates when new game is logged
        )
        cached = _model_cache.get(cache_key)
        if cached and datetime.utcnow() - cached['ts'] < MODEL_CACHE_TTL:
            return cached['prob']
    except Exception:
        cache_key = None  # cache miss, proceed normally

    try:
        data = []
        # Sort logs chronologically (oldest first) to build rolling features
        sorted_logs = sorted(
            logs, key=lambda x: datetime.strptime(x.game.game_date, '%Y-%m-%d')
        )

        for i, log in enumerate(sorted_logs):
            game_date = datetime.strptime(log.game.game_date, '%Y-%m-%d')

            # Feature 1: Days of rest
            days_rest = 3  # default
            if i > 0:
                prev_date = datetime.strptime(
                    sorted_logs[i - 1].game.game_date, '%Y-%m-%d'
                )
                days_rest = (game_date - prev_date).days

            # Feature 2: Is Home Game (1=Home, 0=Away)
            try:
                is_home = 1 if (
                    log.game.home_team_abbreviation ==
                    log.player.team_abbreviation
                ) else 0
            except Exception:
                is_home = 0

            # Target stat value
            target_val = getattr(log, stat_category, 0) or 0

            # Rolling average (excluding current game — no data leak)
            if i >= 5:
                past_5 = [
                    getattr(l, stat_category, 0) or 0
                    for l in sorted_logs[i - 5:i]
                ]
                rolling_avg = sum(past_5) / 5.0
            elif i > 0:
                past = [
                    getattr(l, stat_category, 0) or 0
                    for l in sorted_logs[:i]
                ]
                rolling_avg = sum(past) / len(past)
            else:
                rolling_avg = float(target_val)

            hit_over = 1 if target_val > line else 0

            data.append({
                "days_rest":   days_rest,
                "is_home":     is_home,
                "rolling_avg": rolling_avg,
                "target":      hit_over
            })

        df = pd.DataFrame(data)

        # ── Guard: single-class data ──────────────────────────────────────────
        if df['target'].nunique() < 2:
            result = 95.0 if df['target'].iloc[0] == 1 else 5.0
            _store_cache(cache_key, result)
            return result

        X = df[['days_rest', 'is_home', 'rolling_avg']]
        y = df['target']

        n_samples = len(df)

        # ── Determine CV folds safely ─────────────────────────────────────────
        # Need at least 2 samples of each class per fold
        min_class_count = min(y.sum(), n_samples - y.sum())
        max_safe_folds  = int(min_class_count)  # can't have more folds than minority class
        cv_folds        = min(3, max_safe_folds)

        if cv_folds < 2:
            # Not enough data for cross-validation — use simple hit rate
            result = round(float(y.mean() * 100), 1)
            result = min(max(result, 5.0), 95.0)
            _store_cache(cache_key, result)
            return result

        # ── Train with CalibratedClassifierCV (cv=int, not 'prefit') ─────────
        # cv=int uses cross-validation internally — works in all sklearn versions
        base_model = LogisticRegression(
            class_weight='balanced',
            solver='lbfgs',
            max_iter=500,
            C=1.0
        )

        try:
            model = CalibratedClassifierCV(
                base_model,
                method='sigmoid',
                cv=cv_folds          # ← fix: integer, not 'prefit'
            )
            model.fit(X, y)
            logger.debug(f"Calibrated model fitted for {stat_category} (cv={cv_folds})")
        except Exception as cal_err:
            logger.warning(
                f"Calibration failed for {stat_category}, "
                f"using uncalibrated model: {cal_err}"
            )
            # Fallback: plain logistic regression on full data
            base_model.fit(X, y)
            model = base_model

        # ── Predict on "today's" conditions ──────────────────────────────────
        last_avg = sum(
            getattr(l, stat_category, 0) or 0
            for l in sorted_logs[-5:]
        ) / min(5, len(sorted_logs))

        X_today = pd.DataFrame({
            "days_rest":   [2],
            "is_home":     [0.5],
            "rolling_avg": [last_avg]
        })

        prob = float(model.predict_proba(X_today)[0][1]) * 100
        result = round(min(max(prob, 5.0), 95.0), 1)

        _store_cache(cache_key, result)
        return result

    except Exception as e:
        logger.error(f"ML Model training failed for category {stat_category}: {e}")
        # Last-resort fallback: raw hit rate from logs
        try:
            values = [getattr(l, stat_category, 0) or 0 for l in logs]
            hits   = sum(1 for v in values if v > line)
            return round(hits / len(values) * 100, 1)
        except Exception:
            return 50.0


def _store_cache(cache_key, prob: float):
    """Store result in cache if key is valid."""
    if cache_key is not None:
        _model_cache[cache_key] = {'prob': prob, 'ts': datetime.utcnow()}


def clear_model_cache():
    """Call this if you want to force-refresh all predictions (e.g. on new game day)."""
    global _model_cache
    _model_cache.clear()
    logger.info("ML model cache cleared.")