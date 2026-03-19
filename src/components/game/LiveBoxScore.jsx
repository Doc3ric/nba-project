import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { fetchGameBoxScore } from '../../services/api';
import PlayerIcon from '../common/PlayerIcon';

const LiveBoxScore = ({ gameId, homeTeam, visitorTeam, isLive }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTeamId, setActiveTeamId] = useState(visitorTeam.id);
  const pollRef = useRef(null);

  const loadData = React.useCallback(async () => {
    try {
      const result = await fetchGameBoxScore(gameId);
      if (result) setData(result);
    } catch {
      // Handle silently during poll
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    loadData();
    if (isLive) {
      pollRef.current = setInterval(loadData, 15000);
    }
    return () => clearInterval(pollRef.current);
  }, [loadData, isLive]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="animate-spin text-sports-accent mb-4" size={32} />
        <span className="text-sports-muted">Loading live box score...</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-sports-card/30 border border-sports-secondary/30 rounded-xl p-12 text-center">
        <AlertCircle className="mx-auto text-sports-muted mb-4" size={32} />
        <p className="text-sports-muted">Live box score data is currently unavailable.</p>
      </div>
    );
  }

  // Ensure activeTeamId is valid
  const currentTeamId = activeTeamId || (data[0] ? data[0].team_id : null);
  const activeTeamData = data.find(t => t.team_id === currentTeamId);

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Team Toggle Tabs */}
      <div className="flex bg-sports-card border border-sports-secondary rounded-lg p-1 max-w-sm mx-auto">
        <button
          onClick={() => setActiveTeamId(visitorTeam.id)}
          className={`flex-1 py-1.5 text-sm font-bold uppercase tracking-widest rounded-md transition-all ${
            currentTeamId === visitorTeam.id
              ? 'bg-sports-secondary text-white shadow-sm'
              : 'text-sports-muted hover:text-gray-300'
          }`}
        >
          {visitorTeam.abbreviation}
        </button>
        <button
          onClick={() => setActiveTeamId(homeTeam.id)}
          className={`flex-1 py-1.5 text-sm font-bold uppercase tracking-widest rounded-md transition-all ${
            currentTeamId === homeTeam.id
              ? 'bg-sports-secondary text-white shadow-sm'
              : 'text-sports-muted hover:text-gray-300'
          }`}
        >
          {homeTeam.abbreviation}
        </button>
      </div>

      {activeTeamData && (
        <div className="overflow-x-auto border border-sports-secondary rounded-xl bg-sports-card shadow-lg">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#12161c] border-b border-sports-secondary text-sports-muted text-xs uppercase font-black tracking-widest">
              <tr>
                <th className="px-4 py-3 sticky left-0 z-10 bg-[#12161c]">Player</th>
                <th className="px-4 py-3 text-right">MIN</th>
                <th className="px-4 py-3 text-right text-white">PTS</th>
                <th className="px-4 py-3 text-right">REB</th>
                <th className="px-4 py-3 text-right">AST</th>
                <th className="px-4 py-3 text-right">STL</th>
                <th className="px-4 py-3 text-right">BLK</th>
                <th className="px-4 py-3 text-right">FG%</th>
                <th className="px-4 py-3 text-right">3P%</th>
                <th className="px-4 py-3 text-right">+/-</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sports-secondary/50">
              {activeTeamData.players.map((p) => {
                const isStarter = p.start_position !== "";
                return (
                  <tr key={p.player_id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-4 py-3 sticky left-0 z-10 bg-sports-card group-hover:bg-[#1a1f26] transition-colors flex items-center gap-3">
                      <PlayerIcon playerId={p.player_id} name={p.player_name} teamAbbr={activeTeamData.team_abbreviation} className="w-8 h-8" />
                      <div>
                        <span className="font-bold text-gray-200 block truncate max-w-[120px]">{p.player_name}</span>
                        {isStarter && <span className="text-[9px] uppercase font-bold text-sports-accent">{p.start_position}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sports-muted font-medium">{p.min}</td>
                    <td className="px-4 py-3 text-right text-white font-black">{p.pts}</td>
                    <td className="px-4 py-3 text-right text-gray-300 font-medium">{p.reb}</td>
                    <td className="px-4 py-3 text-right text-gray-300 font-medium">{p.ast}</td>
                    <td className="px-4 py-3 text-right text-gray-400 font-medium">{p.stl}</td>
                    <td className="px-4 py-3 text-right text-gray-400 font-medium">{p.blk}</td>
                    <td className="px-4 py-3 text-right text-gray-500 font-medium">{(p.fg_pct * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right text-gray-500 font-medium">{(p.fg3_pct * 100).toFixed(1)}%</td>
                    <td className={`px-4 py-3 text-right font-black ${p.plus_minus > 0 ? 'text-sports-accent' : p.plus_minus < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                      {p.plus_minus > 0 ? `+${p.plus_minus}` : p.plus_minus}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default LiveBoxScore;
