import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Clock, X } from 'lucide-react';
import PlayerIcon from '../common/PlayerIcon';
import { useNavigate } from 'react-router-dom';
import { usePlayerSearch } from '../../hooks/usePlayerSearch';

const PlayerSearch = () => {
  const {
    query,
    setQuery,
    results,
    isSearching,
    recentSearches,
    addRecentSearch,
    clearRecentSearches
  } = usePlayerSearch();
  
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef(null);
  const navigate = useNavigate();

  // Handle outside click to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (player) => {
    addRecentSearch(player);
    setQuery('');
    setShowDropdown(false);
    navigate(`/player/${player.id}`);
  };

  const showRecents = query.length === 0 && recentSearches.length > 0;
  const showResults = query.length >= 2 && results.length > 0;

  return (
    <div className="relative w-full max-w-2xl" ref={wrapperRef}>
      <div className="relative flex items-center">
        <Search className="absolute left-4 text-gray-500" size={20} />
        <input
          type="text"
          value={query}
          onFocus={() => setShowDropdown(true)}
          onChange={(e) => {
             setQuery(e.target.value);
             setShowDropdown(true);
          }}
          placeholder="Search for an NBA player (e.g., LeBron James)..."
          className="w-full bg-[#1a1f26] border border-[#262c36] text-white rounded-xl py-3.5 pl-12 pr-12 focus:outline-none focus:border-[#1a9a5c] transition-all shadow-sm placeholder:text-gray-500 text-sm"
        />
        {isSearching && (
          <Loader2 className="absolute right-4 text-[#1a9a5c] animate-spin" size={20} />
        )}
      </div>

      {showDropdown && (showRecents || showResults) && (
        <div className="absolute top-full text-left left-0 right-0 mt-2 bg-sports-card border border-sports-secondary rounded-xl shadow-2xl z-50 overflow-hidden max-h-80 overflow-y-auto">
          
          {showRecents && !showResults && (
            <div className="p-3 border-b border-sports-secondary/50 flex justify-between items-center text-xs text-sports-muted uppercase font-bold tracking-wider">
              <span className="flex items-center gap-1"><Clock size={14} /> Recent Searches</span>
              <button onClick={(e) => { e.stopPropagation(); clearRecentSearches(); }} className="hover:text-sports-text flex items-center gap-1">
                Clear <X size={14} />
              </button>
            </div>
          )}

          {(showResults ? results : recentSearches).map((player) => (
            <div
              key={player.id}
              onClick={() => handleSelect(player)}
              className="flex items-center justify-between p-4 hover:bg-sports-secondary/50 cursor-pointer border-b border-sports-secondary/50 last:border-0 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <PlayerIcon playerId={player.id} name={`${player.first_name} ${player.last_name}`} className="w-10 h-10 border border-sports-secondary/50 group-hover:border-sports-accent/50 transition-all shadow-sm" />
                <div>
                  <div className="font-bold text-white group-hover:text-sports-accent transition-colors">{player.first_name} {player.last_name}</div>
                  <div className="text-xs text-sports-muted font-medium">{player.team?.full_name} • {player.position || 'N/A'}</div>
                </div>
              </div>
              <div className="w-9 h-9 rounded-lg bg-sports-dark flex items-center justify-center font-black text-[10px] text-sports-muted border border-sports-secondary group-hover:border-sports-accent/30 group-hover:text-sports-accent transition-all shadow-inner">
                {player.team?.abbreviation}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {showDropdown && !isSearching && query.length > 2 && results.length === 0 && (
        <div className="absolute top-full text-left left-0 right-0 mt-2 bg-sports-card border border-sports-secondary rounded-xl shadow-2xl z-50 p-4 text-center text-sports-muted">
          No players found matching "{query}"
        </div>
      )}
    </div>
  );
};

export default PlayerSearch;
