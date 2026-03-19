import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ComposedChart, Bar } from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle, Loader2 } from 'lucide-react';
import { fetchLineHistory } from '../../services/api';

/**
 * LineMovementChart - Displays line movement and sharp action detection over time
 */
const LineMovementChart = ({ playerId, stat = 'pts', days = 7 }) => {
  const [lineData, setLineData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadLineHistory = async () => {
      try {
        setLoading(true);
        const data = await fetchLineHistory(playerId, stat, days);
        
        if (data && data.history && data.history.length > 0) {
          // Format data for chart - reverse to show oldest first
          const formattedData = data.history.slice().reverse().map((item, idx) => ({
            timestamp: new Date(item.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' }),
            line: item.line,
            odds: item.american_odds,
            impliedProb: item.implied_probability,
            bookmaker: item.bookmaker,
            index: idx
          }));
          
          setLineData({
            history: formattedData,
            summary: data.summary,
            lineMovement: data.line_movement,
            sharpDetected: data.sharp_movement_detected
          });
        } else {
          setError('No line history available');
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (playerId) {
      loadLineHistory();
    }
  }, [playerId, stat, days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-80 bg-sports-card/50 rounded-xl border border-sports-secondary/30">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-sports-accent" size={32} />
          <p className="text-sports-muted text-sm">Loading line history...</p>
        </div>
      </div>
    );
  }

  if (error || !lineData) {
    return (
      <div className="flex items-center justify-center h-80 bg-sports-card/50 rounded-xl border border-sports-secondary/30">
        <p className="text-sports-muted text-sm">{error || 'No line movement data available'}</p>
      </div>
    );
  }

  const summary = lineData.summary;
  const isLineMovingUp = lineData.lineMovement > 0;

  return (
    <div className="space-y-4">
      {/* Sharp Movement Alert */}
      {lineData.sharpDetected && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="text-orange-400 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="text-orange-400 font-bold text-sm">Sharp Action Detected</p>
            <p className="text-orange-300/80 text-xs mt-1">Line moved significantly with opposing odds movement - indicates sharp money activity</p>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-sports-card/40 border border-sports-secondary/30 rounded-lg p-3">
          <p className="text-[10px] text-sports-muted uppercase font-bold mb-1 opacity-70">Current Line</p>
          <p className="text-lg font-black text-white">{summary.current_line}</p>
        </div>
        
        <div className="bg-sports-card/40 border border-sports-secondary/30 rounded-lg p-3">
          <p className="text-[10px] text-sports-muted uppercase font-bold mb-1 opacity-70">7d Avg</p>
          <p className="text-lg font-black text-sports-accent">{summary.avg_line}</p>
        </div>
        
        <div className={`bg-sports-card/40 border rounded-lg p-3 ${isLineMovingUp ? 'border-sports-accent/30' : 'border-red-500/30'}`}>
          <p className="text-[10px] text-sports-muted uppercase font-bold mb-1 opacity-70">Movement</p>
          <div className="flex items-center gap-2">
            {isLineMovingUp ? (
              <>
                <TrendingUp className="text-sports-accent" size={16} />
                <p className="text-lg font-black text-sports-accent">+{lineData.lineMovement.toFixed(2)}</p>
              </>
            ) : (
              <>
                <TrendingDown className="text-red-500" size={16} />
                <p className="text-lg font-black text-red-500">{lineData.lineMovement.toFixed(2)}</p>
              </>
            )}
          </div>
        </div>
        
        <div className="bg-sports-card/40 border border-sports-secondary/30 rounded-lg p-3">
          <p className="text-[10px] text-sports-muted uppercase font-bold mb-1 opacity-70">Range</p>
          <p className="text-sm font-bold text-white">{summary.lowest_line} - {summary.highest_line}</p>
        </div>
      </div>

      {/* Line Movement Chart */}
      <div className="bg-sports-card/30 border border-sports-secondary/30 rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-4">Line Movement ({days} Days)</h3>
        
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={lineData.history} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="#1e293b" 
              vertical={false}
            />
            <XAxis 
              dataKey="timestamp" 
              tick={{ fontSize: 11, fill: '#64748b' }}
              interval={Math.max(0, Math.floor(lineData.history.length / 5) - 1)}
            />
            <YAxis 
              tick={{ fontSize: 11, fill: '#64748b' }}
              label={{ value: `${stat.toUpperCase()} Line`, angle: -90, position: 'insideLeft' }}
            />
            
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e1e1e',
                border: '1px solid #475569',
                borderRadius: '8px'
              }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(value) => value.toFixed(2)}
            />
            
            {/* Reference line at 7-day average */}
            {summary.avg_line && (
              <ReferenceLine 
                y={summary.avg_line} 
                stroke="#64748b" 
                strokeDasharray="5 5"
                label={{ value: `Avg: ${summary.avg_line}`, position: 'right', fill: '#64748b', fontSize: 11 }}
              />
            )}
            
            {/* Line movement as bars */}
            <Bar 
              dataKey="line" 
              fill="#1dd5a6" 
              radius={[4, 4, 0, 0]}
              opacity={0.3}
              name="Line Value"
              isAnimationActive={false}
            />
            
            {/* Current implied probability as line overlay */}
            <Line
              dataKey="impliedProb"
              stroke="#a855f7"
              strokeWidth={2}
              dot={false}
              name="Implied Prob %"
              yAxisId="right"
              isAnimationActive={false}
            />
            
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Recently Updated */}
      <div className="text-[10px] text-sports-muted">
        Last updated: {lineData.history[lineData.history.length - 1]?.timestamp}
      </div>
    </div>
  );
};

export default LineMovementChart;
