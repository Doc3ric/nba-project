import axios from 'axios';

async function testEspnSearch() {
  try {
    console.log("Searching for Lebron...");
    const search = await axios.get('https://site.api.espn.com/apis/search/v2?query=lebron&limit=5&type=player&sport=basketball');
    // The results usually have an id inside the url
    console.log(JSON.stringify(search.data.results, null, 2));
  } catch(e) {
    console.error(e.message);
  }
}
testEspnSearch();
