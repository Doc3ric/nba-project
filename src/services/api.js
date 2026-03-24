import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

const apiClient = axios.create({ baseURL: BASE_URL });

// Retry on 429 / 5xx with exponential backoff (up to 3 times)
apiClient.interceptors.response.use(undefined, async (error) => {
  const config = error.config;
  if (!config) return Promise.reject(error);
  if (!config._retry) config._retry = { count: 0, delay: 1000 };
  if (config._retry.count < 3 &&
      (error.response?.status === 429 || (error.response?.status || 0) >= 500)) {
    config._retry.count += 1;
    const delay = config._retry.delay * Math.pow(2, config._retry.count - 1);
    console.warn(`[API] Retrying (${config._retry.count}/3) after ${delay}ms…`);
    await new Promise(r => setTimeout(r, delay));
    return apiClient(config);
  }
  return Promise.reject(error);
});

// ── Frontend cache (localStorage, 15-min TTL) ─────────────────────────────────
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_KEY    = 'nba_cache_data';

const loadCache = () => {
  try {
    const s = localStorage.getItem(CACHE_KEY);
    return s ? JSON.parse(s) : {};
  } catch (err) {
    console.warn('[API] loadCache failed:', err.message);
    return {}; 
  }
};

const saveCache = (c) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch (err) {
    console.warn('[API] saveCache failed:', err.message);
  }
};

const cache = loadCache();

const checkCache = (key) => {
  const entry = cache[key];
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;
  if (entry) delete cache[key];
  return null;
};

const setCache = (key, data) => {
  cache[key] = { data, ts: Date.now() };
  saveCache(cache);
};

// ── Mock fallback data (only used if backend is completely unreachable) ────────
const MOCK_PLAYERS = [
  { id: 2544,  first_name: 'LeBron',   last_name: 'James',          full_name: 'LeBron James',          position: 'F', team: { id: 1610612747, abbreviation: 'LAL', full_name: 'Los Angeles Lakers' } },
  { id: 201939, first_name: 'Stephen', last_name: 'Curry',          full_name: 'Stephen Curry',         position: 'G', team: { id: 1610612744, abbreviation: 'GSW', full_name: 'Golden State Warriors' } },
  { id: 1629029, first_name: 'Luka',   last_name: 'Doncic',         full_name: 'Luka Doncic',           position: 'G', team: { id: 1610612742, abbreviation: 'DAL', full_name: 'Dallas Mavericks' } },
  { id: 203999,  first_name: 'Nikola', last_name: 'Jokic',          full_name: 'Nikola Jokic',          position: 'C', team: { id: 1610612743, abbreviation: 'DEN', full_name: 'Denver Nuggets' } },
  { id: 203507,  first_name: 'Giannis',last_name: 'Antetokounmpo',  full_name: 'Giannis Antetokounmpo', position: 'F', team: { id: 1610612749, abbreviation: 'MIL', full_name: 'Milwaukee Bucks' } },
];

// ── API Functions ─────────────────────────────────────────────────────────────

export const fetchPlayers = async (query) => {
  if (!query || query.length < 2) return [];
  const key    = `players:${query.toLowerCase()}`;
  const cached = checkCache(key);
  if (cached) return cached;

  try {
    const res  = await apiClient.get('/players', { params: { search: query } });
    const data = res.data.data || [];
    setCache(key, data);
    return data;
  } catch (err) {
    console.warn('[API] fetchPlayers fallback to mock:', err.message);
    const q    = query.toLowerCase();
    return MOCK_PLAYERS.filter(p =>
      p.first_name.toLowerCase().includes(q) ||
      p.last_name.toLowerCase().includes(q)
    );
  }
};

export const getPlayerDetails = async (playerId) => {
  if (!playerId) return null;
  const key    = `playerDetails:${playerId}`;
  const cached = checkCache(key);
  if (cached) return cached;

  try {
    const res  = await apiClient.get(`/players/${playerId}`);
    const data = res.data.data;
    setCache(key, data);
    return data;
  } catch (err) {
    console.warn(`[API] getPlayerDetails(${playerId}) failed:`, err.message);
    return null;
  }
};

