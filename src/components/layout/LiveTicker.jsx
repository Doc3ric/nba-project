import React, { useEffect, useState } from 'react';
import { getTodaysGames, fetchLiveScores } from '../../services/api';

const LiveTicker = () => {
  const [games, setGames] = useState([]);

  useEffect(() => {
    let mounted = true;

    const refresh = async () => {
      // Prefer live data (real-time scores); fall back to today's schedule
      const live = await fetchLiveScores();
      if (mounted && live && live.length > 0) {
        setGames(live);
        return;
      }
      const today = await getTodaysGames();
      if (mounted && today && today.length > 0) setGames(today);
    };

    refresh();
    const interval = setInterval(refresh, 30_000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!games || games.length === 0) return null;

  return (
    <div className="bg-[#1a1f26] border-b border-[#1a9a5c]/30 text-white font-bold text-[11px] py-1.5 overflow-hidden whitespace-nowrap flex items-center relative z-50">
      {/* "LIVE" Indicator badge pinned to the left */}
      <div className="absolute left-0 top-0 bottom-0 bg-[#1a1f26] flex items-center px-4 border-r border-[#262c36] z-10 shadow-[10px_0_15px_-3px_rgba(26,31,38,1)]">
        <span className="flex items-center gap-1.5 text-[#1a9a5c] tracking-widest uppercase animate-pulse">
           <span className="w-1.5 h-1.5 rounded-full bg-[#1a9a5c]"></span>
           LIVE SCORES
        </span>
      </div>

      <div className="animate-marquee inline-block pl-40">
        {games.map(game => (
           <span key={game.id} className="mx-6 tracking-wider">
             <span className="text-gray-400">{game.visitor_team.abbreviation}</span>{' '}
             <span className={game.visitor_team.score > game.home_team.score ? 'text-white' : 'text-gray-300'}>
               {game.visitor_team.score ?? '-'}
             </span>
             <span className="text-gray-600 mx-2">@</span>
             <span className="text-gray-400">{game.home_team.abbreviation}</span>{' '}
             <span className={game.home_team.score > game.visitor_team.score ? 'text-white' : 'text-gray-300'}>
               {game.home_team.score ?? '-'}
             </span>
             <span className={`ml-2 ${game.status && game.status.includes('Final') ? 'text-gray-500' : 'text-[#1a9a5c]'}`}>
               ({game.status || 'Scheduled'})
             </span>
           </span>
        ))}
        {/* Duplicate for seamless looping */}
        {games.map(game => (
           <span key={game.id + 'dup'} className="mx-6 tracking-wider">
             <span className="text-gray-400">{game.visitor_team.abbreviation}</span>{' '}
             <span className={game.visitor_team.score > game.home_team.score ? 'text-white' : 'text-gray-300'}>
               {game.visitor_team.score ?? '-'}
             </span>
             <span className="text-gray-600 mx-2">@</span>
             <span className="text-gray-400">{game.home_team.abbreviation}</span>{' '}
             <span className={game.home_team.score > game.visitor_team.score ? 'text-white' : 'text-gray-300'}>
               {game.home_team.score ?? '-'}
             </span>
             <span className={`ml-2 ${game.status && game.status.includes('Final') ? 'text-gray-500' : 'text-[#1a9a5c]'}`}>
               ({game.status || 'Scheduled'})
             </span>
           </span>
        ))}
      </div>
    </div>
  );
};

export default LiveTicker;
