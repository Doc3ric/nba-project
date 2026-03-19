import { useState, useEffect } from 'react';
import { getPlayerStats, getPlayerDetails } from '../services/api';

export const usePlayerStats = (playerId) => {
  const [stats,         setStats]         = useState([]);
  const [playerDetails, setPlayerDetails] = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);

  useEffect(() => {
    if (!playerId) return;

    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch stats and player details in parallel
        const [data, details] = await Promise.all([
          getPlayerStats(playerId),
          getPlayerDetails(playerId),
        ]);

        if (cancelled) return;

        setStats(data || []);

        if (details) {
          setPlayerDetails(details);
        } else if (data && data.length > 0) {
          // Minimal fallback if bio endpoint failed but we have stat data
          setPlayerDetails({
            id:         parseInt(playerId),
            first_name: 'NBA',
            last_name:  'Player',
            full_name:  'NBA Player',
            position:   '',
            team: {
              id:           0,
              abbreviation: '',
              full_name:    '',
            },
          });
        }
      } catch (err) {
        if (!cancelled) {
          console.error('usePlayerStats error:', err);
          setError('Failed to load player data. Please try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetch();
    return () => { cancelled = true; };
  }, [playerId]);

  return { stats, playerDetails, loading, error };
};
