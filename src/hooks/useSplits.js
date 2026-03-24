import { useEffect, useState } from 'react';
import { getPlayerSplits } from '../services/api';

/**
 * Hook to fetch player splits from backend
 * Calls GET /api/players/{id}/splits?stat=pts&line=27.5&opponent=LAL
 * Returns hit rate data with optional opponent filtering
 */
export const useSplits = (playerId, stat = 'pts', line = 27.5, opponent = null) => {
  const [splits, setSplits] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!playerId) {
      setSplits(null);
      return;
    }

    const fetchSplits = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getPlayerSplits(playerId, stat, line, opponent);
        if (data) {
          setSplits(data);
        } else {
          setSplits(null);
        }
      } catch (err) {
        console.error('useSplits error:', err);
        setError(err);
        setSplits(null);
      } finally {
        setLoading(false);
      }
    };

    fetchSplits();
  }, [playerId, stat, line, opponent]);

  return { splits, loading, error };
};