export const getPlayerStats = async (playerId) => {
  if (!playerId) return [];
  const key    = `stats:${playerId}`;
  const cached = checkCache(key);
  if (cached) return cached;

  try {
    const res  = await apiClient.get('/stats', { params: { 'player_ids[]': playerId } });
    const data = (res.data.data || []).sort(
      (a, b) => new Date(b.game.date) - new Date(a.game.date)
    );
    setCache(key, data);
    return data;
  } catch (err) {
    console.warn('[API] getPlayerStats fallback to mock:', err.message);
    return _generateMockStats(parseInt(playerId));
  }
};

// Calculate US Eastern date
const getUSDateStr = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  // Format the target date exactly in America/New_York time
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  // Output format is MM/DD/YYYY from formatter
  const parts = formatter.formatToParts(d);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};

// Determine if we should shift dates back by 1 day
// If it's before 12:00 PM (Noon) ET, "today's games" haven't started.
// International users checking scores want to see "last night's" finalized games.
export const getSmartDateOffsets = () => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false
  });
  const currentHourET = parseInt(formatter.format(new Date()), 10);
  
  if (currentHourET < 12) {
    // Before noon ET, treat yesterday as "Today" and today as "Tomorrow"
    return { today: -1, tomorrow: 0 };
  }
  // After noon ET, regular schedule
  return { today: 0, tomorrow: 1 };
};

export const getTodaysGames = async () => {
  const offsets = getSmartDateOffsets();
  const today = getUSDateStr(offsets.today);
  const key    = `games:${today}`;
  const cached = checkCache(key);
  if (cached) return cached;

  try {
    const res  = await apiClient.get('/games', { params: { 'dates[]': today } });
    const data = res.data.data || [];
    setCache(key, data);
    return data;
  } catch (err) {
    console.warn('[API] getTodaysGames fallback to mock:', err.message);
    return MOCK_GAMES;
  }
};

export const getUpcomingGames = async () => {
  const offsets = getSmartDateOffsets();
  const tomorrow = getUSDateStr(offsets.tomorrow);
  const key    = `games:${tomorrow}`;
  const cached = checkCache(key);
  if (cached) return cached;

  try {
    const res  = await apiClient.get('/games', { params: { 'dates[]': tomorrow } });
    const data = res.data.data || [];
    setCache(key, data);
    return data;
  } catch (err) {
    console.warn('[API] getUpcomingGames fallback to mock:', err.message);
    return MOCK_GAMES;
  }
};

export const getAllActiveGames = async () => {
  const [t, u] = await Promise.all([getTodaysGames(), getUpcomingGames()]);
  const map = new Map();
  [...t, ...u].forEach(g => map.set(g.id, g));
  return Array.from(map.values());
};

export const getBestProp = async () => {
  try {
    const res = await apiClient.get('/props/best');
    return res.data.data;
  } catch (err) {
    console.warn('[API] getBestProp failed:', err.message);
    return null;
  }
};

export const fetchGameProps = async (gameId) => {
  const key    = `props:${gameId}`;
  const cached = checkCache(key);
  if (cached) return cached;

  try {
    const res  = await apiClient.get(`/games/${gameId}/props`);
    const data = res.data.data || [];
    setCache(key, data);
    return data;
  } catch (err) {
    console.warn('[API] fetchGameProps failed:', err.message);
    return [];
  }
};

export const fetchPlayerShots = async (playerId) => {
  try {
    const res = await apiClient.get(`/players/${playerId}/shots`);
    return res.data.data || { summary: [], shots: [] };
  } catch (err) {
    console.warn('[API] fetchPlayerShots failed:', err.message);
    return { summary: [], shots: [] };
  }
};

export const fetchTeamDefense = async () => {
  const key    = 'team_defense';
  const cached = checkCache(key);
  if (cached) return cached;

  try {
    const res  = await apiClient.get('/teams/defense');
    const data = res.data.data || {};
    setCache(key, data);
    return data;
  } catch (err) {
    console.warn('[API] fetchTeamDefense failed:', err.message);
    return {};
  }
};

export const fetchH2H = async (playerId, opponentAbbr) => {
  if (!playerId || !opponentAbbr) return { games: [], averages: {} };
  const key    = `h2h:${playerId}:${opponentAbbr}`;
  const cached = checkCache(key);
  if (cached) return cached;
  try {
    const res  = await apiClient.get(`/players/${playerId}/h2h`, { params: { opponent: opponentAbbr } });
    const data = res.data.data || { games: [], averages: {} };
    setCache(key, data);
    return data;
  } catch (err) {
    console.warn(`[API] fetchH2H failed:`, err.message);
    return { games: [], averages: {} };
  }
};

