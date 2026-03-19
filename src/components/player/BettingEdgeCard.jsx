import React, { useState, memo, useMemo } from 'react';
import { Target, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { useBettingEdge } from '../../hooks/useAnalytics';
import { LineChart, Line, ResponsiveContainer, ReferenceLine } from 'recharts';

const BettingEdgeCard = memo(({ stats, categoryLabel = "Points", category = "pts" }) => {
  const [line, setLine] = useState("24.5");
  const parsedLine = parseFloat(line) || 0;
  
  // Supplying mock context to match our new Context Panel feature
  const matchupContext = { pace: 97.4, defRatingRank: 2 };
  
  const { hitRateL5, hitRateL10, predictionScore, predictionConfidence, consistencyObj } = useBettingEdge(stats, category, parsedLine, matchupContext);
  
  const isOverFavored = predictionScore >= 55;
  const isUnderFavored = predictionScore <= 45;

  const sparklineData = useMemo(() => {
    if (!stats || !stats.length) return [];
    return stats.slice(0, 5).reverse().map(g => ({ val: g[category] || 0 }));
  }, [stats, category]);

  return (
    <div className="bg-sports-card border border-sports-secondary rounded-xl p-6 shadow-lg relative overflow-hidden group">
      {/* Dynamic Background Glow based on edge */}
      <div className={`absolute -right-20 -top-20 w-40 h-40 blur-3xl rounded-full opacity-20 transition-colors pointer-events-none ${isOverFavored ? 'bg-sports-accent' : isUnderFavored ? 'bg-sports-red' : 'bg-blue-500'}`}></div>

      <div className="flex justify-between items-start mb-6 relative z-10">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Target className="text-sports-accent" size={20} />
            Prop Insight
          </h3>
          <p className="text-sports-muted text-sm mt-1">{categoryLabel} Edge Analysis</p>
        </div>
        
        <div className="flex items-center space-x-2 bg-sports-dark p-1.5 rounded-lg border border-sports-secondary">
          <span className="text-xs text-sports-muted font-bold pl-2 cursor-pointer" onClick={() => setLine((parsedLine - 0.5).toString())}>-</span>
          <span className="text-xs text-sports-muted font-bold pl-1">LINE</span>
          <input
            type="number"
            step="0.5"
            value={line}
            onChange={(e) => setLine(e.target.value)}
            className="bg-transparent text-white font-bold w-16 text-center outline-none"
          />
          <span className="text-xs text-sports-muted font-bold pr-2 cursor-pointer" onClick={() => setLine((parsedLine + 0.5).toString())}>+</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 relative z-10 hidden sm:grid">
        <div className="bg-sports-dark rounded-lg p-4 border border-sports-secondary flex flex-col items-center justify-center">
          <span className="text-sports-muted text-[10px] font-bold uppercase tracking-wider mb-2">L10 Hit Rate</span>
          <div className="flex items-end gap-1">
            <span className={`text-2xl font-black ${hitRateL10 >= 60 ? 'text-sports-accent' : hitRateL10 <= 40 ? 'text-sports-red' : 'text-white'}`}>
              {hitRateL10}%
            </span>
          </div>
        </div>
        
        <div className="bg-sports-dark rounded-lg p-3 border border-sports-secondary flex flex-col items-center justify-center relative">
          <span className="text-sports-muted text-[10px] font-bold uppercase tracking-wider mb-1">Form (L5)</span>
          <div className="flex items-end gap-1 mb-2">
            <span className={`text-2xl font-black ${hitRateL5 >= 60 ? 'text-sports-accent' : hitRateL5 <= 40 ? 'text-sports-red' : 'text-white'}`}>
              {hitRateL5}%
            </span>
          </div>
          <div className="w-full h-8 px-1">
             <ResponsiveContainer width="100%" height="100%">
               <LineChart data={sparklineData}>
                  <Line type="monotone" dataKey="val" stroke={hitRateL5 >= 60 ? "#1a9a5c" : hitRateL5 <= 40 ? "#ef4444" : "#4b5563"} strokeWidth={2} dot={{ r: 1.5, fill: hitRateL5 >= 60 ? "#1a9a5c" : hitRateL5 <= 40 ? "#ef4444" : "#4b5563" }} isAnimationActive={false} />
                  <ReferenceLine y={parsedLine} stroke="#ffffff" strokeOpacity={0.2} strokeDasharray="3 3" />
               </LineChart>
             </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-sports-dark rounded-lg p-4 border border-sports-secondary flex flex-col items-center justify-center">
          <span className="text-sports-muted text-[10px] font-bold uppercase tracking-wider mb-2 text-center">Consistency</span>
          <div className="flex flex-col items-center gap-1">
            <span className="text-xl font-bold text-white">{consistencyObj.score}</span>
            <span className="text-[10px] text-sports-muted">{consistencyObj.label}</span>
          </div>
        </div>

        <div className="bg-sports-dark rounded-lg p-4 border border-sports-accent/30 shadow-[0_0_15px_rgba(29,241,106,0.1)] flex flex-col items-center justify-center relative">
          <div className="absolute top-2 right-2 text-[10px] font-bold text-sports-muted bg-sports-secondary/50 px-2 py-0.5 rounded">
            {predictionConfidence} Conf
          </div>
          <span className="text-sports-muted text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1 mt-2">
             True Prob <AlertCircle size={10} className="text-sports-muted" />
          </span>
          <div className="flex items-end gap-1">
            <span className={`text-3xl font-black ${isOverFavored ? 'text-sports-accent' : isUnderFavored ? 'text-sports-red' : 'text-blue-400'}`}>
              {predictionScore}%
            </span>
          </div>
        </div>
      </div>
      
      {/* Mobile view */}
      <div className="sm:hidden grid grid-cols-2 gap-2 relative z-10 mb-4">
        <div className="bg-sports-dark rounded-lg p-3 border border-sports-secondary flex flex-col items-center">
          <span className="text-sports-muted text-[10px] font-bold uppercase text-center">Consistency</span>
          <span className={`text-lg font-black text-white`}>{consistencyObj.label}</span>
        </div>
        <div className="bg-sports-dark rounded-lg p-3 border border-sports-accent/30 flex flex-col items-center">
           <span className="text-sports-muted text-[10px] font-bold uppercase text-center">True Prob</span>
           <span className={`text-2xl font-black ${isOverFavored ? 'text-sports-accent' : isUnderFavored ? 'text-sports-red' : 'text-blue-400'}`}>{predictionScore}%</span>
        </div>
      </div>

      <div className="mt-6 pt-5 border-t border-sports-secondary relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isOverFavored ? (
            <TrendingUp className="text-sports-accent" size={24} />
          ) : isUnderFavored ? (
            <TrendingDown className="text-sports-red" size={24} />
          ) : (
            <div className="w-6 h-6 rounded-full bg-sports-muted flex items-center justify-center text-sports-dark font-bold text-xs">-</div>
          )}
          <span className="font-bold text-white text-sm sm:text-base">
            {isOverFavored 
              ? `Model projects OVER ${parsedLine} with ${predictionScore}% ${predictionConfidence} confidence` 
              : isUnderFavored 
              ? `Model projects UNDER ${parsedLine} with ${100 - predictionScore}% ${predictionConfidence} confidence` 
              : "Model projection is NEUTRAL"}
          </span>
        </div>
        <button 
          onClick={() => alert("Betting Slips integration coming soon! This feature will allow you to add these projections directly to your sportsbook slip.")}
          className="bg-sports-accent hover:bg-sports-accent/80 text-sports-dark font-bold py-2 px-4 rounded-lg transition-colors text-sm hidden sm:block"
        >
          View Slips
        </button>
      </div>
    </div>
  );
});

export default BettingEdgeCard;
