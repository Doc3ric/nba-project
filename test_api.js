require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.VITE_BALLDONTLIE_API_KEY || 'test';

async function test() {
  console.log("Testing API...");
  try {
    const res = await axios.get('https://api.balldontlie.io/v1/stats', {
      headers: { Authorization: API_KEY },
      params: { 'player_ids[]': 115, per_page: 20, seasons: [2023] }
    });
    console.log("Total received:", res.data.data.length);
    if (res.data.data.length > 0) {
      console.log("Sample 1 date:", res.data.data[0].game.date);
      console.log("Sample 2 date:", res.data.data[1].game.date);
      
      const dates = res.data.data.map(d => d.game.date).sort();
      console.log("Earliest:", dates[0]);
      console.log("Latest:", dates[dates.length-1]);
    }
  } catch(e) {
    console.log("Error:", e.message);
  }
}
test();