export const fetchDashboardSummary = async () => {
  const key    = 'dashboard_summary';
  const cached = checkCache(key);
  if (cached) return cached;
  try {
    const res  = await apiClient.get('/dashboard/summary');
    const data = res.data.data || {};
    setCache(key, data);
    return data;
  } catch (err) {
    console.warn('[API] fetchDashboardSummary failed:', err.message);
    return null;
  }
};

export const fetchLiveScores = async () => {
  try {
    const res = await apiClient.get('/games/live');
    return res.data.data || [];
  } catch (err) {
    console.warn('[API] fetchLiveScores failed:', err.message);
    return null;
  }
};

export const fetchPositionDefense = async (teamAbbr) => {
  if (!teamAbbr) return null;
  const key    = `pos_def:${teamAbbr}`;
  const cached = checkCache(key);
  if (cached) return cached;
  try {
    const res  = await apiClient.get(`/teams/${teamAbbr}/defense-by-position`);
    const data = res.data.data || null;
    setCache(key, data);
    return data;
  } catch (err) {
    console.warn(`[API] fetchPositionDefense(${teamAbbr}) failed:`, err.message);
    return null;
  }
};

export const fetchInjuryReport = async (forceRefresh = false) => {
  const key    = 'injury_report';
  const cached = checkCache(key);
  if (cached && !forceRefresh) return cached;
  try {
    const res  = await apiClient.get(forceRefresh ? '/injuries/refresh' : '/injuries', { timeout: 35_000 });
    const data = res.data.data || [];
    setCache(key, data);
    return data;
  } catch (err) {
    console.warn('[API] fetchInjuryReport failed:', err.message);
    return [];
  }
};

// ── Phase 3: Line History & Edge Analysis ──────────────────────────────────────

export const fetchLineHistory = async (playerId, stat = 'pts', days = 7) => {
  const key = `line_history:${playerId}:${stat}:${days}`;
  const cached = checkCache(key);
  if (cached) return cached;

  try {
    const res = await apiClient.get(`/odds-history/${playerId}`, { 
      params: { stat, days },
      timeout: 15_000 
    });
    const data = res.data;
    setCache(key, data);
    return data;
  } catch (err) {
    console.warn(`[API] fetchLineHistory failed: ${err.message}`);
    return null;
  }
};

export const getPlayerEdgeAnalysis = async (playerId, days = 7) => {
  const key = `edge_analysis:${playerId}:${days}`;
  const cached = checkCache(key);
  if (cached) return cached;

  try {
    const res = await apiClient.get(`/players/${playerId}/edge-analysis`, {
      params: { days },
      timeout: 15_000
    });
    const data = res.data;
    setCache(key, data);
    return data;
  } catch (err) {
    console.warn(`[API] getPlayerEdgeAnalysis failed: ${err.message}`);
    return null;
  }
};

// ── Mock data helpers ──────────────────────────────────────────────────────────

const MOCK_GAMES = [
  { id: '0022300001', date: new Date().toISOString().split('T')[0], status: 'Final',
    win_probability: { home: 62.3, visitor: 37.7 },
    home_team:    { id: 1610612738, abbreviation: 'BOS', full_name: 'Boston Celtics',        score: 112 },
    visitor_team: { id: 1610612752, abbreviation: 'NYK', full_name: 'New York Knicks',        score: 105 } },
  { id: '0022300002', date: new Date().toISOString().split('T')[0], status: 'Final',
    win_probability: { home: 45.1, visitor: 54.9 },
    home_team:    { id: 1610612747, abbreviation: 'LAL', full_name: 'Los Angeles Lakers',     score: 98  },
    visitor_team: { id: 1610612744, abbreviation: 'GSW', full_name: 'Golden State Warriors', score: 120 } },
];

const _pseudoRandom = (seed) => { const x = Math.sin(seed) * 10000; return x - Math.floor(x); };

