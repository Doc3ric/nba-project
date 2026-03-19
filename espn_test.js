import axios from 'axios';

async function testEspn() {
  try {
    // 1. Get Scoreboard (Today's Games)
    console.log("Fetching Today's Games...");
    const games = await axios.get('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard');
    console.log("Games total:", games.data.events.length);
    if(games.data.events.length > 0) {
      const g = games.data.events[0];
      console.log(`Game: ${g.name} - Status: ${g.status.type.shortDetail}`);
    }

    // 2. Player Search (LeBron James = 1966)
    // Actually ESPN player search isn't standard, we can use a known ID or find a search endpoint.
    // Core API for athlete: https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/athletes?limit=1000
    // Try gamelog for Lebron (1966)
    console.log("\nFetching Lebron Gamelog...");
    const gamelog = await axios.get('https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/1966/gamelog');
    console.log("Gamelog keys:", Object.keys(gamelog.data));
    const season = gamelog.data.seasonTypes[0];
    const categories = season.categories[0];
    const events = categories.events;
    console.log("Total games played:", events.length);
    if(events.length > 0) {
       console.log("First event stats:", events[0].stats);
       // stats array corresponds to categories.labels
       console.log("Labels:", categories.labels.join(', '));
    }

  } catch(e) {
    console.error("ESPN API Error:", e.message);
  }
}

testEspn();
