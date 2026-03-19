import sys
sys.path.append("E:/NBA/backend")
from database import SessionLocal, Game
from nba_api.stats.endpoints import scoreboardv2
db = SessionLocal()
try:
    board = scoreboardv2.ScoreboardV2(game_date='03/18/2026')
    g_df = board.get_data_frames()[0]
    for _, row in g_df.iterrows():
        gid = row['GAME_ID']
        if gid == '0022501007':
            status = row['GAME_STATUS_TEXT']
            print(f"NBA API Status: '{status}'")
            g_rec = db.query(Game).filter(Game.id == gid).first()
            if g_rec:
                print(f"DB Status Before: '{g_rec.status}'")
                g_rec.status = status
                print(f"DB Status Assigned: '{g_rec.status}'")
    db.commit()
    
    # Read back
    check = db.query(Game).filter(Game.id == '0022501007').first()
    print(f"DB Status After Commit: '{check.status}'")
finally:
    db.close()
