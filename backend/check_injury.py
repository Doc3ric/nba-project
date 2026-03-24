import requests

# Bradley Beal's player ID
player_id = 203078

response = requests.get(f'http://localhost:8000/api/players/{player_id}')
data = response.json()

player = data.get('data', {})
print(f"Player: {player.get('full_name')}")
print(f"Injury Status: {player.get('injury_status')}")
print(f"Is Active: {player.get('is_active')}")
print(f"\nFull Data:")
print(data)