const _generateMockStats = (playerId) => {
  const basePoints = playerId === 201939 ? 30 : playerId === 1629029 ? 34 : 25;
  const baseRebs   = playerId === 203999 ? 12 : 7;
  const baseAsts   = playerId === 203999 ? 9  : 6;
  let seed = playerId;
  const mockOpponents = ['BOS', 'NYK', 'PHI', 'BKN', 'TOR', 'CHI', 'CLE', 'DET', 'IND', 'MIL', 'ATL', 'CHA', 'MIA', 'ORL', 'WAS', 'DEN', 'MIN', 'OKC', 'POR', 'UTA', 'GSW', 'LAC', 'LAL', 'PHX', 'SAC', 'DAL', 'HOU', 'MEM', 'NOP', 'SAS'];

  return Array.from({ length: 20 }, (_, i) => {
    const date = new Date('2025-03-01');
    date.setDate(date.getDate() - i * 2);
    
    // Pick an opponent pseudo-randomly based on seed
    const oppAbbr = mockOpponents[Math.abs(Math.floor(_pseudoRandom(seed + i * 10) * mockOpponents.length)) % mockOpponents.length];
    const isHome = _pseudoRandom(seed + i * 11) > 0.5;

    return {
      id: `mock_${i}`,
      team: { id: 1610612747, abbreviation: 'LAL' },
      player: { id: playerId, team_id: 1610612747 },
      game: {
        date: date.toISOString().split('T')[0],
        home_team_id: isHome ? 1610612747 : 2,
        visitor_team_id: isHome ? 2 : 1610612747,
        home_team:    { abbreviation: isHome ? 'LAL' : oppAbbr, id: isHome ? 1610612747 : 2 },
        visitor_team: { abbreviation: isHome ? oppAbbr : 'LAL', id: isHome ? 2 : 1610612747 },
      },
      pts:  Math.max(10, Math.round(basePoints + (_pseudoRandom(seed++) * 20 - 10))),
      reb:  Math.max(2,  Math.round(baseRebs   + (_pseudoRandom(seed++) * 8  - 4))),
      ast:  Math.max(1,  Math.round(baseAsts   + (_pseudoRandom(seed++) * 8  - 4))),
      fg3m: Math.max(0,  Math.round(3          + (_pseudoRandom(seed++) * 4  - 2))),
      stl:  Math.max(0,  Math.round(1          + (_pseudoRandom(seed++) * 2  - 1))),
      blk:  Math.max(0,  Math.round(0.5        + (_pseudoRandom(seed++) * 2  - 1))),
      oreb: Math.max(0,  Math.round(1          + (_pseudoRandom(seed++) * 2  - 1))),
      dreb: Math.max(0,  Math.round(5          + (_pseudoRandom(seed++) * 4  - 2))),
      tov:  Math.max(0,  Math.round(2          + (_pseudoRandom(seed++) * 3  - 1))),
      min:  _pseudoRandom(seed++) > 0.1 ? '35:00' : '0',
    };
  });
};

// ── Phase 4: Live Game Tracker ───────────────────────────────────────────────

export const fetchGameBoxScore = async (gameId) => {
  try {
    const res = await apiClient.get(`/games/${gameId}/boxscore`);
    return res.data.data;
  } catch (err) {
    console.warn(`Could not fetch boxscore for game ${gameId}`, err);
    return null;
  }
};

export const fetchGamePlayByPlay = async (gameId) => {
  try {
    const res = await apiClient.get(`/games/${gameId}/playbyplay`);
    return res.data.data;
  } catch (err) {
    console.warn(`Could not fetch play-by-play for game ${gameId}`, err);
    return [];
  }
};

// ── Player Splits Endpoint ───────────────────────────────────────────────────

export const getPlayerSplits = async (playerId, stat = 'pts', line = 27.5, opponent = null) => {
  if (!playerId) return null;
  const key = `splits:${playerId}:${stat}:${line}:${opponent || 'ALL'}`;
  const cached = checkCache(key);
  if (cached) return cached;

  try {
    const params = { stat, line };
    if (opponent && opponent !== 'ALL') {
      params.opponent = opponent;
    }
    const res = await apiClient.get(`/players/${playerId}/splits`, { params });
    const data = res.data.data;
    setCache(key, data);
    return data;
  } catch (err) {
    console.warn(`[API] getPlayerSplits failed for player ${playerId}:`, err.message);
    return null;
  }
};
