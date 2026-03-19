import React, { useEffect, useState, memo } from 'react';
import { Zap, TrendingUp, AlertTriangle, Loader2, Crown, User, RefreshCw, ChevronDown } from 'lucide-react';
import { fetchDashboardSummary, fetchInjuryReport } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import ListModal from './ListModal';
import PlayerIcon from '../common/PlayerIcon';
import { useToast } from '../common/ToastContext';

const DashboardStrip = memo(() => {
  const [data,       setData]       = useState(null);
  const [injuries,   setInjuries]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [injLoading, setInjLoading] = useState(true);
  
  // Modal states
  const [showEdgesModal, setShowEdgesModal] = useState(false);
  const [showLeadersModal, setShowLeadersModal] = useState(false);
  const [showInjMdl, setShowInjMdl] = useState(false);
  
  const navigate = useNavigate();
  const { addToast } = useToast();
  const seenProps = React.useRef(new Set());
  const initialLoad = React.useRef(true);

  useEffect(() => {
    let mounted = true;
    
    const fetchAndCheckEdges = async () => {
      try {
        const d = await fetchDashboardSummary();
        if (!mounted) return;
        setData(d);
        setLoading(false);
        
        if (d && d.top_props) {
          d.top_props.forEach(p => {
            const id = `${p.player_id}-${p.prop}`;
            if (!seenProps.current.has(id)) {
              seenProps.current.add(id);
              if (!initialLoad.current && p.edge >= 10) {
                addToast({
                  title: 'New High EV Edge Found! 🚨',
                  description: `${p.player} ${p.prop} at +${p.edge.toFixed(1)}% EV`,
                  type: 'edge',
                  duration: 8000,
                  actionUrl: `/player/${p.player_id}`
                });
              }
            }
          });
        }
        if (initialLoad.current) initialLoad.current = false;
      } catch {
        if (mounted) setLoading(false);
      }
    };

    fetchAndCheckEdges();
    const interval = setInterval(fetchAndCheckEdges, 60000);

    fetchInjuryReport()
      .then(list => { if (mounted) { setInjuries(list || []); setInjLoading(false); }})
      .catch(() => { if (mounted) setInjLoading(false); });
      
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [addToast]);

  if (loading) return (
    <div className="h-24 rounded-2xl bg-sports-card border border-sports-secondary flex items-center justify-center">
      <Loader2 className="animate-spin text-sports-accent" size={20} />
    </div>
  );

  if (!data) return null;

  const { top_props = [], stat_leaders = {} } = data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
      {/* 1. TOP EDGES TODAY */}
      <div className="bg-[#1a1f26] border border-[#262c36] rounded-xl overflow-hidden flex flex-col pt-4 px-4 shadow-sm relative">
        <div className="flex justify-between items-center mb-3">
          <div className="text-[10px] font-bold text-white uppercase tracking-widest">Top Edges Today</div>
        </div>
        <div className="flex justify-between text-[9px] text-gray-500 font-bold uppercase mb-2 px-1">
          <span>Player</span>
        </div>
        
        {top_props.length === 0 ? (
          <p className="text-xs text-gray-500 py-4">No edges yet.</p>
        ) : (
          <div className="space-y-3 pb-4">
            {top_props.slice(0, 2).map((p, i) => (
              <div 
                key={i} 
                className="flex bg-[#212730] rounded-lg overflow-hidden h-20 shadow-sm border border-[#2d3440] hover:border-[#1a9a5c]/50 transition-colors cursor-pointer"
                onClick={() => {
                  setShowEdgesModal(false);
                  navigate(`/player/${p.player_id}`);
                }}
              >
                {/* Left Info */}
                <div className="flex-1 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <PlayerIcon playerId={p.player_id} name={p.player} className="w-10 h-10 border border-[#262c36]" />
                    <div>
                      <div className="font-bold text-white text-[13px]">{p.player}</div>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-400">
                        <span className="text-[#1a9a5c]">{p.prop.split(' ')[0]}</span>
                        <span className="text-gray-300">{p.prop.split(' ').slice(1).join(' ')}</span>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Right Green Block */}
                <div className="w-24 bg-[#1a9a5c] flex items-center justify-center shrink-0">
                  <span className="text-white font-black text-xl">+{p.edge.toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. L7 DAY LEADERS */}
      <div className="bg-[#1a1f26] border border-[#262c36] rounded-xl p-4 shadow-sm relative">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] font-bold text-white uppercase tracking-widest">L7 Day Leaders</div>
        </div>
        
        <div className="grid grid-cols-12 text-[9px] text-gray-500 font-bold uppercase mb-2 px-2">
          <div className="col-span-3">Stat</div>
          <div className="col-span-6">Player</div>
          <div className="col-span-3 text-right">Avg</div>
        </div>
        
        <div className="space-y-0.5">
          {[['PTS', 'pts'], ['REB', 'reb'], ['AST', 'ast']].map(([label, key]) => {
            const leader = (stat_leaders[key] || [])[0];
            if (!leader) return null;
            return (
              <div 
                key={key} 
                className="grid grid-cols-12 items-center py-2.5 px-2 border-b border-[#262c36]/50 last:border-0 hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                onClick={() => {
                  setShowLeadersModal(false);
                  navigate(`/player/${leader.player_id}`);
                }}
              >
                <div className="col-span-3 text-[10px] font-bold text-gray-400">{label}</div>
                <div className="col-span-6 flex items-center gap-2">
                  <PlayerIcon playerId={leader.player_id} name={leader.name} className="w-6 h-6 rounded-full ring-1 ring-[#262c36]" />
                  <span className="text-xs font-semibold text-gray-200 truncate">{leader.name.split(' ').pop()}</span>
                </div>
                <div className="col-span-3 text-right flex items-center justify-end gap-1 text-[#1a9a5c]">
                  <span className="text-sm font-bold text-white pr-1 text-glow-accent">{leader.avg}</span>
                  <TrendingUp size={10} className="text-[#1a9a5c]" />
                </div>
              </div>
            );
          })}
          {(!stat_leaders.pts || stat_leaders.pts.length === 0) && (
            <p className="text-xs text-gray-500 py-2">No data yet.</p>
          )}
        </div>
      </div>

      {/* 3. INJURY REPORT */}
      <div className="bg-[#1a1f26] border border-[#262c36] rounded-xl flex flex-col p-4 shadow-sm relative">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] font-bold text-white uppercase tracking-widest">Injury Report</div>
        </div>
        
        <div className="grid grid-cols-12 text-[9px] text-gray-500 font-bold uppercase mb-2 px-2">
          <div className="col-span-6">Player</div>
          <div className="col-span-3 text-center">Team</div>
          <div className="col-span-3 text-right">Status</div>
        </div>
        
        <div className="space-y-0.5 mb-12">
          {injLoading ? (
             <div className="flex items-center justify-center py-4"><Loader2 className="animate-spin text-[#1a9a5c]" size={16} /></div>
          ) : injuries.slice(0, 4).map((p, i) => (
            <div key={i} className="grid grid-cols-12 items-center py-2.5 px-2 border-b border-[#262c36]/50 last:border-0 hover:bg-white/5 rounded-lg transition-colors">
              <div className="col-span-6 font-semibold text-xs text-gray-200 truncate pr-2">{p.name}</div>
              <div className="col-span-3 text-center text-[10px] text-gray-400 font-medium">{p.team}</div>
              <div className="col-span-3 flex justify-end">
                <span className={`text-[10px] px-2 py-0.5 rounded border ${p.status === 'Out' ? 'border-red-500/30 text-red-400 bg-red-500/5' : 'border-orange-500/30 text-orange-400 bg-orange-500/5'}`}>
                  {p.status === 'Out' ? 'Out' : p.status === 'Game Time Decision' ? 'GTD' : p.status}
                </span>
              </div>
            </div>
          ))}
          {!injLoading && injuries.length === 0 && (
            <p className="text-xs text-gray-500 py-2">No injuries today.</p>
          )}
        </div>
        
        <button 
          className="absolute bottom-4 left-4 right-4 py-2.5 bg-[#212730] hover:bg-[#2d3440] text-gray-300 text-xs font-semibold rounded-lg transition-colors border border-[#262c36] flex items-center justify-center gap-1" 
          onClick={() => navigate('/injuries')}
        >
          Show All ({injuries.length}) <ChevronDown size={14} />
        </button>
      </div>

      {/* ── Modals (Unchanged logic, just hidden or restyled if needed) ── */}
      <ListModal isOpen={showEdgesModal} onClose={() => setShowEdgesModal(false)} title="Top Edges Today" icon={Zap}>
        {/* Same modal content */}
        <div className="space-y-2">
            {top_props.map((p, i) => (
              <div key={i} className="flex justify-between p-3 rounded-xl bg-sports-dark cursor-pointer group" onClick={() => navigate(`/player/${p.player_id}`)}>
                <div className="text-white">{p.player}</div>
              </div>
             ))}
        </div>
      </ListModal>
      <ListModal isOpen={showLeadersModal} onClose={() => setShowLeadersModal(false)} title="Last 7 Days Leaders" icon={Crown} />
      <ListModal isOpen={showInjMdl} onClose={() => setShowInjMdl(false)} title="Injury Report" icon={AlertTriangle} />
    </div>
  );
});

export default DashboardStrip;
