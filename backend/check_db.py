import sqlite3
from pathlib import Path

db_path = Path("e:/NBA/backend/nba_cache.db")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("PRAGMA table_info(team_stats)")
columns = cursor.fetchall()
for col in columns:
    print(col)

conn.close()
