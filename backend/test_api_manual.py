import sys
sys.path.append("E:/NBA/backend")
from database import SessionLocal
from app import get_daily_games
db = SessionLocal()
try:
    print("Fetching 2026-03-18:")
    res = get_daily_games(["2026-03-18"], db=db)
    for g in res['data']:
        if g['id'] == '0022501007':
            print(f"HOU vs LAL Game Status Returned: '{g['status']}'")
finally:
    db.close()
