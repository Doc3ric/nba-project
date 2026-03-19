"""
Migration script - safely adds new columns to existing SQLite DB without dropping data.
Run this ONCE before starting the upgraded backend.
"""
import sqlite3
from pathlib import Path

db_path = Path(__file__).parent / "nba_cache.db"

if not db_path.exists():
    print("Database not found — it will be created fresh when the app starts.")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # ── game_logs new columns ─────────────────────────────────────────────────
    cursor.execute("PRAGMA table_info(game_logs)")
    gl_cols = [col[1] for col in cursor.fetchall()]

    gl_new = {
        "stl":       "INTEGER DEFAULT 0",
        "blk":       "INTEGER DEFAULT 0",
        "oreb":      "INTEGER DEFAULT 0",
        "dreb":      "INTEGER DEFAULT 0",
        "tov":       "INTEGER DEFAULT 0",
        "fg_pct":    "REAL DEFAULT 0.0",
        "fg3_pct":   "REAL DEFAULT 0.0",
        "plus_minus":"INTEGER DEFAULT 0",
    }
    for col, typedef in gl_new.items():
        if col not in gl_cols:
            cursor.execute(f"ALTER TABLE game_logs ADD COLUMN {col} {typedef}")
            print(f"  game_logs  <- added '{col}'")

    # ── players new columns ───────────────────────────────────────────────────
    cursor.execute("PRAGMA table_info(players)")
    pl_cols = [col[1] for col in cursor.fetchall()]

    pl_new = {
        "team_id":       "INTEGER",
        "jersey_number": "TEXT",
        "height":        "TEXT",
        "weight":        "TEXT",
        "country":       "TEXT",
        "school":        "TEXT",
        "draft_year":    "INTEGER",
        "experience":    "INTEGER",
        "injury_status": "TEXT DEFAULT 'Active'",
    }
    for col, typedef in pl_new.items():
        if col not in pl_cols:
            cursor.execute(f"ALTER TABLE players ADD COLUMN {col} {typedef}")
            print(f"  players    <- added '{col}'")

    # ── team_stats new columns ────────────────────────────────────────────────
    cursor.execute("PRAGMA table_info(team_stats)")
    ts_cols = [col[1] for col in cursor.fetchall()]

    ts_new = {
        "team_name":   "TEXT",
        "opp_pts_pg":  "REAL",
        "opp_fg3_pct": "REAL",
        "opp_reb_pg":  "REAL",
        "wins":        "INTEGER",
        "losses":      "INTEGER",
    }
    for col, typedef in ts_new.items():
        if col not in ts_cols:
            cursor.execute(f"ALTER TABLE team_stats ADD COLUMN {col} {typedef}")
            print(f"  team_stats <- added '{col}'")

    conn.commit()
    conn.close()
    print("\nMigration complete.")
