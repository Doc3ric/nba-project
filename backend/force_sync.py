from database import SessionLocal, CacheMeta
from app import sync_player_stats

db = SessionLocal()

# Force resync by deleting the cache entry
cache_key = f"player_stats:2544"
meta = db.query(CacheMeta).filter(CacheMeta.key == cache_key).first()
if meta:
    db.delete(meta)
    db.commit()
    print(f"Deleted cache entry: {cache_key}")

# Now trigger the sync
print("Syncing LeBron James (player_id=2544)...")
success = sync_player_stats(2544, db)

if success:
    print("✓ Sync successful")
    
    # Verify the new data
    from database import GameLog
    logs = db.query(GameLog).filter(GameLog.player_id == 2544).order_by(GameLog.game_id.desc()).limit(5).all()
    print(f"\nMost recent 5 games after sync:")
    for log in logs:
        print(f"  {log.game_id} ({log.game.game_date if log.game else 'NO DATE'})")
else:
    print("✗ Sync failed")

db.close()
