import { useState, useEffect, useCallback } from 'react';
import { fetchPlayers } from '../services/api';

const RECENT_SEARCHES_KEY = 'nba_recent_searches';

export const usePlayerSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);

  // Load recent searches on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Failed to load recent searches from local storage');
    }
  }, []);

  // Debounced search effect
  useEffect(() => {
    const searchApi = async () => {
      if (!query || query.length < 2) {
        setResults([]);
        return;
      }
      
      setIsSearching(true);
      try {
        const players = await fetchPlayers(query);
        setResults(players);
      } catch (error) {
        console.error("Search error:", error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceTimer = setTimeout(searchApi, 400);
    return () => clearTimeout(debounceTimer);
  }, [query]);

  const addRecentSearch = useCallback((player) => {
    setRecentSearches(prev => {
      // Remove if it already exists to put it at the top
      const filtered = prev.filter(p => p.id !== player.id);
      const updated = [player, ...filtered].slice(0, 5); // Keep top 5
      
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save to local storage');
      }
      
      return updated;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch (e) {}
  }, []);

  return {
    query,
    setQuery,
    results,
    isSearching,
    recentSearches,
    addRecentSearch,
    clearRecentSearches
  };
};
