import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Search, RefreshCw, ChevronDown, Clock, Loader2, X } from 'lucide-react';
import { fetchInjuryReport, getAllActiveGames } from '../services/api';
import PlayerIcon from '../components/common/PlayerIcon';

const STATUS_VALUES = ['Out', 'Doubtful', 'Questionable', 'Game Time Decision', 'Day-To-Day', 'IR'];

const TEAM_IDS = {
  ATL: 1610612737, BOS: 1610612738, CLE: 1610612739, NOP: 1610612740,
  CHI: 1610612741, DAL: 1610612742, DEN: 1610612743, GSW: 1610612744,
  HOU: 1610612745, LAC: 1610612746, LAL: 1610612747, MIA: 1610612748,
  MIL: 1610612749, MIN: 1610612750, BKN: 1610612751, NYK: 1610612752,
  ORL: 1610612753, IND: 1610612754, PHI: 1610612755, PHX: 1610612756,
  POR: 1610612757, SAC: 1610612758, SAS: 1610612759, OKC: 1610612760,
  TOR: 1610612761, UTA: 1610612762, MEM: 1610612763, WAS: 1610612764,
  DET: 1610612765, CHA: 1610612766
};

const getLogoUrl = (teamAbbr) => {
  if (!teamAbbr) return 'https://cdn.nba.com/logos/nba/1610612747/primary/L/logo.svg'; 
  const cleanAbbr = String(teamAbbr).trim().toUpperCase();
  const teamId = TEAM_IDS[cleanAbbr];
  if (!teamId) return 'https://cdn.nba.com/logos/nba/1610612747/primary/L/logo.svg'; 
  return `https://cdn.nba.com/logos/nba/${teamId}/primary/L/logo.svg`;
};

const STATUS_LABELS = {
  'Game Time Decision': 'GTD',
};

