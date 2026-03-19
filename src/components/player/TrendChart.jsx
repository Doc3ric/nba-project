import React, { memo } from 'react';
import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useAnalytics } from '../../hooks/useAnalytics';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const TrendChart = memo(({ stats, category = 'pts', title = "Performance Trend" }) => {
  const { chartData: data, averages, advanced } = useAnalytics(stats, category);
  
  const l10Avg = parseFloat(averages.l10);
  const trendSlope = parseFloat(advanced.trendSlope);

  if (data.length === 0) {
    return <div className="h-64 flex items-center justify-center text-sports-muted bg-sports-dark rounded-xl">No chart data</div>;
  }

  // Slope indicator logic (based on linear regression slope over L5)
  const isTrendingUp = trendSlope > 0.5;
  const isTrendingDown = trendSlope < -0.5;

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-sports-card border border-sports-secondary p-4 rounded-lg shadow-xl">
          <p className="text-sports-muted text-xs mb-1">{label} vs {payload[0].payload.opponent}</p>
          <p className="text-xl font-bold text-white">
            {payload[0].value} <span className="text-sm text-sports-muted uppercase font-normal">{category}</span>
          </p>
          {payload[0].payload.rollingAvg && (
            <p className="text-xs text-sports-muted font-bold mt-1 tracking-wider border-t border-sports-secondary pt-1">
              3-GM AVG: <span className="text-white">{payload[0].payload.rollingAvg}</span>
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-sports-card border border-sports-secondary rounded-xl p-6 shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-white flex items-center">
          <div className="w-2 h-6 bg-sports-accent rounded-sm mr-3"></div>
          {title} (L10)
        </h3>
        
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-sports-dark border border-sports-secondary text-sm">
           <span className="text-sports-muted">Trend:</span>
           {isTrendingUp ? (
              <span className="text-sports-accent flex items-center gap-1 font-bold"><TrendingUp size={16}/> Hot</span>
           ) : isTrendingDown ? (
              <span className="text-sports-red flex items-center gap-1 font-bold"><TrendingDown size={16}/> Cold</span>
           ) : (
              <span className="text-sports-muted flex items-center gap-1 font-bold"><Minus size={16}/> Flat</span>
           )}
        </div>
      </div>
      
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1df16a" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#1df16a" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3446" vertical={false} />
            <XAxis 
              dataKey="date" 
              stroke="#8b96a5" 
              fontSize={12} 
              tickLine={false}
              axisLine={false}
              dy={10}
            />
            <YAxis 
              stroke="#8b96a5" 
              fontSize={12} 
              tickLine={false}
              axisLine={false}
              dx={-10}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#2d3446', strokeWidth: 1, strokeDasharray: '3 3' }} />
            
            <ReferenceLine 
              y={l10Avg} 
              stroke="#8b96a5" 
              strokeDasharray="3 3" 
              label={{ position: 'insideTopLeft', value: 'L10 AVG', fill: '#8b96a5', fontSize: 10 }} 
            />
            
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="#1df16a" 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#colorValue)" 
              activeDot={{ r: 6, fill: "#1df16a", stroke: "#1a1e26", strokeWidth: 3 }}
            />
            {/* Rolling Average Overlay */}
            <Line 
              type="monotone" 
              dataKey="rollingAvg" 
              stroke="#FACC15" 
              strokeWidth={2} 
              strokeDasharray="4 4" 
              dot={false}
              activeDot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

export default TrendChart;
