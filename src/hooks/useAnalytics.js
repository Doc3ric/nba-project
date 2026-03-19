import { useMemo } from 'react';
import {
  calculateAverage,
  calculateMedian,
  calculateStandardDeviation,
  calculateVariance,
  calculateWeightedAverage,
  calculateHitRate,
  calculatePredictionScore,
  calculatePlayerHeat,
  formatChartData,
  calculateConsistencyScore,
  calculateTrendSlope,
  calculateFilteredStats,
  calculateH2HHitRate
} from '../utils/analytics';

export const useAnalytics = (stats, category = 'pts') => {
  return useMemo(() => {
    if (!stats || stats.length === 0) {
      return {
        averages: { l5: 0, l10: 0, l20: 0 },
        advanced: { median: 0, stdDev: 0, variance: 0, weightedAvg: 0, consistency: 0, trendSlope: 0 },
        heat: 'Neutral',
        chartData: []
      };
    }

    return {
      averages: {
        l5: calculateAverage(stats, category, 5),
        l10: calculateAverage(stats, category, 10),
        l20: calculateAverage(stats, category, 20)
      },
      advanced: {
        median: calculateMedian(stats, category, 20),
        stdDev: calculateStandardDeviation(stats, category, 20),
        variance: calculateVariance(stats, category, 20),
        weightedAvg: calculateWeightedAverage(stats, category, 10),
        consistency: calculateConsistencyScore(stats, category, 15),
        trendSlope: calculateTrendSlope(stats, category, 5)
      },
      heat: calculatePlayerHeat(stats, category),
      chartData: formatChartData(stats, category)
    };
  }, [stats, category]);
};

// Advanced Prop Analysis Hook
export const usePropAnalysis = (stats, category, line, filters = {}, nextOpponentId = null) => {
  return useMemo(() => {
    if (!stats || stats.length === 0 || !line) {
      return {
        hitRates: {
            season: { hits: 0, total: 0, percentage: 0 },
            l5: { hits: 0, total: 0, percentage: 0 },
            l10: { hits: 0, total: 0, percentage: 0 },
            l20: { hits: 0, total: 0, percentage: 0 },
            h2h: { hits: 0, total: 0, percentage: 0 }
        },
        chartData: []
      };
    }

    const filteredStats = calculateFilteredStats(stats, filters);

    return {
      hitRates: {
        season: calculateHitRate(stats, category, line, null, filters),
        l5: calculateHitRate(stats, category, line, 5, filters),
        l10: calculateHitRate(stats, category, line, 10, filters),
        l20: calculateHitRate(stats, category, line, 20, filters),
        h2h: nextOpponentId ? calculateH2HHitRate(stats, category, line, nextOpponentId) : { hits: 0, total: 0, percentage: 0 }
      },
      chartData: formatChartData(filteredStats, category, line)
    };
  }, [stats, category, line, filters, nextOpponentId]);
};

// Hook for Prop specific edge calculation
export const useBettingEdge = (stats, category, line, matchupContext = null) => {
  return useMemo(() => {
    if (!stats || stats.length === 0 || !line) {
      return { hitRateL5: 0, hitRateL10: 0, predictionScore: 50, predictionConfidence: "Low", consistencyObj: { score: 0, label: "⚠️ Volatile" } };
    }

    const prediction = calculatePredictionScore(stats, category, line, matchupContext);
    
    return {
      hitRateL5: calculateHitRate(stats, category, line, 5),
      hitRateL10: calculateHitRate(stats, category, line, 10),
      predictionScore: prediction.probability,
      predictionConfidence: prediction.confidence,
      consistencyObj: calculateConsistencyScore(stats, category, 15)
    };
  }, [stats, category, line, matchupContext]);
};
