import React from 'react';
import { useNavigate } from 'react-router-dom';

const GameCard = ({ game }) => {
  const navigate = useNavigate();
  const isFinal = game.status === 'Final';
  
  const handleViewEdge = (e) => {
    e.stopPropagation();
    navigate(`/game/${game.id}`);
  };

  // Helper to convert "7:00 PM ET" to PH Time (local)
  const formatGameTime = (status, gameDate) => {
    if (isFinal) return 'Final';
    
    // Check if status is a time (e.g., "7:00 pm ET")
    const timeMatch = status.match(/(\d+):(\d+)\s*(am|pm)\s*ET/i);
    if (timeMatch) {
      const [_, hours, minutes, ampm] = timeMatch;
      let h = parseInt(hours);
      if (ampm.toLowerCase() === 'pm' && h < 12) h += 12;
      if (ampm.toLowerCase() === 'am' && h === 12) h = 0;
      
      // NBA ET is usually UTC-4 (EDT) in March or UTC-5 (EST)
      // We'll assume EDT (UTC-4) for now as it's mid-March
      const date = new Date(gameDate);
      date.setUTCHours(h + 4, parseInt(minutes)); // Add 4 to get to UTC
      
      return date.toLocaleTimeString('en-PH', { 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
      });
    }
    
    return status;
  };

  const getLogoUrl = (teamId) => {
    if (!teamId || teamId === 0) return 'https://cdn.nba.com/logos/nba/1610612747/primary/L/logo.svg'; 
    return `https://cdn.nba.com/logos/nba/${teamId}/primary/L/logo.svg`;
  };
  let wpColorClass = "text-[#1a9a5c] bg-[#1a9a5c]/10";
  let wpValue = 0;
  if (game.win_probability) {
    wpValue = Math.max(game.win_probability.home, game.win_probability.visitor);
    if (wpValue >= 65) {
      wpColorClass = "text-[#1a9a5c] bg-[#1a9a5c]/10 border border-[#1a9a5c]/20";
    } else if (wpValue >= 55) {
      wpColorClass = "text-yellow-500 bg-yellow-500/10 border border-yellow-500/20";
    } else {
      wpColorClass = "text-red-500 bg-red-500/10 border border-red-500/20";
    }
  }

  return (
    <div 
      onClick={() => navigate(`/game/${game.id}`)}
      className="bg-[#1a1f26] border border-[#262c36] rounded-xl flex flex-col p-4 shadow-sm hover:border-[#1a9a5c]/50 transition-all cursor-pointer group relative"
    >
      {/* Teams Row */}
      <div className="flex justify-between items-center px-2">
        {/* Visitor */}
        <div className="flex flex-col items-start w-1/3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 flex items-center justify-center">
              <img 
                src={getLogoUrl(game.visitor_team.id)} 
                alt={game.visitor_team.abbreviation} 
                className="w-full h-full object-contain" 
                onError={(e) => { e.target.src = 'https://cdn.nba.com/logos/nba/1610612738/primary/L/logo.svg'; }}
              />
            </div>
            <span className="font-bold text-white text-sm">{game.visitor_team.abbreviation}</span>
          </div>
          <span className="text-[10px] text-gray-400 mt-1.5 font-medium ml-1">
            {game.visitor_team.score !== null ? `Score: ${game.visitor_team.score}` : (game.visitor_team.record || '-')}
          </span>
        </div>

        {/* VS */}
        <div className="text-gray-500 font-bold text-[10px] uppercase w-1/3 text-center mt-1">VS</div>

        {/* Home */}
        <div className="flex flex-col items-end w-1/3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-sm">{game.home_team.abbreviation}</span>
            <div className="w-6 h-6 flex items-center justify-center">
              <img 
                src={getLogoUrl(game.home_team.id)} 
                alt={game.home_team.abbreviation} 
                className="w-full h-full object-contain" 
                onError={(e) => { e.target.src = 'https://cdn.nba.com/logos/nba/1610612738/primary/L/logo.svg'; }}
              />
            </div>
          </div>
          <span className="text-[10px] text-gray-400 mt-1.5 font-medium mr-1">
            {game.home_team.score !== null ? `Score: ${game.home_team.score}` : (game.home_team.record || '-')}
          </span>
        </div>
      </div>

      {/* Win Prob */}
      {game.win_probability ? (
        <div className="text-center mt-3">
          <span className={`text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded ${wpColorClass}`}>
            {wpValue.toFixed(1)}% WIN PROB
          </span>
        </div>
      ) : (
        <div className="text-center mt-3 h-4"></div>
      )}

      {/* Stats/Time Divider Row */}
      <div className="flex items-center justify-center mt-5 mb-4 border-t border-[#262c36]/60 pt-3 px-1">
        <span className={`text-[10px] font-bold ${isFinal ? 'text-gray-500' : 'text-[#1a9a5c] animate-pulse'}`}>
          {formatGameTime(game.status, game.date)}
        </span>
      </div>

      {/* Button */}
      <button 
        onClick={handleViewEdge}
        className="w-full py-2.5 bg-[#212730] hover:bg-[#2d3440] border border-[#262c36] rounded-lg text-[10px] font-bold text-gray-300 transition-colors uppercase tracking-widest flex justify-center items-center gap-1.5 group-hover:border-[#1a9a5c]/50"
      >
        VIEW EDGE <span className="font-black text-sm relative top-[1px]">↗</span>
      </button>
    </div>
  );
};


export default GameCard;
