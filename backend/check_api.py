import requests
import json

r = requests.get('http://localhost:8000/api/stats?player_id=2544')
games = r.json()

print(f'Total games: {len(games)}\n')
for i in range(min(3, len(games))):
    g = games[i]
    player_team_id = g['team']['id']
    home_team_id = g['game']['home_team_id']
    visitor_team_id = g['game']['visitor_team_id']
    home_abbr = g['game']['home_team']['abbreviation']
    visitor_abbr = g['game']['visitor_team']['abbreviation']
    player_abbr = g['team']['abbreviation']
    
    # What the frontend logic should calculate
    if home_team_id == player_team_id:
        opponent_should_be = visitor_abbr
    else:
        opponent_should_be = home_abbr
    
    print(f"Game {i+1}:")
    print(f"  Date: {g['game']['date']}")
    print(f"  Player: {player_abbr} (ID:{player_team_id})")
    print(f"  Home: {home_abbr} (ID:{home_team_id})")
    print(f"  Visitor: {visitor_abbr} (ID:{visitor_team_id})")
    print(f"  Opponent should be: {opponent_should_be}\n")
