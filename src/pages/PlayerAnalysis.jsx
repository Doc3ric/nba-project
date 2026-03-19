import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Flame, Snowflake, Minus, Shield } from 'lucide-react';
import PlayerSearch from '../components/player/PlayerSearch';
import PlayerIcon from '../components/common/PlayerIcon';
import StatsTable from '../components/player/StatsTable';
import TrendChart from '../components/player/TrendChart';
import BettingEdgeCard from '../components/player/BettingEdgeCard';
import MatchupContext from '../components/player/MatchupContext';
import H2HCard from '../components/player/H2HCard';
import PropAnalysisDashboard from '../components/player/PropAnalysisDashboard';
import ShotChart from '../components/player/ShotChart';
import { usePlayerStats } from '../hooks/usePlayerStats';
import { calculatePlayerHeat } from '../utils/analytics';
import { fetchPlayerShots, getAllActiveGames } from '../services/api';

const PlayerAnalysis = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { stats, playerDetails, loading, error } = usePlayerStats(id);
  const [category,     setCategory]     = useState({ id: 'pts', label: 'Points' });
  const [shotData,     setShotData]     = useState(null);
  const [nextOpponent, setNextOpponent] = useState(null); // real opponent abbreviation

  // Fetch shot data when player changes
  useEffect(() => {
    if (id) fetchPlayerShots(id).then(setShotData);
  }, [id]);

  // Find today's opponent for this player
  useEffect(() => {
    if (!playerDetails?.team?.abbreviation) return;
    const teamAbbr = playerDetails.team.abbreviation;

    getAllActiveGames().then(games => {
      if (!games || !games.length) return;
      const todayGame = games.find(g =>
        g.home_team?.abbreviation    === teamAbbr ||
        g.visitor_team?.abbreviation === teamAbbr
      );
      if (todayGame) {
        const opp = todayGame.home_team?.abbreviation === teamAbbr
          ? todayGame.visitor_team?.abbreviation
          : todayGame.home_team?.abbreviation;
        setNextOpponent(opp || null);
      }
    }).catch(() => {});
  }, [playerDetails]);

  const handleCategoryChange = useCallback((cat) => setCategory(cat), []);

  // Fallback landing page when no player selected
  if (!id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-8 animate-in fade-in zoom-in duration-500 p-4">
        <div className="bg-[#0b0e14] border border-sports-secondary/30 p-12 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] text-center max-w-2xl w-full relative overflow-hidden group">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-sports-accent/10 rounded-full blur-[80px] group-hover:bg-sports-accent/20 transition-all duration-700" />
          <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-sports-highlight/10 rounded-full blur-[80px] group-hover:bg-sports-highlight/20 transition-all duration-700" />
          
          <div className="bg-sports-card w-20 h-20 mx-auto mb-8 rounded-2xl border border-sports-secondary/50 flex items-center justify-center shadow-lg transform group-hover:rotate-12 transition-transform duration-500">
            <User className="text-sports-accent text-glow-accent" size={40} />
          </div>
          
          <h2 className="text-4xl font-black text-white mb-6 uppercase tracking-tight text-glow-accent">
            AI Player Scout
          </h2>
          <p className="text-sports-muted mb-10 text-lg leading-relaxed">
            Harness the power of <span className="text-sports-accent font-bold">Scikit-Learn ML</span> to analyze player trends, matchup difficulty, and predictive edges.
          </p>
          
          <div className="flex justify-center flex-col items-center relative z-10 w-full">
            <div className="w-full max-w-md p-1 bg-white/5 rounded-2xl border border-white/10 shadow-inner">
               <PlayerSearch />
            </div>
            <p className="mt-4 text-[10px] text-sports-muted font-bold uppercase tracking-[0.2em] opacity-50">
              Enter Player Name to Begin Analysis
            </p>
          </div>
        </div>
      </div>
    );
  }

  const heat = stats.length > 0 ? calculatePlayerHeat(stats, category.id) : 'Neutral';

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <button
          onClick={() => navigate('/')}
          className="flex items-center text-sports-muted hover:text-white transition-colors gap-2 font-medium"
        >
          <ArrowLeft size={20} /> Back to Dashboard
        </button>
        <div className="w-full sm:w-auto z-40">
          <PlayerSearch />
        </div>
      </div>

      {error && (
        <div className="bg-sports-red/10 border border-sports-red text-sports-red p-4 rounded-xl text-center shadow-lg">
          <h3 className="font-bold">Error Loading Data</h3>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-6 animate-pulse mt-8">
          <div className="h-10 bg-sports-card rounded w-1/3" />
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-1 h-72 bg-sports-card rounded-xl" />
            <div className="xl:col-span-2 h-72 bg-sports-card rounded-xl" />
          </div>
          <div className="h-96 bg-sports-card rounded-xl mt-8" />
        </div>
      ) : (
        <div className="space-y-6 mt-4">

          {/* Player Header */}
          {playerDetails && (
            <div className="flex items-center gap-6 bg-sports-card/30 p-4 rounded-2xl border border-sports-secondary/20 backdrop-blur-sm">
              <PlayerIcon 
                playerId={id} 
                name={playerDetails.full_name} 
                className="w-20 h-20 border-2 border-sports-accent/30 shadow-[0_0_20px_rgba(29,241,106,0.2)]" 
              />
              <div>
                <h1 className="text-3xl font-black text-white tracking-tight leading-none mb-1">
                  {playerDetails.first_name} {playerDetails.last_name}
                  {playerDetails.jersey_number && (
                    <span className="ml-3 text-lg text-sports-muted font-bold">
                      #{playerDetails.jersey_number}
                    </span>
                  )}
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sports-muted font-bold text-sm tracking-widest uppercase">
                    {playerDetails.team?.full_name || playerDetails.team?.abbreviation}
                  </span>
                  {playerDetails.position && (
                    <span className="text-xs bg-sports-secondary/50 text-sports-muted px-2 py-0.5 rounded font-bold uppercase">
                      {playerDetails.position}
                    </span>
                  )}
                  {playerDetails.height && (
                    <span className="text-xs text-sports-muted">{playerDetails.height}</span>
                  )}
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold flex items-center shadow-sm ${
                    heat === 'Hot'  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                    heat === 'Cold' ? 'bg-blue-500/20  text-blue-400  border border-blue-500/30'   :
                                     'bg-sports-secondary text-sports-muted'
                  }`}>
                    {heat === 'Hot'  ? <Flame     size={12} className="mr-1" /> :
                     heat === 'Cold' ? <Snowflake size={12} className="mr-1" /> :
                                      <Minus     size={12} className="mr-1" />}
                    {heat} vs L20
                  </span>
                  {nextOpponent && (
                    <span className="text-xs bg-sports-accent/10 text-sports-accent border border-sports-accent/20 px-2 py-0.5 rounded font-bold flex items-center gap-1">
                      <Shield size={10} /> Tonight vs {nextOpponent}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Matchup Context */}
          <MatchupContext nextOpponent={nextOpponent || ''} />

          {/* H2H History vs Tonight's Opponent */}
          {nextOpponent && (
            <H2HCard
              playerId={id}
              opponentAbbr={nextOpponent}
              playerName={playerDetails?.full_name}
              category={category.id}
            />
          )}

          {/* Prop Analysis Dashboard + Shot Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <PropAnalysisDashboard
                stats={stats}
                playerName={playerDetails
                  ? `${playerDetails.first_name} ${playerDetails.last_name}`
                  : 'Loading…'}
                teamAbbr={playerDetails?.team?.abbreviation || ''}
                nextOpponent={nextOpponent ? { id: 0, abbreviation: nextOpponent } : null}
              />
            </div>
            <div className="lg:col-span-1">
              <ShotChart data={shotData} />
            </div>
          </div>

          {/* Betting Edge Card */}
          <BettingEdgeCard
            stats={stats}
            category={category.id}
            categoryLabel={category.label}
            nextOpponent={nextOpponent}
          />

          {/* Game Logs + Advanced Stats */}
          <div className="mt-8 relative z-0">
            <h2 className="text-xl font-bold text-white mb-4 m-0">
              Recent Games &amp; Advanced Stats
            </h2>
            <StatsTable stats={stats} category={category.id} />
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayerAnalysis;
