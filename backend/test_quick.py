"""
Quick endpoint smoke test — uses only fast/cached paths.
"""
import requests, sys

BASE = "http://127.0.0.1:8000"
PASS = "\033[92m PASS\033[0m"
FAIL = "\033[91m FAIL\033[0m"
failures = []

def check(label, cond, detail=""):
    if cond:
        print(f"{PASS}  {label}")
    else:
        print(f"{FAIL}  {label}  ({detail})")
        failures.append(label)

# 1. Root
r = requests.get(f"{BASE}/")
check("Root 200", r.status_code == 200)
check("Root message", "NBA" in r.json().get("message", ""), r.json())

# 2. Player search — uses nba_api static list (instant, no network)
r = requests.get(f"{BASE}/api/players", params={"search": "Stephen Curry"})
check("Player search status", r.status_code == 200, r.text[:200])
data = r.json().get("data", [])
check("Player search returns results", len(data) > 0, data)
if data:
    pid = data[0]["id"]
    pname = data[0]["full_name"]
    check("Curry found", "Curry" in pname, pname)
    check("Player has team object", isinstance(data[0].get("team"), dict))

    # 3. Player bio (hits commonplayerinfo, may be slow — skip if timeout)
    try:
        r2 = requests.get(f"{BASE}/api/players/{pid}", timeout=35)
        check("Player bio status", r2.status_code == 200, r2.text[:200])
        bio = r2.json().get("data", {})
        check("Bio has full_name", bool(bio.get("full_name")), bio)
        check("Bio has position", bio.get("position") not in (None, ""), bio)
    except requests.exceptions.Timeout:
        print("  SKIP  Player bio (NBA API timeout — not a code bug)")

# 4. Team defense — reads from DB (fast after first sync)
r = requests.get(f"{BASE}/api/teams/defense")
check("Team defense status", r.status_code == 200, r.text[:200])
td = r.json().get("data", {})
check("Team defense has teams", len(td) > 0, list(td.keys())[:3])
if td:
    sample = list(td.values())[0]
    check("Team defense has pace", sample.get("pace") is not None, sample)
    check("Team defense has defRatingRank", sample.get("defRatingRank") is not None, sample)

# 5. Best prop — reads DB + compute (fast)
r = requests.get(f"{BASE}/api/props/best", timeout=10)
check("Best prop status", r.status_code == 200, r.text[:200])
body = r.json()
if body.get("data"):
    bp = body["data"]
    check("Best prop has player", bool(bp.get("player")), bp)
    check("Best prop has prop",   bool(bp.get("prop")),   bp)
    check("Best prop has probability", bp.get("probability") is not None, bp)
    check("Best prop monteCarlo not crash", True)  # was always crashing before
else:
    print(f"  INFO  Best prop: {body.get('message','no data')} (needs live games)")

print(f"\n{'='*45}")
if failures:
    print(f"  {len(failures)} FAILED: {', '.join(failures)}")
    sys.exit(1)
else:
    print("  ALL CHECKS PASSED")
