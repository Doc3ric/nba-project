import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Activity, Users, Loader2, Info,
  TrendingUp, ShieldCheck, AlertCircle, ChevronUp, ChevronDown
} from 'lucide-react';
import { getAllActiveGames, fetchGameProps } from '../services/api';
import MatchupContext from '../components/player/MatchupContext';
import PlayerIcon from '../components/common/PlayerIcon';
import LiveBoxScore from '../components/game/LiveBoxScore';
import LivePlayByPlay from '../components/game/LivePlayByPlay';

const GameMatchup = () => {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const [game,     setGame]     = useState(null);
  const [props,    setProps]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('All');  // All | PTS | REB | AST | 3PT
  const [activeMainTab, setActiveMainTab] = useState('Matchup'); // Matchup | Box Score | Play-by-Play

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [games, propData] = await Promise.all([
          getAllActiveGames(),
          fetchGameProps(id),
        ]);
        // game IDs can be strings or numbers — coerce both sides
        const found = games.find(g => String(g.id) === String(id));
        setGame(found || null);
        setProps(propData || []);
      } catch (err) {
        console.error('Failed to fetch matchup data:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <Loader2 className="animate-spin text-sports-accent" size={48} />
        <span className="text-sports-muted">Analyzing matchup and props…</span>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="text-center p-12 bg-sports-card rounded-2xl border border-sports-secondary">
        <h2 className="text-2xl font-bold text-white mb-4">Game Not Found</h2>
        <button onClick={() => navigate('/')} className="text-sports-accent hover:underline flex items-center justify-center gap-2 mx-auto">
          <ArrowLeft size={20} /> Back to Dashboard
        </button>
      </div>
    );
  }

  const statFilters = ['All', 'PTS', 'REB', 'AST', '3PT', 'STL', 'BLK'];
  const visibleProps = filter === 'All' ? props : props.filter(p => p.stat === filter);

  const winProb = game.win_probability || { home: 50, visitor: 50 };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Back + badge */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="flex items-center text-sports-muted hover:text-white transition-colors gap-2 font-medium"
        >
          <ArrowLeft size={20} /> Back to Dashboard
        </button>
        <div className="bg-sports-accent/10 text-sports-accent px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border border-sports-accent/20">
          Matchup Analysis
        </div>
      </div>

      {/* Game Header */}
      <div className="bg-gradient-to-r from-sports-card to-sports-dark p-8 rounded-2xl border border-sports-secondary shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-sports-accent opacity-5 rounded-full blur-3xl" />

        <div className="flex flex-col md:flex-row items-center justify-center gap-12 relative z-10">
          {/* Visitor */}
          <div className="text-center space-y-4 flex-1">
            <div className="w-24 h-24 mx-auto flex items-center justify-center p-2 bg-sports-card border border-sports-secondary/50 rounded-2xl shadow-lg ring-1 ring-white/10 group hover:ring-sports-accent/30 transition-all">
              <img
                src={`https://cdn.nba.com/logos/nba/${game.visitor_team.id}/primary/L/logo.svg`}
                className="w-full h-full object-contain group-hover:scale-110 transition-transform"
                alt={game.visitor_team.abbreviation}
                onError={e => { e.target.src = 'https://cdn.nba.com/logos/nba/1610612738/primary/L/logo.svg'; }}
              />
            </div>
            <h2 className="text-2xl font-black text-white">{game.visitor_team.full_name}</h2>
            <div className="text-4xl font-black text-sports-muted/50">{game.visitor_team.score ?? '-'}</div>
          </div>

          {/* Center — win probability bar */}
          <div className="flex flex-col items-center gap-4 flex-1 max-w-md">
            <div className="text-[10px] font-black text-sports-accent uppercase tracking-widest text-glow-accent">Win Probability</div>
            <div className="w-full h-4 bg-sports-dark rounded-full overflow-hidden border border-sports-secondary/50 shadow-inner flex p-0.5">
              <div 
                className="h-full bg-sports-muted/80 rounded-l-full transition-all duration-1000 ease-out"
                style={{ width: `${winProb.visitor}%` }}
              />
              <div 
                className="h-full bg-sports-accent rounded-r-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(29,241,106,0.3)]"
                style={{ width: `${winProb.home}%` }}
              />
            </div>
            <div className="flex justify-between w-full text-sm font-black">
              <span className="text-sports-muted">{winProb.visitor}%</span>
              <span className="text-sports-accent text-glow-accent">{winProb.home}%</span>
            </div>
            
            <div className="text-sm font-bold text-sports-highlight uppercase tracking-tighter mt-1 bg-sports-highlight/10 px-3 py-0.5 rounded-full border border-sports-highlight/20">{game.status}</div>
          </div>

          {/* Home */}
          <div className="text-center space-y-4 flex-1">
            <div className="w-24 h-24 mx-auto flex items-center justify-center p-2 bg-sports-card border border-sports-accent/20 rounded-2xl shadow-[0_0_20px_rgba(29,241,106,0.1)] ring-1 ring-sports-accent/30 group hover:ring-sports-accent/50 transition-all">
              <img
                src={`https://cdn.nba.com/logos/nba/${game.home_team.id}/primary/L/logo.svg`}
                className="w-full h-full object-contain group-hover:scale-110 transition-transform"
                alt={game.home_team.abbreviation}
                onError={e => { e.target.src = 'https://cdn.nba.com/logos/nba/1610612738/primary/L/logo.svg'; }}
              />
            </div>
            <h2 className="text-2xl font-black text-white">{game.home_team.full_name}</h2>
            <div className="text-4xl font-black text-sports-accent text-glow-accent">{game.home_team.score ?? '-'}</div>
          </div>
        </div>

        {/* Moneyline row */}
        <div className="mt-8 pt-8 border-t border-white/5 flex flex-wrap justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <TrendingUp className="text-sports-accent" size={20} />
            <div>
              <p className="text-[10px] text-sports-muted font-black uppercase tracking-widest">Implied Moneyline</p>
              <div className="flex gap-4 mt-1">
                <span className="bg-sports-card px-3 py-1 rounded border border-sports-secondary text-xs font-bold text-white">
                  {game.visitor_team.abbreviation}{' '}
                  {winProb.visitor > 50 ? '-' : '+'}{Math.round(Math.abs(100 / (winProb.visitor / 100) - 100))}
                </span>
                <span className="bg-sports-card px-3 py-1 rounded border border-sports-accent/30 text-xs font-bold text-sports-accent text-glow-accent">
                  {game.home_team.abbreviation}{' '}
                  {winProb.home > 50 ? '-' : '+'}{Math.round(Math.abs(100 / (winProb.home / 100) - 100))}
                </span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-sports-muted font-black uppercase tracking-widest">Model-Derived from Net Ratings</p>
            <p className="text-xs text-sports-muted mt-1 italic">Home Court Advantage +3 pts applied</p>
          </div>
        </div>
      </div>

      {/* ── MAIN TABS ── */}
      <div className="flex items-center gap-1 bg-sports-dark/50 p-1 rounded-xl border border-sports-secondary w-full md:w-max shadow-sm mx-auto">
        {['Matchup', 'Box Score', 'Play-by-Play'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveMainTab(tab)}
            className={`px-4 sm:px-8 py-2.5 rounded-lg text-xs sm:text-sm font-black uppercase tracking-widest transition-all whitespace-nowrap ${
              activeMainTab === tab
                ? 'bg-sports-secondary text-white shadow-[0_0_15px_rgba(255,255,255,0.05)] ring-1 ring-white/10'
                : 'text-sports-muted hover:text-gray-200 hover:bg-sports-secondary/50'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── TAB CONTENT ── */}
      {activeMainTab === 'Matchup' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-300">
          <div className="lg:col-span-2 space-y-6">

          {/* Prop filter tabs */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="text-sports-accent" size={20} />
              <h2 className="text-xl font-bold text-white uppercase tracking-tight">Active Player Props</h2>
            </div>
            <span className="text-xs text-sports-muted font-bold">{visibleProps.length} props</span>
          </div>

          <div className="flex gap-2 flex-wrap">
            {statFilters.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded text-xs font-bold transition-all border ${
                  filter === f
                    ? 'bg-sports-highlight/20 text-sports-highlight border-sports-highlight shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                    : 'bg-transparent border-sports-secondary text-sports-muted hover:border-sports-muted'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4">
            {visibleProps.length > 0 ? visibleProps.map((prop, idx) => {
              const isHigh   = prop.edgeValue >= 10;
              const isMedium = prop.edgeValue >= 5 && prop.edgeValue < 10;
              return (
                <div
                  key={idx}
                  onClick={() => navigate(`/player/${prop.playerId}`)}
                  className="bg-sports-card border border-sports-secondary rounded-xl p-5 hover:border-sports-accent/40 transition-all cursor-pointer group flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
                >
                  <div className="flex items-center gap-4">
                    <PlayerIcon playerId={prop.playerId} name={prop.playerName} className="w-11 h-11" />
                    <div>
                      <h3 className="text-base font-bold text-white group-hover:text-sports-accent transition-colors">
                        {prop.playerName}
                      </h3>
                      <p className="text-sports-accent font-bold text-sm">{prop.prop}</p>
                      {prop.factors && prop.factors.length > 0 && (
                        <p className="text-[10px] text-sports-muted mt-0.5">{prop.factors[0]}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="flex-1 md:flex-none text-center px-4 py-2 bg-sports-dark/50 rounded-lg border border-sports-secondary/50">
                      <p className="text-[10px] text-sports-muted font-bold uppercase tracking-widest opacity-70">Prob</p>
                      <p className="text-xl font-black text-white text-glow-accent">{prop.probability}%</p>
                    </div>
                    <div className={`flex-1 md:flex-none text-center px-4 py-2 rounded-lg border flex flex-col items-center justify-center min-w-[80px] ${
                      isHigh   ? 'bg-sports-accent/10 border-sports-accent/30 shadow-[0_0_15px_rgba(29,241,106,0.1)]' :
                      isMedium ? 'bg-sports-highlight/10    border-sports-highlight/30'        :
                                 'bg-sports-dark/50  border-sports-secondary/50'
                    }`}>
                      <p className={`text-[9px] font-black uppercase tracking-widest mb-0.5 ${isHigh ? 'text-sports-accent text-glow-accent' : isMedium ? 'text-sports-highlight' : 'text-sports-muted'}`}>Edge</p>
                      <p className={`text-xl font-black ${isHigh ? 'text-sports-accent text-glow-accent' : isMedium ? 'text-sports-highlight text-glow-highlight' : 'text-white'}`}>{prop.edge}</p>
                    </div>
                    <div className="hidden md:block px-4 py-2 text-center">
                      <p className="text-[10px] text-sports-muted font-bold uppercase">Conf</p>
                      <p className={`text-sm font-bold uppercase ${
                        prop.confidence === 'High'   ? 'text-sports-accent' :
                        prop.confidence === 'Medium' ? 'text-yellow-400'    : 'text-sports-muted'
                      }`}>{prop.confidence}</p>
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div className="bg-sports-card/30 border border-sports-secondary/30 rounded-xl p-12 text-center">
                <AlertCircle className="mx-auto text-sports-muted mb-4" size={32} />
                <p className="text-sports-muted">
                  No props available for this matchup yet. The backend may still be pre-warming player data.
                </p>
              </div>
            )}
          </div>

          <div className="bg-sports-card/50 border border-sports-secondary/50 rounded-xl p-6 flex items-start gap-4">
            <Info className="text-blue-400 mt-1" size={20} />
            <div>
              <h4 className="font-bold text-white text-sm">How props are calculated</h4>
              <p className="text-xs text-sports-muted leading-relaxed">
                Probabilities use Normal Distribution (PTS) and Poisson Distribution (REB, AST, 3PT, STL, BLK)
                adjusted for opponent defense rank, pace, rest days, and hot/cold streaks.
              </p>
            </div>
          </div>
        </div>

        {/* Defensive Matchup sidebar */}
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Activity className="text-sports-accent" size={20} />
            <h2 className="text-xl font-bold text-white uppercase tracking-tight">Defensive Matchup</h2>
          </div>
          <div>
            <h3 className="text-[10px] font-bold text-sports-muted uppercase tracking-widest mb-3 flex items-center gap-2">
              <ShieldCheck size={14} className="text-sports-accent" />
              {game.visitor_team.abbreviation} Defense
            </h3>
            <MatchupContext nextOpponent={game.visitor_team.abbreviation} />
          </div>
          <div>
            <h3 className="text-[10px] font-bold text-sports-muted uppercase tracking-widest mb-3 flex items-center gap-2">
              <ShieldCheck size={14} className="text-sports-accent" />
              {game.home_team.abbreviation} Defense
            </h3>
            <MatchupContext nextOpponent={game.home_team.abbreviation} />
          </div>
        </div>
      </div>
      )}

      {activeMainTab === 'Box Score' && (
        <LiveBoxScore 
           gameId={game.id} 
           homeTeam={game.home_team} 
           visitorTeam={game.visitor_team} 
           isLive={game.status !== 'Final'} 
        />
      )}

      {activeMainTab === 'Play-by-Play' && (
        <LivePlayByPlay 
           gameId={game.id} 
           homeTeam={game.home_team} 
           visitorTeam={game.visitor_team} 
           isLive={game.status !== 'Final'} 
        />
      )}
    </div>
  );
};

export default GameMatchup;
