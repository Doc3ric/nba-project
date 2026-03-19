from nba_api.stats.endpoints import commonteamroster
import pandas as pd

# Test for Boston Celtics (1610612738)
roster = commonteamroster.CommonTeamRoster(team_id=1610612738)
df = roster.get_data_frames()[0]
print(df.columns)
print(df.head(5)[['PLAYER', 'PLAYER_ID', 'POSITION']])
