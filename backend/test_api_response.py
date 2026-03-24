import requests
import json

# Test the API response for LeBron James
response = requests.get("http://localhost:8000/api/stats", params={"player_id": 2544})
data = response.json()

print(f"Total games returned: {len(data)}")
print("\nMost recent 3 games:\n")

for i, game in enumerate(data[:3]):
    print(f"=== Game {i+1} ===")
    print(f"Date: {game.get('game', {}).get('date')}")
    print(f"Player Team ID: {game.get('team', {}).get('id')} ({game.get('team', {}).get('abbreviation')})")
    print(f"Home Team ID: {game.get('game', {}).get('home_team_id')} ({game.get('game', {}).get('home_team', {}).get('abbreviation')})")
    print(f"Visitor Team ID: {game.get('game', {}).get('visitor_team_id')} ({game.get('game', {}).get('visitor_team', {}).get('abbreviation')})")
    print(f"Stats: {game.get('pts')} pts")
    print()
