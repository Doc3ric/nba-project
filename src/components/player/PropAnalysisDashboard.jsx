import React, { useState, memo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { Target, Info, ChevronDown, ChevronUp, Check, Zap, Plus, Search, TrendingUp, Shield, Activity, BarChart3 } from 'lucide-react';
import { usePropAnalysis } from '../../hooks/useAnalytics';
import PlayerIcon from '../common/PlayerIcon';
import LineMovementChart from './LineMovementChart';

/**
 * Highly customized advanced prop analytics dashboard replicating Outlier.bet aesthetics.
 */
const PropAnalysisDashboard = memo(({ stats, playerName, teamAbbr, nextOpponent = { id: 0, abbreviation: 'UNK' } }) => {
  // Stat categories matching the screenshot (extended logic handled centrally where possible)
  const categories = [
    { id: 'pts',      label: 'PTS' },
    { id: 'reb',      label: 'REB' },
    { id: 'ast',      label: 'AST' },
    { id: 'dreb',     label: 'DREB', info: true },
    { id: 'stl',      label: 'STL' },
    { id: 'blk',      label: 'BLK' },
    { id: 'oreb',     label: 'OREB' },
    { id: 'fg3m',     label: '3PM' },
    { id: 'fg3a',     label: '3PA', info: true },
    { id: 'fgm',      label: 'FGM' },
    { id: 'fga',      label: 'FGA', info: true },
    { id: 'pts_reb',  label: 'PTS+REB' },
    { id: 'pts_ast',  label: 'PTS+AST' },
    { id: 'reb_ast',  label: 'REB+AST' },
    { id: 'pra',      label: 'PTS+REB+AST' },
    { id: 'blk_stl',  label: 'BLK+STL' },
    { id: 'fta',      label: 'FTA', info: true },
    { id: 'ftm',      label: 'FTM', info: true },
  ];

  const [selectedCategory, setSelectedCategory] = useState({ id: 'pts', label: 'PTS' });
  const [line, setLine] = useState(27.5); // Default hook logic will snap to this if dynamic
  const [activeSide, setActiveSide] = useState('Under'); // 'Over' or 'Under'
  const [activeTab, setActiveTab] = useState('analysis'); // 'analysis' | 'odds-tracking' | 'metrics'
  
  // Dummy active filters modeling the screenshot design
  const [gameHistory, setGameHistory] = useState('Last 10 Games');
  const [splitHome, setSplitHome] = useState(false);
  const [splitAway, setSplitAway] = useState(false);
  const [splitW, setSplitW] = useState(false);
  const [splitL, setSplitL] = useState(false);
  const [splitReg, setSplitReg] = useState(true);
  const [splitPlay, setSplitPlay] = useState(false);
  const [seasonOption, setSeasonOption] = useState('25/26');

  // We map the requested filters into the hook structure `homeAway`/`winLoss` if supported
  const hookFilters = {
    homeAway: splitHome ? 'Home' : splitAway ? 'Away' : 'All',
    winLoss: splitW ? 'W' : splitL ? 'L' : 'All',
    season: seasonOption === '25/26' ? '2025' : '2024'
  };

  const { hitRates, chartData } = usePropAnalysis(stats, selectedCategory.id, line, hookFilters, nextOpponent.abbreviation);

  // Derive Median & Average for displaying below Last 10
  const l10Data = chartData.slice(-10);
  const mean = l10Data.length ? (l10Data.reduce((acc, curr) => acc + curr.value, 0) / l10Data.length).toFixed(1) : 0;
  const sortedVals = [...l10Data.map(d => d.value)].sort((a,b) => a-b);
  const median = sortedVals.length ? (sortedVals.length % 2 === 0 
    ? ((sortedVals[sortedVals.length/2 - 1] + sortedVals[sortedVals.length/2]) / 2).toFixed(1)
    : sortedVals[Math.floor(sortedVals.length/2)].toFixed(1)) : 0;

  // Custom tooltips
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#1e1e1e] border border-gray-700 p-3 rounded-lg shadow-2xl relative z-50">
          <p className="text-gray-400 text-[10px] font-bold mb-1 uppercase tracking-widest">{data.fullDate}</p>
          <div className="flex justify-between items-center gap-4">
            <span className="text-gray-100 font-bold">vs {data.opponent}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-black ${data.isHit ? 'bg-sports-accent/20 text-sports-accent' : 'bg-red-500/20 text-red-500'}`}>
              {data.isHit ? 'OVER' : 'UNDER'}
            </span>
          </div>
          <div className="text-2xl font-black text-gray-100 mt-1">
            {data.value} <span className="text-sm font-normal text-gray-400 uppercase">{selectedCategory.id.replace('_', '+')}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  const AxisTick = ({ x, y, payload }) => {
    // We pass formatted Opponent\nDate string to standard Recharts category axis, need to split it
    const parts = payload.value.split('|');
    const opp = parts[0] || '';
    const dateStr = parts[1] || '';
    return (
      <g transform={`translate(${x},${y})`}>
        <circle cx={0} cy={16} r={12} fill="#1e1e1e" stroke="#2d3446" />
        <text x={0} y={16} dy={3} textAnchor="middle" fill="#e2e8f0" fontSize={8} fontWeight="bold">{opp}</text>
        <text x={0} y={40} textAnchor="middle" fill="#8b96a5" fontSize={9}>{dateStr.replace(' ', '\n')}</text>
      </g>
    );
  };

  // Build the chart array. We use opponent|date string for the XAxis tick mapping
  const renderChartData = chartData.map(d => ({
    ...d,
    xTickLabel: `${d.opponent}|${d.date}`,
  }));

  // Replicate standard Outlier dark bg #0F0F0F
  return (
    <div className="bg-[#0c0c0c] rounded-lg border border-gray-800 shadow-2xl overflow-hidden font-sans pb-8 mt-6">
      
      {/* ── HEADER ROW ── */}
      <div className="p-4 bg-gradient-to-r from-[#120a1c] to-[#0c0c0c] border-b border-gray-800 relative">
        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
          
          <div className="flex items-start gap-4">
            {/* Player Headshot */}
            <PlayerIcon playerId={stats.length > 0 ? stats[0].player_id : null} name={playerName} className="w-14 h-14 md:w-16 md:h-16 shadow-lg bg-[#1a1a1a]" />
            
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold bg-[#1a2f26] text-[#1df16a] border border-[#1df16a]/30 px-1.5 py-0.5 rounded uppercase tracking-wider">
                  {teamAbbr} @ {nextOpponent.abbreviation}
                </span>
                <span className="text-[10px] text-gray-400">Sun 7:00 PM</span>
              </div>
              <h1 className="text-2xl font-black text-white leading-none flex items-center gap-2">
                {playerName}
                <span className="text-[10px] font-bold bg-[#1e1e1e] text-gray-300 border border-gray-700 px-1.5 py-0.5 rounded">
                  {teamAbbr} <span className="text-gray-500">|</span> SG
                </span>
              </h1>
              <span className="text-lg font-bold text-gray-300 mt-1">
                {selectedCategory.label} - Over {line}
              </span>
            </div>
          </div>

        </div>

        {/* ── BUTTON ROW ── */}
        <div className="flex flex-wrap items-center gap-3 mt-5">
          {/* Over Button (Inactive State mockup) */}
          <button 
            onClick={() => setActiveSide('Over')}
            className={`flex items-stretch overflow-hidden rounded-lg font-bold text-sm transition-all shadow-md ${
              activeSide === 'Over' 
                ? 'ring-2 ring-sports-highlight bg-gradient-to-r from-sports-highlight/30 to-sports-highlight/10 shadow-[0_0_15px_rgba(168,85,247,0.2)]' 
                : 'bg-[#1a1a1a] hover:bg-[#222]'
            }`}
          >
            <div className="px-2.5 flex items-center justify-center border-r border-gray-700 bg-[#222]">
              {activeSide === 'Over' ? <Check size={14} className="text-purple-400" /> : <div className="w-4 h-1 bg-gray-600 rounded"></div>}
            </div>
            <div className="px-4 py-2 flex items-center gap-2">
              <span className="text-white">Over {line}</span>
              <span className="text-[#1df16a]">-105</span>
            </div>
          </button>

          {/* Under Button (Active State mockup based on screenshot) */}
          <button 
            onClick={() => setActiveSide('Under')}
            className={`flex items-stretch overflow-hidden rounded-lg font-bold text-sm transition-all shadow-md ${
              activeSide === 'Under' 
                ? 'ring-2 ring-sports-highlight bg-gradient-to-r from-sports-highlight/30 to-sports-highlight/10 shadow-[0_0_15px_rgba(168,85,247,0.2)]' 
                : 'bg-[#1a1a1a] hover:bg-[#222]'
            }`}
          >
            <div className={`px-2.5 flex items-center justify-center border-r ${activeSide === 'Under' ? 'border-purple-600 bg-purple-800/80 text-white' : 'border-gray-700 bg-[#222] text-gray-600'}`}>
               {activeSide === 'Under' ? '✖' : <div className="w-4 h-1 bg-gray-600 rounded"></div>}
            </div>
            <div className={`px-4 py-2 flex items-center gap-2`}>
              <span className="text-white">Under {line}</span>
              <span className="text-red-400">-117</span>
            </div>
          </button>

          {/* Alt Lines Dropdown */}
          <button className="flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#222] text-gray-300 px-4 py-2 rounded-lg font-bold text-sm border border-gray-800 shadow-md">
            Alt Lines <ChevronDown size={14} />
          </button>

          {/* Right Action Icons */}
          <div className="ml-auto flex items-center gap-3">
             <button className="w-8 h-8 rounded-full bg-[#1a1a1a] border border-gray-700 hover:bg-[#222] flex items-center justify-center text-gray-400">
               <Plus size={16} />
             </button>
             <button className="w-8 h-8 rounded-lg bg-[#14b8a6]/20 border border-[#14b8a6]/40 flex items-center justify-center text-[#14b8a6]">
               <Zap size={14} fill="currentColor" />
             </button>
             <div className="hidden sm:flex items-center bg-[#1a1a1a] text-xs font-bold rounded-lg border border-gray-800 overflow-hidden">
                <div className="px-3 py-1.5 border-r border-gray-800 text-gray-300">L 19.5</div>
                <div className="px-3 py-1.5 border-r border-gray-800 bg-[#1e293b]/50 text-[#1df16a]">O -137</div>
                <div className="px-3 py-1.5 text-red-400">U +335</div>
                <button className="px-2 py-1.5 border-l border-gray-800 hover:bg-[#222]"><ChevronDown size={12} className="text-gray-400"/></button>
             </div>
          </div>
        </div>
      </div>

      {/* ── STAT TABS ROW ── */}
      <div className="flex items-center overflow-x-auto no-scrollbar border-b border-gray-800 bg-[#121212] px-2 py-2">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat)}
            className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase transition-all rounded ${
              selectedCategory.id === cat.id 
                ? 'bg-sports-highlight/20 text-sports-highlight shadow-[0_0_10px_rgba(168,85,247,0.2)]' 
                : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1a]'
            }`}
          >
            {cat.label}
            {cat.info && <Info size={10} className="text-yellow-600" />}
          </button>
        ))}
      </div>

      {/* ── ANALYSIS TABS (Phase 3) ── */}
      <div className="flex items-center border-b border-gray-800 bg-[#121212] px-2 py-0">
        <button
          onClick={() => setActiveTab('analysis')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold uppercase transition-all border-b-2 ${
            activeTab === 'analysis'
              ? 'text-sports-accent border-sports-accent'
              : 'text-gray-500 border-transparent hover:text-gray-300'
          }`}
        >
          <BarChart size={14} /> Hit Rates
        </button>
        <button
          onClick={() => setActiveTab('odds-tracking')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold uppercase transition-all border-b-2 ${
            activeTab === 'odds-tracking'
              ? 'text-sports-accent border-sports-accent'
              : 'text-gray-500 border-transparent hover:text-gray-300'
          }`}
        >
          <TrendingUp size={14} /> Odds Tracking
        </button>
        <button
          onClick={() => setActiveTab('metrics')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold uppercase transition-all border-b-2 ${
            activeTab === 'metrics'
              ? 'text-sports-accent border-sports-accent'
              : 'text-gray-500 border-transparent hover:text-gray-300'
          }`}
        >
          <Activity size={14} /> Metrics
        </button>
      </div>

      {/* ── MAIN ANALYTICS VIEW ── */}
      {activeTab === 'analysis' && (
      <div className="p-4 md:p-6">
        
        {/* Title */}
        <h2 className="text-xl font-bold text-white tracking-tight mb-4">
          {playerName} {selectedCategory.label} Last 10
        </h2>

        {/* Filters Top Row */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
           <div className="flex flex-wrap gap-4">
              {/* Game History */}
              <div>
                 <p className="text-[10px] text-gray-500 flex items-center gap-1 mb-1.5">Game History <Info size={10}/></p>
                 <button className="bg-[#1a1a1a] hover:bg-[#222] border border-gray-700 rounded px-3 py-1 text-xs text-gray-300 font-bold flex items-center gap-2">
                    {gameHistory} <ChevronDown size={12}/>
                 </button>
              </div>

              {/* Splits */}
              <div>
                 <p className="text-[10px] text-gray-500 flex items-center gap-1 mb-1.5">Splits <Info size={10}/></p>
                 <div className="flex gap-1.5">
                    <button onClick={()=>setSplitHome(!splitHome)} className={`px-3 py-1 rounded text-xs font-bold border ${splitHome ? 'bg-gray-200 text-black border-gray-200' : 'bg-[#1a1a1a] text-gray-400 border-gray-700 hover:bg-[#222]'}`}>Home</button>
                    <button onClick={()=>setSplitAway(!splitAway)} className={`px-3 py-1 rounded text-xs font-bold border ${splitAway ? 'bg-gray-200 text-black border-gray-200' : 'bg-[#1a1a1a] text-gray-400 border-gray-700 hover:bg-[#222]'}`}>Away</button>
                    <button onClick={()=>setSplitW(!splitW)} className={`px-3 py-1 rounded text-xs font-bold border ${splitW ? 'bg-gray-200 text-black border-gray-200' : 'bg-[#1a1a1a] text-gray-400 border-gray-700 hover:bg-[#222]'}`}>W</button>
                    <button onClick={()=>setSplitL(!splitL)} className={`px-3 py-1 rounded text-xs font-bold border ${splitL ? 'bg-gray-200 text-black border-gray-200' : 'bg-[#1a1a1a] text-gray-400 border-gray-700 hover:bg-[#222]'}`}>L</button>
                    <button onClick={()=>setSplitReg(!splitReg)} className={`px-3 py-1 rounded text-xs font-bold border ${splitReg ? 'bg-gray-800 text-gray-200 border-gray-600' : 'bg-[#1a1a1a] text-gray-400 border-gray-700'}`}>Regular</button>
                    <button onClick={()=>setSplitPlay(!splitPlay)} className={`px-3 py-1 rounded text-xs font-bold border ${splitPlay ? 'bg-gray-800 text-gray-200 border-gray-600' : 'bg-[#1a1a1a] text-gray-400 border-gray-700'}`}>Playoffs</button>
                 </div>
              </div>
           </div>

           <div className="flex flex-wrap gap-4">
              {/* Season */}
              <div>
                 <p className="text-[10px] text-gray-500 flex items-center gap-1 mb-1.5">Season <Info size={10}/></p>
                 <div className="flex gap-1.5">
                    <button onClick={()=>setSeasonOption('25/26')} className={`px-3 py-1 rounded text-xs font-bold border ${seasonOption==='25/26' ? 'bg-[#1a1a1a] text-gray-300 border-gray-600' : 'bg-transparent text-gray-500 border-transparent hover:text-gray-400'}`}>25/26</button>
                    <button onClick={()=>setSeasonOption('24/25')} className={`px-3 py-1 rounded text-xs font-bold border ${seasonOption==='24/25' ? 'bg-[#1a1a1a] text-gray-300 border-gray-600' : 'bg-transparent text-gray-500 border-transparent hover:text-gray-400'}`}>24/25</button>
                 </div>
              </div>
              
              {/* Filter Selects */}
              <div className="hidden md:flex gap-4">
                 <div>
                    <p className="text-[10px] text-gray-500 flex items-center gap-1 mb-1.5">Advanced Filters <Info size={10}/></p>
                    <button className="bg-transparent border border-gray-700 rounded-full px-4 py-1.5 text-xs text-gray-400 flex items-center gap-2 hover:bg-[#1a1a1a]">Advanced Filters <ChevronDown size={12}/></button>
                 </div>
                 <div>
                    <p className="text-[10px] text-gray-500 flex items-center gap-1 mb-1.5">Filter by Players <Info size={10}/></p>
                    <button className="bg-transparent border border-gray-700 rounded-full px-4 py-1.5 text-xs text-gray-400 flex items-center gap-2 hover:bg-[#1a1a1a]">Filter By Players</button>
                 </div>
              </div>
           </div>
        </div>

        {/* Total Games Tab */}
        <div className="inline-block border border-gray-700 rounded px-2.5 py-1 text-xs text-gray-400 font-bold bg-[#151515] mb-6">
           Total Games: {stats.length}
        </div>

        {/* Summary Grids Row */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-8 border-b border-gray-800 pb-5">
           
           {/* Left Info: L10 % */}
           <div>
              <p className="text-gray-400 text-[11px] mb-1">Last 10</p>
              <div className="flex items-baseline gap-2">
                 <span className={`text-4xl font-black ${hitRates.l10.percentage >= 50 ? 'text-sports-accent text-glow-accent' : 'text-sports-red text-glow-red'}`}>
                    {hitRates.l10.percentage}%
                 </span>
                 <span className="text-gray-400 text-sm font-bold">{hitRates.l10.hits} of {hitRates.l10.total}</span>
              </div>
              <p className="text-gray-400 text-[11px] mt-4 flex gap-3">
                 <span>Average: <strong className="text-white ml-1">{mean}</strong></span>
                 <span>Median: <strong className="text-white ml-1">{median}</strong></span>
              </p>
           </div>

           {/* Right Grid Matrix */}
           <div className="grid grid-cols-4 gap-x-8 gap-y-3 text-[11px]">
              <div className="flex justify-between w-24"><span className="text-gray-500">L5</span>   <span className={hitRates.l5.percentage >= 50 ? 'text-[#1df16a] font-bold' : 'text-[#ef4444] font-bold'}>{hitRates.l5.percentage}%</span></div>
              <div className="flex justify-between w-24"><span className="text-gray-500">L20</span>  <span className={hitRates.l20.percentage >= 50 ? 'text-[#1df16a] font-bold' : 'text-[#ef4444] font-bold'}>{hitRates.l20.percentage}%</span></div>
              <div className="flex justify-between w-24"><span className="text-gray-500">H2H</span>  <span className={hitRates.h2h.percentage >= 50 ? 'text-[#1df16a] font-bold' : 'text-[#ef4444] font-bold'}>{hitRates.h2h.percentage}%</span></div>
              <div className="flex justify-between w-24"><span className="text-gray-500">2024</span> <span className={hitRates.season.percentage >= 50 ? 'text-[#1df16a] font-bold' : 'text-[#ef4444] font-bold'}>{hitRates.season.percentage}%</span></div>
           </div>
        </div>

        {/* ── BAR CHART ── */}
        <div className="h-72 w-full mt-10 relative">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={renderChartData} margin={{ top: 20, right: 10, left: -20, bottom: 40 }} barGap={5} barCategoryGap="20%">
              {/* Very faint dark horizontal lines */}
              <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
              
              {/* Y Axis matches Outlier style (far left simple numbers) */}
              <YAxis 
                stroke="#4a5568" 
                fontSize={10} 
                tickLine={false}
                axisLine={false}
                dx={-10}
                tick={{fill: '#6b7280'}}
              />
              
              <XAxis 
                dataKey="xTickLabel" 
                tick={<AxisTick />} 
                axisLine={false} 
                tickLine={false}
              />
              
              <Tooltip cursor={{fill: 'rgba(255,255,255,0.02)'}} content={<CustomTooltip />} />
              
              {/* Target Line - Red, dashed, behind bars */}
              <ReferenceLine 
                y={line} 
                stroke="#ef4444" 
                strokeDasharray="4 4"
                label={{ 
                  position: 'left', 
                  value: line, 
                  fill: '#ef4444', 
                  fontSize: 10, 
                  fontWeight: 'bold',
                  dx: -5,
                  dy: 3
                }} 
              />
              
              <Bar 
                dataKey="value" 
                radius={[2, 2, 0, 0]}
                label={{ position: 'top', fill: '#1df16a', fontSize: 13, fontWeight: 'bold', formatter: (val, entry) => {
                  return <text fill={val >= line ? '#1df16a' : '#ef4444'} fontSize={13} fontWeight="bold">{val}</text>
                }}}
              >
                {renderChartData.map((entry, index) => {
                  const isHit = entry.value >= line;
                  // If "Over" is active, green for hit, red for miss. If "Under" is active, green for miss, red for hit.
                  const isGreen = activeSide === 'Over' ? isHit : !isHit;
                  const colorMatch = isGreen ? '#1df16a' : '#ef4444'; 
                  return (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={colorMatch}
                      fillOpacity={isGreen ? 0.9 : 0.8}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Predictor Ghost Box Container (absolute right) */}
          <div className="absolute top-0 right-0 h-[80%] bottom-[40px] w-[50px] sm:w-[80px] border border-dashed border-gray-600 rounded-t flex flex-col items-center justify-end bg-[#1a1a1a]/20">
             <span className="text-gray-400 font-bold mb-4">?</span>
          </div>
          <div className="absolute right-0 bottom-1 w-[50px] sm:w-[80px] flex justify-center">
             <div className="flex flex-col items-center">
               <div className="w-5 h-5 rounded-full bg-sports-dark border border-[#1df16a]/50 flex items-center justify-center text-[8px] font-bold text-[#1df16a] mb-0.5">{nextOpponent.abbreviation || 'UNK'}</div>
               <span className="text-[8px] text-gray-400 uppercase">Today</span>
             </div>
          </div>
        </div>

        {/* Floating Line Scrubber Mockup */}
        <div className="flex justify-center mt-6">
           <div className="flex items-center gap-4 bg-[#151515] border border-gray-800 rounded-full px-6 py-2 shadow-xl">
             <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">Alt Lines:</span>
             <input type="range" min="0" max="100" className="w-48 appearance-none bg-gray-700 h-1 rounded-full outline-none" />
             <div className="flex gap-1 ml-4 border-l border-gray-800 pl-4">
               <button className="text-gray-400 hover:text-white"><ChevronUp size={16}/></button>
               <button className="text-gray-400 hover:text-white"><ChevronDown size={16}/></button>
             </div>
             <button className="ml-2 flex items-center gap-2 bg-[#222] border border-gray-700 hover:bg-[#333] px-3 py-1 rounded text-xs text-gray-300 font-bold">
               <Search size={12}/> Summary
             </button>
           </div>
        </div>

      </div>
      )}

      {/* ── ODDS TRACKING TAB (Phase 3) ── */}
      {activeTab === 'odds-tracking' && (
      <div className="p-4 md:p-6">
        <h2 className="text-xl font-bold text-white tracking-tight mb-4">
          {playerName} {selectedCategory.label} - Line Movement Analysis
        </h2>
        <LineMovementChart 
          playerId={null}  // This would be passed from parent context
          stat={selectedCategory.id}
          days={7}
        />
      </div>
      )}

      {/* ── METRICS TAB (Phase 3) ── */}
      {activeTab === 'metrics' && (
      <div className="p-4 md:p-6">
        <h2 className="text-xl font-bold text-white tracking-tight mb-6">
          {playerName} - Betting Intelligence Metrics
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Consistency Score */}
          <div className="bg-gradient-to-br from-sports-card/40 to-transparent border border-sports-secondary/30 border-l-4 border-l-blue-500 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Consistency</span>
              <Activity size={16} className="text-blue-400" />
            </div>
            <div className="text-3xl font-black text-white mb-2">75.2</div>
            <p className="text-xs text-blue-300">🔥 Highly Consistent</p>
            <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500" style={{width: '75%'}} />
            </div>
          </div>

          {/* Confidence Score */}
          <div className="bg-gradient-to-br from-sports-card/40 to-transparent border border-sports-secondary/30 border-l-4 border-l-sports-accent rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Confidence</span>
              <Shield size={16} className="text-sports-accent" />
            </div>
            <div className="text-3xl font-black text-white mb-2">68.4</div>
            <p className="text-xs text-sports-accent">Medium - Data Driven</p>
            <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-sports-accent" style={{width: '68%'}} />
            </div>
          </div>

          {/* EV Score */}
          <div className="bg-gradient-to-br from-sports-card/40 to-transparent border border-sports-secondary/30 border-l-4 border-l-green-500 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Expected Value</span>
              <Zap size={16} className="text-green-400" />
            </div>
            <div className="text-3xl font-black text-green-400 mb-2">+4.2%</div>
            <p className="text-xs text-green-300">Positive Edge Detected</p>
          </div>

          {/* Kelly Fraction */}
          <div className="bg-gradient-to-br from-sports-card/40 to-transparent border border-sports-secondary/30 border-l-4 border-l-yellow-500 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Kelly (1/4)</span>
              <TrendingUp size={16} className="text-yellow-400" />
            </div>
            <div className="text-3xl font-black text-yellow-400 mb-2">0.85%</div>
            <p className="text-xs text-yellow-300">Recommended: 0.85u per $100</p>
          </div>
        </div>

        {/* Confidence Factors Breakdown */}
        <div className="bg-sports-card/30 border border-sports-secondary/30 rounded-lg p-6">
          <h3 className="text-sm font-bold text-white mb-4">Confidence Factor Breakdown</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-gray-400">L5 Hit Rate</span>
                <span className="font-bold text-white">60%</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-sports-accent" style={{width: '60%'}} />
              </div>
              <span className="text-[10px] text-gray-500 mt-1">Weight: 30%</span>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-gray-400">L10 Hit Rate</span>
                <span className="font-bold text-white">70%</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-sports-accent" style={{width: '70%'}} />
              </div>
              <span className="text-[10px] text-gray-500 mt-1">Weight: 25%</span>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-gray-400">Consistency Score</span>
                <span className="font-bold text-white">75.2</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500" style={{width: '75%'}} />
              </div>
              <span className="text-[10px] text-gray-500 mt-1">Weight: 20%</span>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-gray-400">Matchup Rating</span>
                <span className="font-bold text-white">62%</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500" style={{width: '62%'}} />
              </div>
              <span className="text-[10px] text-gray-500 mt-1">Weight: 15%</span>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-gray-400">MC Certainty</span>
                <span className="font-bold text-white">80%</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500" style={{width: '80%'}} />
              </div>
              <span className="text-[10px] text-gray-500 mt-1">Weight: 10%</span>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
});

export default PropAnalysisDashboard;