const InjuriesPage = () => {
  const [injuries, setInjuries] = useState([]);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState(['All']);
  const [groupBy, setGroupBy] = useState('status');
  const [expandedRows, setExpandedRows] = useState({});
  const [lastUpdated, setLastUpdated] = useState(null);

  // Fetch initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [injuryData, gamesData] = await Promise.all([
          fetchInjuryReport(),
          getAllActiveGames(),
        ]);
        setInjuries(injuryData || []);
        setGames(gamesData || []);
        setLastUpdated(new Date());
        setLoading(false);
      } catch (err) {
        console.error('Failed to load injury data:', err);
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Handle refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const [injuryData, gamesData] = await Promise.all([
        fetchInjuryReport(true),
        getAllActiveGames(),
      ]);
      setInjuries(injuryData || []);
      setGames(gamesData || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to refresh injury data:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Filter and search injuries
  const filteredInjuries = useMemo(() => {
    let result = injuries;

    // Apply status filter
    if (!selectedStatuses.includes('All')) {
      result = result.filter(inj => selectedStatuses.includes(inj.status));
    }

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(inj =>
        inj.name.toLowerCase().includes(term) ||
        inj.team.toLowerCase().includes(term) ||
        (inj.reason && inj.reason.toLowerCase().includes(term))
      );
    }

    return result;
  }, [injuries, selectedStatuses, searchTerm]);

  // Count injuries by status
  const statusCounts = useMemo(() => {
    const counts = { All: injuries.length };
    STATUS_VALUES.forEach(status => {
      counts[status] = injuries.filter(inj => inj.status === status).length;
    });
    return counts;
  }, [injuries]);

  // Group injuries for display
  const groupedInjuries = useMemo(() => {
    if (groupBy === 'status') {
      const grouped = {};
      STATUS_VALUES.forEach(status => {
        grouped[status] = filteredInjuries.filter(inj => inj.status === status);
      });
      return Object.entries(grouped).filter(([_, list]) => list.length > 0);
    } else if (groupBy === 'team') {
      const grouped = {};
      filteredInjuries.forEach(inj => {
        if (!grouped[inj.team]) grouped[inj.team] = [];
        grouped[inj.team].push(inj);
      });
      return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
    } else if (groupBy === 'game') {
      // Group by upcoming game matchup
      const grouped = { 'No Game Today': [] };
      filteredInjuries.forEach(inj => {
        const game = games.find(g =>
          g.home_team.abbreviation === inj.team ||
          g.visitor_team.abbreviation === inj.team
        );
        const gameKey = game
          ? `${game.visitor_team.abbreviation} vs ${game.home_team.abbreviation} - ${game.status || 'TBD'}`
          : 'No Game Today';
        if (!grouped[gameKey]) grouped[gameKey] = [];
        grouped[gameKey].push(inj);
      });
      return Object.entries(grouped).filter(([_, list]) => list.length > 0);
    }
    return [];
  }, [filteredInjuries, groupBy, games]);

  // Format time elapsed
  const formatTimeElapsed = (date) => {
    if (!date) return 'just now';
    const now = new Date();
    const diffMs = now - new Date(date);
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(date).toLocaleDateString();
  };

  // Toggle status filter
  const toggleStatus = (status) => {
    if (status === 'All') {
      setSelectedStatuses(['All']);
    } else {
      let newStatuses = selectedStatuses.includes('All')
        ? [status]
        : selectedStatuses.includes(status)
          ? selectedStatuses.filter(s => s !== status)
          : [...selectedStatuses, status];
      setSelectedStatuses(newStatuses.length === 0 ? ['All'] : newStatuses);
    }
  };

  // Toggle expandable row
  const toggleRow = (injuryId) => {
    setExpandedRows(prev => ({
      ...prev,
      [injuryId]: !prev[injuryId],
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sports-bg to-sports-dark flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin text-sports-accent mx-auto mb-4" size={32} />
          <p className="text-sports-muted">Loading injury data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sports-bg to-sports-dark py-8">
      <div className="max-w-5xl mx-auto px-4">
        {/* Header & Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <AlertTriangle size={32} className="text-sports-yellow" />
            <div>
              <h1 className="text-4xl font-black text-white">Injury Report</h1>
              <p className="text-sports-muted text-sm mt-1">
                Updated {formatTimeElapsed(lastUpdated)}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
            {/* Search Bar */}
            <div className="relative flex-1 md:w-64">
              <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-sports-muted" />
              <input
                type="text"
                placeholder="Search players, teams..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-sports-card border border-sports-secondary text-white placeholder-sports-muted focus:outline-none focus:ring-2 focus:ring-sports-accent transition-all text-sm"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sports-muted hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              )}
            </div>
            
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2.5 bg-sports-card border border-sports-secondary hover:border-sports-accent/50 rounded-lg transition-all disabled:opacity-50 shrink-0"
              title="Refresh injury data"
            >
              <RefreshCw size={18} className={`text-sports-yellow ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Summary Stats as Interactive Built-in Filters */}
        <div className="mb-8">
          <div className="grid grid-cols-2 lg:grid-cols-7 gap-2">
            {['All', 'Out', 'Doubtful', 'Questionable', 'Game Time Decision', 'Day-To-Day', 'IR'].map(status => {
              const count = statusCounts[status] || 0;
              const isSelected = selectedStatuses.includes(status);
              const isEmpty = count === 0 && status !== 'All';

              const bgClass =
                status === 'All'
                  ? 'bg-sports-secondary/30'
                  : status === 'Out' || status === 'IR'
                  ? 'bg-red-500/10'
                  : status === 'Doubtful'
                    ? 'bg-orange-500/10'
                    : status === 'Day-To-Day'
                      ? 'bg-amber-500/10'
                      : 'bg-blue-500/10';

              const textClass =
                status === 'All'
                  ? 'text-white'
                  : status === 'Out' || status === 'IR'
                  ? 'text-red-400'
                  : status === 'Doubtful'
                    ? 'text-orange-400'
                    : status === 'Day-To-Day'
                      ? 'text-amber-400'
                      : 'text-blue-400';

              const borderClass = isSelected
                ? `border-2 ${status === 'All' ? 'border-white/50' : textClass.replace('text-', 'border-')}`
                : 'border border-sports-secondary hover:border-sports-accent/50';

              return (
                <button
                  key={status}
                  onClick={() => toggleStatus(status)}
                  disabled={isEmpty}
                  className={`flex flex-col items-center justify-center rounded-lg p-3 text-center transition-all ${bgClass} ${borderClass} ${isEmpty ? 'opacity-30 grayscale cursor-not-allowed' : 'cursor-pointer'} ${isSelected ? 'shadow-[0_0_15px_-3px_rgba(255,255,255,0.1)]' : ''}`}
                >
                  <div className={`text-2xl font-black ${textClass} ${isSelected ? 'drop-shadow-md' : ''}`}>{count}</div>
                  <div className="text-[10px] text-sports-muted uppercase tracking-wider mt-1 font-bold">
                    {status === 'All' ? 'All Players' : STATUS_LABELS[status] || status}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Grouping Toggle */}
        <div className="mb-6 flex gap-2">
          <span className="text-sm text-sports-muted font-semibold self-center">Group by:</span>
          {['status', 'team', 'game'].map(option => (
            <button
              key={option}
              onClick={() => setGroupBy(option)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                groupBy === option
                  ? 'bg-sports-accent text-black'
                  : 'bg-sports-secondary text-sports-muted hover:bg-sports-secondary/80'
              }`}
            >
              {option === 'status' && 'Status'}
              {option === 'team' && 'Team'}
              {option === 'game' && 'Game'}
            </button>
          ))}
        </div>

        {/* Injury List */}
        {filteredInjuries.length === 0 ? (
          <div className="text-center py-16">
            <AlertTriangle size={48} className="text-sports-muted/30 mx-auto mb-4" />
            <p className="text-sports-muted text-lg">
              {searchTerm ? 'No injuries match your search.' : 'No injuries to report today!'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedInjuries.map(([groupName, groupInjuries]) => (
              <div key={groupName}>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-sports-secondary">
                  <h2 className="text-lg font-bold text-white">{groupName}</h2>
                  <span className="text-sm text-sports-muted font-semibold">
                    ({groupInjuries.length})
                  </span>
                </div>

                <div className="space-y-2">
                  {groupInjuries.map((injury, idx) => {
                    const injuryId = `${injury.player_id || injury.name}-${idx}`;
                    const isExpanded = expandedRows[injuryId];

                    return (
                      <div
                        key={injuryId}
                        className={`bg-sports-card border border-sports-secondary rounded-lg overflow-hidden transition-all hover:shadow-lg hover:border-r-sports-accent/50 hover:border-t-sports-accent/50 hover:border-b-sports-accent/50 ${
                          injury.status === 'Out' || injury.status === 'IR' ? 'border-l-4 border-l-red-500' :
                          injury.status === 'Doubtful' ? 'border-l-4 border-l-orange-500' :
                          injury.status === 'Day-To-Day' ? 'border-l-4 border-l-amber-500' :
                          'border-l-4 border-l-blue-500'
                        }`}
                      >
                        {/* Row Content */}
                        <button
                          onClick={() => toggleRow(injuryId)}
                          className="w-full p-4 flex items-center justify-between gap-3 hover:bg-sports-secondary/20 transition-colors text-left"
                          aria-expanded={isExpanded}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <PlayerIcon playerId={injury.player_id} name={injury.name} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-base font-bold text-white truncate">{injury.name}</p>
                                <div className="w-6 h-6 flex items-center justify-center rounded-sm bg-white/5 mx-1" title={injury.team}>
                                  <img 
                                    src={getLogoUrl(injury.team)} 
                                    alt={injury.team}
                                    className="w-full h-full object-contain"
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                  />
                                </div>
                              </div>
                              <p className="text-sm font-medium text-gray-300 mt-1 capitalize leading-tight">
                                {injury.reason || 'Not specified'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center shrink-0">
                            <ChevronDown
                              size={18}
                              className={`text-sports-muted transition-transform ${
                                isExpanded ? 'transform rotate-180' : ''
                              }`}
                            />
                          </div>
                        </button>

                        {/* Expandable Details */}
                        {isExpanded && (
                          <div className="px-4 py-4 border-t border-sports-secondary bg-sports-dark/50 space-y-4">
                            <div className={`grid grid-cols-1 ${injury.stat_impact != null ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4`}>
                              <div>
                                <p className="text-xs text-sports-muted uppercase tracking-wider font-semibold mb-1">
                                  Body Part
                                </p>
                                <p className="text-sm text-white font-medium capitalize">
                                  {injury.reason || 'Not specified'}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-sports-muted uppercase tracking-wider font-semibold mb-1">
                                  Expected Return
                                </p>
                                <p className="text-sm text-white font-medium">
                                  {injury.return_date || 'Unknown'}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-sports-muted uppercase tracking-wider font-semibold mb-1">
                                  Tonight's Matchup
                                </p>
                                {(() => {
                                  const g = games.find(gm => gm.home_team?.abbreviation === injury.team || gm.visitor_team?.abbreviation === injury.team);
                                  return g ? (
                                    <Link to={`/game/${g.id}`} className="text-sm text-sports-accent font-medium hover:underline flex items-center gap-1">
                                      {g.visitor_team.abbreviation} @ {g.home_team.abbreviation} ({g.status})
                                    </Link>
                                  ) : (
                                    <p className="text-sm text-white font-medium">No Game Today</p>
                                  );
                                })()}
                              </div>
                              {injury.stat_impact != null && (
                                <div>
                                  <p className="text-xs text-sports-muted uppercase tracking-wider font-semibold mb-1">
                                    Stat Impact
                                  </p>
                                  <p className="text-sm text-white font-medium flex items-center gap-1.5">
                                    <span className="font-extrabold text-sports-accent">{injury.stat_impact.toFixed(1)}</span> PPG (L10)
                                  </p>
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-xs text-sports-muted uppercase tracking-wider font-semibold mb-1">
                                Status Impact
                              </p>
                              <p className="text-sm text-sports-muted leading-relaxed">
                                {injury.status === 'Out'
                                  ? 'This player is ruled OUT. They will not play in today\'s game.'
                                  : injury.status === 'Doubtful'
                                    ? 'Doubtful status indicates a very low chance of playing. Plan accordingly.'
                                    : injury.status === 'Questionable'
                                      ? 'Questionable status is unclear. Check closer to game time for updates.'
                                      : injury.status === 'Game Time Decision'
                                        ? 'Status will be decided at game time. Monitor for updates.'
                                        : injury.status === 'Day-To-Day'
                                          ? 'Expected to be limited but potentially available.'
                                          : 'On injured reserve. Unavailable for the season.'}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer - Last Updated */}
        {lastUpdated && (
          <div className="flex items-center justify-center gap-2 mt-12 text-xs text-sports-muted">
            <Clock size={14} />
            <span>Last updated {formatTimeElapsed(lastUpdated)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default InjuriesPage;
