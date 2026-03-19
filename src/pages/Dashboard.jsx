import React, { useEffect, useState, useRef, useCallback } from 'react';
import PlayerSearch from '../components/player/PlayerSearch';
import ScoreCard from '../components/dashboard/ScoreCard';
import GameCard from '../components/dashboard/GameCard';
import DashboardStrip from '../components/dashboard/DashboardStrip';
import { getTodaysGames, getUpcomingGames, fetchLiveScores } from '../services/api';
import { Loader2, Radio, RefreshCw } from 'lucide-react';

const Dashboard = () => {
  const [todayGames,    setTodayGames]    = useState([]);
  const [upcomingGames, setUpcomingGames] = useState([]);
  const [isLoading,     setIsLoading]     = useState(true);
  const [isLive,        setIsLive]        = useState(false);
  const [lastUpdated,   setLastUpdated]   = useState(new Date());
  const [isRefreshing,  setIsRefreshing]  = useState(false);
  const pollRef = useRef(null);

  const mergeScores = useCallback((base, live) => {
    if (!live || !live.length) return base;
    const liveMap = Object.fromEntries(live.map(g => [String(g.id), g]));
    return base.map(g => {
      const l = liveMap[String(g.id)];
      if (!l) return g;
      return {
        ...g,
        status: l.status,
        clock:  l.clock,
        period: l.period,
        home_team:    { ...g.home_team,    score: l.home_team?.score    ?? g.home_team?.score },
        visitor_team: { ...g.visitor_team, score: l.visitor_team?.score ?? g.visitor_team?.score },
      };
    });
  }, []);

  const loadAll = useCallback(async () => {
    const [today, upcoming, live] = await Promise.all([
      getTodaysGames(),
      getUpcomingGames(),
      fetchLiveScores(),
    ]);
    const merged = live?.length ? mergeScores(today || [], live) : (today || []);
    setTodayGames(merged);
    setUpcomingGames(upcoming || []);
    setLastUpdated(new Date());
    const hasLive = merged.some(g => {
      const s = g.status || '';
      return !s.includes('Final') && g.period > 0;
    });
    setIsLive(hasLive);
  }, [mergeScores]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadAll();
    setIsRefreshing(false);
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await loadAll();
      setIsLoading(false);
      // Poll for live score updates every 30s
      pollRef.current = setInterval(async () => {
        const live = await fetchLiveScores();
        if (live && live.length > 0) {
          setTodayGames(prev => mergeScores(prev, live));
          const hasLive = live.some(g => {
            const s = g.status || '';
            return !s.includes('Final') && g.period > 0;
          });
          setIsLive(hasLive);
        }
      }, 30_000);
    };
    init();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadAll, mergeScores]);

  // Date labels with smart offsets so the UI header matches the fetched games
  const etDateLabel = () => {
    try {
      // Small fallback using standard offsets if imported function is unavailable inside the component
      const offsets = require('../services/api').getSmartDateOffsets();
      const nyTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
      const d = new Date(nyTime);
      d.setDate(d.getDate() + offsets.today);
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + " ET";
    } catch {
      const nyTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
      return new Date(nyTime).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + " ET";
    }
  };

  const tomorrowLabel = () => {
    try {
      const offsets = require('../services/api').getSmartDateOffsets();
      const nyTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
      const d = new Date(nyTime);
      d.setDate(d.getDate() + offsets.tomorrow);
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + " ET";
    } catch {
      const nyTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
      const d = new Date(nyTime);
      d.setDate(d.getDate() + 1);
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + " ET";
    }
  };

  return (
    <div className="space-y-10 pb-12 animate-in fade-in duration-500">
      {/* Search */}
      <div className="flex justify-center mt-2 mb-10 w-full relative z-30">
        <PlayerSearch />
      </div>

      {/* Key Stats Grid */}
      <div>
        <h2 className="text-sm font-bold text-gray-300 tracking-widest uppercase mb-4">KEY STATS GRID</h2>
        <DashboardStrip />
      </div>

      {/* ── TODAY'S SCORES ────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-gray-300 tracking-widest uppercase m-0">TODAY'S SCORES</h2>
            {isLive && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-[#1DF16A] bg-[#1DF16A]/10 border border-[#1DF16A]/30 px-2.5 py-0.5 rounded-full animate-pulse">
                <Radio size={9} /> LIVE
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-500 hidden sm:block">
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-1.5 hover:bg-[#1e2530] rounded-full transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-[#1DF16A]' : 'text-gray-500 hover:text-gray-300'} />
            </button>
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-[#1e2530] px-3 py-1 rounded-full border border-[#262c36]">
              {etDateLabel()} ET
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="h-48 flex flex-col items-center justify-center text-gray-600 space-y-3">
            <Loader2 className="animate-spin text-[#1DF16A]" size={28} />
            <span className="text-xs">Fetching today's games…</span>
          </div>
        ) : todayGames.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {todayGames.map(game => (
              <ScoreCard key={game.id} game={game} />
            ))}
          </div>
        ) : (
          <div className="bg-[#141920] border border-[#1e2530] p-10 text-center rounded-xl">
            <p className="text-gray-600 text-sm">No games played today.</p>
          </div>
        )}
      </div>

      {/* ── UPCOMING SLATE (Tomorrow) ─────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-300 tracking-widest uppercase m-0">UPCOMING SLATE</h2>
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-[#1e2530] px-3 py-1 rounded-full border border-[#262c36]">
            {tomorrowLabel()} ET
          </span>
        </div>

        {isLoading ? (
          <div className="h-48 flex flex-col items-center justify-center text-gray-600 space-y-3">
            <Loader2 className="animate-spin text-[#1DF16A]" size={28} />
            <span className="text-xs">Fetching upcoming slate…</span>
          </div>
        ) : upcomingGames.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {upcomingGames.map(game => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        ) : (
          <div className="bg-[#141920] border border-[#1e2530] p-10 text-center rounded-xl">
            <p className="text-gray-600 text-sm">No upcoming games scheduled.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
