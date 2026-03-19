import requests
import time

time.sleep(2)
base = "http://localhost:8000/api"

# 1. Root
r = requests.get("http://localhost:8000/")
print("Root:", r.status_code)

# 2. Player search
r = requests.get(f"{base}/players", params={"search": "LeBron"})
print("Player Search:", r.status_code)
if r.status_code == 200:
    data = r.json().get("data", [])
    print(f"  Found {len(data)} players")
    if data:
        player_id = data[0]["id"]
        name = data[0]["full_name"]
        print(f"  Player ID: {player_id}, Name: {name}")

        # 3. Player bio
        r2 = requests.get(f"{base}/players/{player_id}")
        print("Player Bio:", r2.status_code)
        if r2.status_code == 200:
            bio = r2.json().get("data", {})
            team = bio.get("team", {}).get("abbreviation", "")
            pos  = bio.get("position", "")
            jer  = bio.get("jersey_number", "")
            ht   = bio.get("height", "")
            print(f"  Bio: {bio.get('full_name')} | {team} | {pos} | #{jer} | {ht}")

        # 4. Player stats
        r3 = requests.get(f"{base}/stats", params={"player_ids[]": player_id})
        print("Player Stats:", r3.status_code)
        if r3.status_code == 200:
            logs = r3.json().get("data", [])
            print(f"  Logs: {len(logs)} games")
            if logs:
                L = logs[0]
                print(f"  Sample => PTS={L.get('pts')} REB={L.get('reb')} AST={L.get('ast')} STL={L.get('stl')} BLK={L.get('blk')} TOV={L.get('tov')} FG%={L.get('fg_pct')}")

# 5. Games
r4 = requests.get(f"{base}/games", params={"dates[]": "2026-03-17"})
print("Games:", r4.status_code)
if r4.status_code == 200:
    games = r4.json().get("data", [])
    print(f"  {len(games)} games today")
    if games:
        g = games[0]
        print(f"  Game: {g.get('visitor_team',{}).get('abbreviation')} @ {g.get('home_team',{}).get('abbreviation')}")
        print(f"  Win Prob: {g.get('win_probability')}")
        game_id = g.get("id")

        # 6. Game props
        r5 = requests.get(f"{base}/games/{game_id}/props")
        print("Game Props:", r5.status_code)
        if r5.status_code == 200:
            props = r5.json().get("data", [])
            print(f"  {len(props)} props")
            if props:
                p = props[0]
                print(f"  Top prop: {p.get('playerName')} | {p.get('prop')} | Prob={p.get('probability')}% | Edge={p.get('edge')} | Conf={p.get('confidence')}")

# 7. Best prop
r6 = requests.get(f"{base}/props/best")
print("Best Prop:", r6.status_code)
if r6.status_code == 200:
    bp = r6.json().get("data")
    if bp:
        print(f"  {bp.get('player')} | {bp.get('prop')} | Prob={bp.get('probability')}% | MC={bp.get('monteCarlo')}% | Edge={bp.get('edge')}")
    else:
        print(f"  Message: {r6.json().get('message')}")

# 8. Team defense
r7 = requests.get(f"{base}/teams/defense")
print("Team Defense:", r7.status_code)
if r7.status_code == 200:
    td = r7.json().get("data", {})
    sample_team = list(td.keys())[0] if td else None
    if sample_team:
        ts = td[sample_team]
        print(f"  Sample ({sample_team}): pace={ts.get('pace')} defRtg={ts.get('defRating')} rank={ts.get('defRatingRank')}")
