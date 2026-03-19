import sqlite3
c = sqlite3.connect('E:/NBA/backend/nba_cache.db')
print("CACHE:")
print(c.execute("SELECT key, updated_at FROM cache_meta WHERE key='daily_games:2026-03-18'").fetchall())
