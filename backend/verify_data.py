from database import SessionLocal, Game, GameLog

db = SessionLocal()

# Get the 3 most recent games for LeBron (player_id=2544) - order by game_id descending (higher game IDs = more recent)
logs = db.query(GameLog).filter(GameLog.player_id == 2544).order_by(GameLog.game_id.desc()).limit(3).all()

print("Recent 3 games for LeBron James (player_id=2544):\n")

for i, log in enumerate(logs):
    g = log.game
    print(f"Game {i+1}:")
    print(f"  Game ID: {log.game_id}")
    print(f"  Date: {g.game_date if g else 'NO GAME'}")
    if g:
        print(f"  Home Team ID: {g.home_team_id} ({g.home_team_abbreviation})")
        print(f"  Visitor Team ID: {g.visitor_team_id} ({g.visitor_team_abbreviation})")
        print(f"  Scores: {g.home_team_score}-{g.visitor_team_score}")
        print(f"  Player Team ID: {log.player.team_id} ({log.player.team_abbreviation})")
        
        # Determine opponent
        if g.home_team_id == log.player.team_id:
            opponent = g.visitor_team_abbreviation
            print(f"  ✓ Player is HOME team, opponent is {opponent}")
        else:
            opponent = g.home_team_abbreviation
            print(f"  ✓ Player is AWAY team, opponent is {opponent}")
    print()

db.close()
