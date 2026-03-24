from database import SessionLocal, GameLog, Player

db = SessionLocal()
# Get LeBron James (player_id 2544) most recent game
logs = db.query(GameLog).filter(GameLog.player_id == 2544).order_by(GameLog.game_id.desc()).limit(3).all()

for log in logs:
    g = log.game
    print(f"\n=== Game ID: {log.game_id} (Date: {g.game_date if g else 'NO GAME'}) ===")
    print(f"Player Team: {log.player.team_id if log.player else 'NO PLAYER'} ({log.player.team_abbreviation if log.player else 'N/A'})")
    print(f"Home Team: {g.home_team_id if g else None} ({g.home_team_abbreviation if g else None})")
    print(f"Visitor Team: {g.visitor_team_id if g else None} ({g.visitor_team_abbreviation if g else None})")
    print(f"Home Score: {g.home_team_score if g else None}")
    print(f"Visitor Score: {g.visitor_team_score if g else None}")
    if log.player and g:
        if g.home_team_id == log.player.team_id:
            print(f"ANALYSIS: Player is HOME team, opponent should be {g.visitor_team_abbreviation}")
        else:
            print(f"ANALYSIS: Player is AWAY team, opponent should be {g.home_team_abbreviation}")
