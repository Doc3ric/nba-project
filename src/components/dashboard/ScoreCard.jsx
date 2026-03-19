import React from 'react';
import { useNavigate } from 'react-router-dom';

const ScoreCard = ({ game }) => {
  const navigate = useNavigate();

  const getLogoUrl = (teamId) => {
    if (!teamId || teamId === 0) return null;
    return `https://cdn.nba.com/logos/nba/${teamId}/primary/L/logo.svg`;
  };

  const status = game.status || '';
  const isFinal    = status.includes('Final');
  const isLive     = !isFinal && (game.period > 0 || status.match(/Q\d|OT|Halftime/i));
  const isScheduled = !isFinal && !isLive;

  // Determine the status display line
  const getStatusLine = () => {
    if (isFinal) return { label: 'Final', color: 'text-gray-400', pulse: false };
    if (isLive) {
      const period = game.period;
      const clock  = game.clock;
      let label = '';
      if (period >= 5) label = `OT${period - 4}`;
      else if (period > 0) label = `Q${period}`;
      else label = 'Halftime';
      if (clock && clock !== '0:00') label += ` · ${clock}`;
      return { label, color: 'text-[#1DF16A]', pulse: true };
    }
    // Scheduled — show local time
    if (status.match(/(\d+):(\d+)\s*(am|pm)\s*ET/i)) {
      const [_, h, m, ampm] = status.match(/(\d+):(\d+)\s*(am|pm)\s*ET/i);
      let hh = parseInt(h);
      if (ampm.toLowerCase() === 'pm' && hh < 12) hh += 12;
      if (ampm.toLowerCase() === 'am' && hh === 12) hh = 0;
      const d = new Date();
      d.setUTCHours(hh + 4, parseInt(m), 0, 0);
      const local = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
      return { label: local, color: 'text-gray-400', pulse: false };
    }
    return { label: status, color: 'text-gray-400', pulse: false };
  };

  const { label, color, pulse } = getStatusLine();

  const vScore = game.visitor_team?.score;
  const hScore = game.home_team?.score;
  const vWins  = isFinal && vScore != null && hScore != null && vScore > hScore;
  const hWins  = isFinal && hScore != null && vScore != null && hScore > vScore;

  return (
    <div
      onClick={() => navigate(`/game/${game.id}`)}
      className="bg-[#141920] border border-[#1e2530] rounded-xl p-4 cursor-pointer hover:border-[#1DF16A]/40 hover:bg-[#161c24] transition-all group"
    >
      {/* Status line */}
      <div className={`text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5 ${color}`}>
        {pulse && <span className="w-1.5 h-1.5 rounded-full bg-[#1DF16A] animate-pulse inline-block" />}
        {label}
      </div>

      {/* Visitor Row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {getLogoUrl(game.visitor_team?.id) && (
            <img
              src={getLogoUrl(game.visitor_team.id)}
              alt={game.visitor_team.abbreviation}
              className="w-7 h-7 object-contain"
              onError={e => e.target.style.display = 'none'}
            />
          )}
          <span className={`text-sm font-bold ${vWins ? 'text-white' : 'text-gray-400'}`}>
            {game.visitor_team?.abbreviation}
          </span>
        </div>
        <span className={`text-xl font-black tabular-nums ${vWins ? 'text-white' : vScore != null ? 'text-gray-300' : 'text-gray-600'}`}>
          {vScore != null ? vScore : (isScheduled ? '' : '–')}
        </span>
      </div>

      {/* Home Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getLogoUrl(game.home_team?.id) && (
            <img
              src={getLogoUrl(game.home_team.id)}
              alt={game.home_team.abbreviation}
              className="w-7 h-7 object-contain"
              onError={e => e.target.style.display = 'none'}
            />
          )}
          <span className={`text-sm font-bold ${hWins ? 'text-white' : 'text-gray-400'}`}>
            {game.home_team?.abbreviation}
          </span>
        </div>
        <span className={`text-xl font-black tabular-nums ${hWins ? 'text-white' : hScore != null ? 'text-gray-300' : 'text-gray-600'}`}>
          {hScore != null ? hScore : (isScheduled ? '' : '–')}
        </span>
      </div>

      {/* Footer */}
      {!isScheduled && (
        <div className="mt-3 pt-2.5 border-t border-[#1e2530] text-[10px] text-gray-600 text-center uppercase tracking-widest group-hover:text-gray-400 transition-colors">
          View Matchup ↗
        </div>
      )}
      {isScheduled && game.win_probability && (
        <div className="mt-3 pt-2.5 border-t border-[#1e2530] text-center">
          <span className="text-[10px] text-[#1DF16A]/70 font-bold uppercase tracking-widest">
            {Math.max(game.win_probability.home, game.win_probability.visitor).toFixed(1)}% WIN PROB
          </span>
        </div>
      )}
    </div>
  );
};

export default ScoreCard;
