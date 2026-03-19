import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle, CircleDashed, CheckCircle2, XCircle } from 'lucide-react';
import { fetchGamePlayByPlay } from '../../services/api';
import PlayerIcon from '../common/PlayerIcon';

const LivePlayByPlay = ({ gameId, isLive, homeTeam, visitorTeam }) => {
  const [plays, setPlays] = useState([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  const loadData = React.useCallback(async () => {
    try {
      const result = await fetchGamePlayByPlay(gameId);
      if (result) setPlays(result);
    } catch {
      // Silent error for polling
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
        <span className="text-sports-muted">Loading play-by-play events...</span>
      </div>
    );
  }

  if (!plays || plays.length === 0) {
    return (
      <div className="bg-sports-card/30 border border-sports-secondary/30 rounded-xl p-12 text-center">
        <AlertCircle className="mx-auto text-sports-muted mb-4" size={32} />
        <p className="text-sports-muted">Play-by-play data is currently unavailable.</p>
      </div>
    );
  }

  const getPlayIcon = (msgType) => {
    // 1=Make, 2=Miss, 3=FT, 4=Reb, 5=TOV, 6=Foul
    switch (msgType) {
      case 1:
      case 3: return <CheckCircle2 className="text-sports-accent" size={20} />;
      case 2: return <XCircle className="text-red-500" size={20} />;
      case 5:
      case 6: return <AlertCircle className="text-orange-400" size={20} />;
      default: return <CircleDashed className="text-gray-500" size={16} />;
    }
  };

  return (
    <div className="bg-sports-card border border-sports-secondary rounded-xl p-4 md:p-6 shadow-sm animate-in fade-in">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-black text-white uppercase tracking-widest">Recent Plays</h3>
        {isLive && (
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 bg-sports-accent/10 text-sports-accent border border-sports-accent/20 rounded animate-pulse">
            Live updates
          </span>
        )}
      </div>

      <div className="relative pl-4 space-y-6 before:absolute before:inset-0 before:left-[23px] before:w-px before:bg-sports-secondary">
        {plays.map((play, index) => {
          const isHome = play.player1?.team_abbr === homeTeam.abbreviation;
          const isVisitor = play.player1?.team_abbr === visitorTeam.abbreviation;
          
          return (
            <div key={`${play.event_num}-${index}`} className="relative flex gap-4 items-start group">
              <div className="absolute -left-1.5 mt-0.5 bg-sports-card z-10 ring-4 ring-sports-card">
                {getPlayIcon(play.event_msg_type)}
              </div>
              
              <div className="flex-1 ml-6 bg-sports-dark/50 hover:bg-sports-secondary/30 transition-colors rounded-lg p-3 border border-transparent hover:border-sports-secondary/50 flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 text-center shrink-0">
                    <span className="block text-xs font-black text-sports-muted">Q{play.period}</span>
                    <span className="block text-[10px] text-gray-500 mt-0.5">{play.clock}</span>
                  </div>
                  
                  {play.player1?.id > 0 && (
                    <PlayerIcon playerId={play.player1.id} name={play.player1.name} teamAbbr={play.player1.team_abbr} className="w-8 h-8 hidden sm:block" />
                  )}
                  
                  <div className="text-sm font-medium text-gray-200">
                    {play.description}
                  </div>
                </div>

                {play.score && (
                  <div className="shrink-0 bg-black/40 px-3 py-1.5 rounded border border-sports-secondary flex items-center gap-2">
                    <span className={`font-black ${isVisitor ? 'text-white' : 'text-gray-500'}`}>{play.score.split('-')[0]}</span>
                    <span className="text-gray-600">-</span>
                    <span className={`font-black ${isHome ? 'text-white' : 'text-gray-500'}`}>{play.score.split('-')[1]}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LivePlayByPlay;
