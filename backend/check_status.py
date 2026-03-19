import sqlite3
from pathlib import Path

db_path = Path("e:/NBA/backend/nba_cache.db")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("Players Count:")
cursor.execute("SELECT count(*) FROM players")
print(cursor.fetchone()[0])

print("\nGame Logs Count:")
cursor.execute("SELECT count(*) FROM game_logs")
print(cursor.fetchone()[0])

print("\nRecent Players:")
cursor.execute("SELECT full_name, team_abbreviation FROM players LIMIT 5")
for row in cursor.fetchall():
    print(row)

conn.close()
