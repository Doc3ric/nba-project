import React, { useEffect, useState, memo } from 'react';
import { Clock, TrendingUp, TrendingDown, Minus, Loader2, Users } from 'lucide-react';
import { fetchH2H } from '../../services/api';

const H2HCard = memo(({ playerId, opponentAbbr, playerName, category = 'pts' }) => {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    if (!playerId || !opponentAbbr) { setLoading(false); return; }
    setLoading(true); setError(false);
    fetchH2H(playerId, opponentAbbr)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [playerId, opponentAbbr]);

  if (!opponentAbbr) return null;

  if (loading) return (
    <div className="bg-sports-card border border-sports-secondary rounded-2xl p-6 flex items-center justify-center h-32">
      <Loader2 className="animate-spin text-sports-accent" size={24} />
    </div>
  );

  if (error || !data) return (
    <div className="bg-sports-card border border-sports-secondary rounded-2xl p-6 text-center text-sports-muted text-sm">
      No H2H data available vs {opponentAbbr}.
    </div>
  );

  const games    = data.games   || [];
  const averages = data.averages || {};
  const catAvg   = averages[category] ?? 0;
  const catLabel = category.toUpperCase();

  const getResult = (g) => g.result === 'W'
    ? <span className="text-sports-accent font-bold text-xs">W</span>
    : <span className="text-sports-red  font-bold text-xs">L</span>;

  const trend = games.length >= 3
    ? (games[0][category] || 0) > (games[2][category] || 0) ? 'up'
    : (games[0][category] || 0) < (games[2][category] || 0) ? 'down'
    : 'flat'
    : 'flat';

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-sports-accent' : trend === 'down' ? 'text-sports-red' : 'text-sports-muted';

  return (
    <div className="bg-sports-card border border-sports-secondary rounded-2xl overflow-hidden shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-sports-secondary bg-sports-dark">
        <div className="flex items-center gap-2">
          <Users size={15} className="text-sports-accent" />
          <span className="text-xs font-black text-white uppercase tracking-widest">
            vs {opponentAbbr} History
          </span>
          <span className="text-[10px] text-sports-muted">({games.length} games)</span>
        </div>
        <div className="flex items-center gap-2">
          <TrendIcon size={14} className={trendColor} />
          <span className={`text-sm font-black ${trendColor}`}>
            {catAvg} avg {catLabel}
          </span>
        </div>
      </div>

      {games.length === 0 ? (
        <div className="p-6 text-center text-sports-muted text-sm">
          No prior games found vs {opponentAbbr}.
        </div>
      ) : (
        <>
          {/* Averages strip */}
          <div className="grid grid-cols-4 gap-0 border-b border-sports-secondary">
            {[['PTS', 'pts'], ['REB', 'reb'], ['AST', 'ast'], ['3PM', 'fg3m']].map(([label, key]) => (
              <div key={key} className={`flex flex-col items-center py-3 border-r border-sports-secondary last:border-r-0 ${key === category ? 'bg-sports-accent/10' : ''}`}>
                <span className="text-[9px] text-sports-muted font-bold uppercase tracking-widest">{label}</span>
                <span className={`text-lg font-black ${key === category ? 'text-sports-accent' : 'text-white'}`}>
                  {averages[key] ?? '-'}
                </span>
                <span className="text-[9px] text-sports-muted">avg</span>
              </div>
            ))}
          </div>

          {/* Game rows */}
          <div className="divide-y divide-sports-secondary/40">
            {games.slice(0, 6).map((g, i) => (
              <div key={i} className="flex items-center px-5 py-2.5 hover:bg-sports-secondary/20 transition-colors">
                <div className="w-20 text-[10px] text-sports-muted font-bold">
                  {g.date ? new Date(g.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '-'}
                </div>
                <div className="flex-1 text-[10px] text-sports-muted">{g.matchup}</div>
                <div className="w-6 text-center">{getResult(g)}</div>
                <div className="w-10 text-right">
                  <span className={`text-sm font-black ${g[category] >= catAvg ? 'text-sports-accent' : 'text-white'}`}>
                    {g[category] ?? '-'}
                  </span>
                  <span className="text-[9px] text-sports-muted ml-0.5">{catLabel}</span>
                </div>
                <div className="w-10 text-right text-[10px] text-sports-muted">{g.min}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

export default H2HCard;
