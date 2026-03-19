import React, { memo, useState, useEffect } from 'react';
import { Shield, Activity, Loader2, TrendingUp, ChevronRight } from 'lucide-react';
import { fetchTeamDefense, fetchPositionDefense } from '../../services/api';

const MatchupContext = memo(({ nextOpponent = '', playerPosition = '' }) => {
  const [teamData, setTeamData] = useState(null);
  const [posData,  setPosData]  = useState(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!nextOpponent) { setLoading(false); return; }
    setLoading(true);

    const posPromise = playerPosition
      ? fetchPositionDefense(nextOpponent).catch(() => null)
      : Promise.resolve(null);

    Promise.all([fetchTeamDefense(), posPromise])
      .then(([all, pos]) => {
        setTeamData(all[nextOpponent] || null);
        setPosData(pos);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [nextOpponent, playerPosition]);

  if (!nextOpponent) return null;

  if (loading) return (
    <div className="bg-sports-dark border border-sports-secondary rounded-xl p-4 h-24 flex items-center justify-center mb-4">
      <Loader2 className="animate-spin text-sports-accent" size={20} />
    </div>
  );

  const pace    = teamData?.pace        != null ? Number(teamData.pace).toFixed(1)       : '-';
  const defRtg  = teamData?.defRating   != null ? Number(teamData.defRating).toFixed(1)  : '-';
  const offRtg  = teamData?.offRating   != null ? Number(teamData.offRating).toFixed(1)  : '-';
  const rank    = teamData?.defRatingRank || 15;
  const wins    = teamData?.wins    ?? '-';
  const losses  = teamData?.losses  ?? '-';

  // Position-specific pts allowed (e.g. how many pts they give up to PGs)
  const normPos = playerPosition?.toUpperCase().replace('-', '').replace('GUARD', 'G').replace('FORWARD', 'F').replace('CENTER', 'C');
  const posStats = posData?.positions?.[normPos] || posData?.positions?.[playerPosition?.toUpperCase()] || null;

  return (
    <div className="bg-[#0c0c0c] border border-gray-800 rounded-2xl p-5 shadow-2xl mb-6 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-sports-accent/5 rounded-full blur-2xl pointer-events-none" />
      
      <div className="flex items-center gap-2 mb-4 relative z-10">
        <Shield size={14} className="text-sports-accent text-glow-accent" />
        <span className="text-[10px] font-black text-white hover:text-sports-accent transition-colors uppercase tracking-widest text-glow-accent">
          {nextOpponent} Defensive Profile
        </span>
        {wins !== '-' && (
          <span className="ml-auto text-[10px] text-sports-muted font-bold bg-sports-secondary/20 px-2 py-0.5 rounded border border-sports-secondary/30">
            {wins}W-{losses}L
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 relative z-10">
        <StatCell label="Pace" value={pace} icon={<Activity size={13} className="text-blue-400" />} subtitle="Poss/48m" />
        <StatCell
          label={`Def Rank`}
          value={`#${rank}`}
          icon={<Shield size={13} className={rank <= 10 ? 'text-sports-red' : rank >= 20 ? 'text-sports-accent' : 'text-yellow-500'} />}
          subtitle={rank <= 5 ? 'ELITE' : rank <= 12 ? 'TOP TIER' : rank >= 25 ? 'WEAK' : 'AVERAGE'}
          valueClass={rank <= 5 ? 'text-sports-red text-glow-red' : rank >= 25 ? 'text-sports-accent text-glow-accent' : 'text-white'}
        />
        <StatCell label="Def Rating" value={defRtg} icon={<Shield size={13} className="text-sports-muted" />} subtitle="Efficiency" />
        <StatCell label="Off Rating" value={offRtg} icon={<TrendingUp size={13} className="text-sports-muted" />} subtitle="Scoring" />
      </div>

      {/* Position-adjusted section */}
      {posStats && (
        <div className="mt-4 pt-4 border-t border-gray-800/60 relative z-10">
          <div className="flex items-center gap-1.5 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-sports-highlight shadow-[0_0_8px_rgba(168,85,247,0.6)]" />
            <span className="text-[10px] font-black text-sports-highlight uppercase tracking-widest text-glow-highlight">
              vs {playerPosition || normPos} Matchup
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              ['PTS Allowed', posStats.pts_allowed],
              ['REB Allowed', posStats.reb_allowed],
              ['FG% Allowed', posStats.fg_pct_allowed ? `${(posStats.fg_pct_allowed * 100).toFixed(1)}%` : '-'],
            ].map(([label, val]) => (
              <div key={label} className="bg-sports-card/50 backdrop-blur-sm rounded-xl px-2 py-2 text-center border border-sports-secondary/20 hover:border-sports-highlight/30 transition-all">
                <p className="text-[9px] text-sports-muted uppercase font-bold tracking-tighter mb-0.5">{label}</p>
                <p className="text-sm font-black text-white">{typeof val === 'number' ? val.toFixed(1) : val}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

const StatCell = ({ label, value, icon, subtitle, valueClass = 'text-white' }) => (
  <div className="flex items-start gap-2">
    <div className="w-7 h-7 rounded-full bg-sports-card border border-sports-secondary flex items-center justify-center shrink-0">
      {icon}
    </div>
    <div>
      <p className="text-[9px] text-sports-muted font-bold uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-bold ${valueClass}`}>{value}</p>
      <p className="text-[9px] text-sports-muted">{subtitle}</p>
    </div>
  </div>
);

export default MatchupContext;
