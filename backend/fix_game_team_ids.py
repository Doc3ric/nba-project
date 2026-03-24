"""Fix missing team_id values in Game table"""
from database import SessionLocal, Game
from nba_api.stats.static import teams

db = SessionLocal()
all_teams = teams.get_teams()
team_lookup = {t['abbreviation']: t for t in all_teams}

# Find all games with missing team IDs
games_to_fix = db.query(Game).filter(
    (Game.home_team_id == None) | (Game.visitor_team_id == None)
).all()

print(f"Found {len(games_to_fix)} games with missing team IDs")

for game in games_to_fix:
    home_team_data = team_lookup.get(game.home_team_abbreviation, {})
    visitor_team_data = team_lookup.get(game.visitor_team_abbreviation, {})
    
    if game.home_team_id is None:
        game.home_team_id = home_team_data.get('id')
        print(f"Game {game.id}: Set home_team_id to {game.home_team_id} ({game.home_team_abbreviation})")
    
    if game.visitor_team_id is None:
        game.visitor_team_id = visitor_team_data.get('id')
        print(f"Game {game.id}: Set visitor_team_id to {game.visitor_team_id} ({game.visitor_team_abbreviation})")

db.commit()
print(f"Fixed {len(games_to_fix)} games")
db.close()
