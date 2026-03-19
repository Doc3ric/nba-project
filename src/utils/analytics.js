/**
 * Calculates average for a specific stat category over the last N games
 */
export const calculateAverage = (stats, category, numGames) => {
  if (!stats || stats.length === 0) return 0;
  
  const recentStats = stats.slice(0, numGames).filter(s => s.min && s.min !== '00:00' && s.min !== '0');
  if (recentStats.length === 0) return 0;

  const total = recentStats.reduce((sum, game) => sum + (game[category] || 0), 0);
  return (total / recentStats.length).toFixed(1);
};

/**
 * Calculates a rolling average array for chart overlays
 */
export const calculateRollingAverage = (stats, category, windowSize = 3) => {
  if (!stats || stats.length === 0) return [];
  
  // Recharts uses oldest to newest, stats array is newest to oldest
  const reversedStats = [...stats].slice(0, 15).reverse();
  return reversedStats.map((game, i, arr) => {
     if (i < windowSize - 1) return { ...game, rollingAvg: null };
     let sum = 0;
     for (let j = 0; j < windowSize; j++) {
       sum += (arr[i-j][category] || 0);
     }
     return { ...game, rollingAvg: Number((sum / windowSize).toFixed(1)) };
  });
};

/**
 * Filters stats based on splits (Home/Away, Win/Loss)
 */
export const calculateFilteredStats = (stats, filters = {}) => {
  if (!stats) return [];
  return stats.filter(game => {
    let match = true;
    if (filters.homeAway === 'Home') match = match && game.team?.id === game.game?.home_team_id;
    if (filters.homeAway === 'Away') match = match && game.team?.id !== game.game?.home_team_id;
    if (filters.winLoss === 'W') match = match && ((game.team?.id === game.game?.home_team_id && game.game?.home_team_score > game.game?.visitor_team_score) || (game.team?.id !== game.game?.home_team_id && game.game?.visitor_team_score > game.game?.home_team_score));
    if (filters.winLoss === 'L') match = match && ((game.team?.id === game.game?.home_team_id && game.game?.home_team_score < game.game?.visitor_team_score) || (game.team?.id !== game.game?.home_team_id && game.game?.visitor_team_score < game.game?.home_team_score));
    if (filters.opponentId) match = match && (game.game?.home_team_id === filters.opponentId || game.game?.visitor_team_id === filters.opponentId);
    return match;
  });
};

/**
 * Calculates the hit rate (%) for a specific stat against a betting line
 */
export const calculateHitRate = (stats, category, line, numGames, filters = {}) => {
  if (!stats || stats.length === 0 || !line) return { hits: 0, total: 0, percentage: 0 };

  let filtered = calculateFilteredStats(stats, filters);
  const recentStats = numGames ? filtered.slice(0, numGames) : filtered;
  const validStats = recentStats.filter(s => s.min && s.min !== '00:00' && s.min !== '0');
  
  if (validStats.length === 0) return { hits: 0, total: 0, percentage: 0 };

  let hits = 0;
  validStats.forEach(game => {
    if ((game[category] || 0) > line) {
      hits++;
    }
  });

  return {
    hits,
    total: validStats.length,
    percentage: Math.round((hits / validStats.length) * 100)
  };
};

/**
 * Calculates H2H Hit Rate
 */
export const calculateH2HHitRate = (stats, category, line, opponentId) => {
  return calculateHitRate(stats, category, line, null, { opponentId });
};

/**
 * Formats data for Recharts Trend Chart including Rolling Average and Hit status
 */
export const formatChartData = (stats, category = 'pts', line = null) => {
  if (!stats || stats.length === 0) return [];
  
  const rollingData = calculateRollingAverage(stats, category, 3);
  
  return rollingData.slice(rollingData.length > 20 ? rollingData.length - 20 : 0).map(game => ({
    date: new Date(game.game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    fullDate: new Date(game.game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    value: game[category] || 0,
    rollingAvg: game.rollingAvg,
    isHit: line ? (game[category] || 0) > line : null,
    opponent: game.game.home_team_id === game.team?.id ? game.game.visitor_team?.abbreviation : game.game.home_team?.abbreviation,
    isHome: game.team?.id === game.game?.home_team_id
  }));
};

/**
 * Calculates the median for a specific stat category
 */
export const calculateMedian = (stats, category, numGames) => {
  if (!stats || stats.length === 0) return 0;
  
  const recentStats = stats.slice(0, numGames).filter(s => s.min && s.min !== '00:00' && s.min !== '0');
  if (recentStats.length === 0) return 0;

  const values = recentStats.map(game => game[category] || 0).sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  
  const median = values.length % 2 !== 0 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  return median.toFixed(1);
};

/**
 * Calculates the variance for a specific stat category
 */
export const calculateVariance = (stats, category, numGames) => {
  if (!stats || stats.length === 0) return 0;
  
  const recentStats = stats.slice(0, numGames).filter(s => s.min && s.min !== '00:00' && s.min !== '0');
  if (recentStats.length === 0) return 0;

  const mean = calculateAverage(stats, category, numGames);
  const squareDiffs = recentStats.map(game => {
    const diff = (game[category] || 0) - mean;
    return diff * diff;
  });

  const avgSquareDiff = squareDiffs.reduce((sum, val) => sum + val, 0) / squareDiffs.length;
  return avgSquareDiff;
};

/**
 * Calculates standard deviation
 */
export const calculateStandardDeviation = (stats, category, numGames) => {
  const variance = calculateVariance(stats, category, numGames);
  return Math.sqrt(variance).toFixed(1);
};

/**
 * Calculates Consistency Score (0-100) based on coefficient of variation.
 * Lower volatility = Higher Consistency.
 */
export const calculateConsistencyScore = (stats, category, numGames = 15) => {
   const mean = parseFloat(calculateAverage(stats, category, numGames));
   if (mean === 0) return { score: 0, label: "⚠️ Volatile" };
   const stdDev = parseFloat(calculateStandardDeviation(stats, category, numGames));
   
   // Coefficient of Variation (CV) = StdDev / Mean
   const cv = stdDev / mean;
   
   // Typical CV in NBA is between 0.2 (very consistent) to 0.7 (highly volatile)
   // We map this to a 0-100 score.
   let score = 100 - ((cv - 0.1) * 150);
   const finalScore = Math.max(0, Math.min(100, Math.round(score)));
   
   let label = "Normal";
   if (finalScore >= 80) label = "🔥 Highly Consistent";
   else if (finalScore <= 40) label = "⚠️ Volatile";
   
   return { score: finalScore, label };
};

/**
 * Calculates Trend Slope (Linear Regression) to determine momentum trajectory
 * Returns a positive or negative float.
 */
export const calculateTrendSlope = (stats, category, numGames = 5) => {
   const recentStats = stats.slice(0, numGames).filter(s => s.min && s.min !== '00:00' && s.min !== '0');
   if (recentStats.length < 2) return 0;
   
   // We want oldest to newest for chronological slope
   const y = recentStats.map(s => s[category] || 0).reverse(); 
   const n = y.length;
   
   let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
   for (let i = 0; i < n; i++) {
     sumX += i;
     sumY += y[i];
     sumXY += i * y[i];
     sumX2 += i * i;
   }
   
   const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
   return slope.toFixed(2);
};

/**
 * Calculates weighted average, giving more weight to recent games
 */
export const calculateWeightedAverage = (stats, category, numGames) => {
  if (!stats || stats.length === 0) return 0;
  
  const recentStats = stats.slice(0, numGames).filter(s => s.min && s.min !== '00:00' && s.min !== '0');
  if (recentStats.length === 0) return 0;

  let weightedSum = 0;
  let weightTotal = 0;

  // Most recent game (index 0) gets highest weight.
  recentStats.forEach((game, index) => {
    const weight = recentStats.length - index; 
    weightedSum += (game[category] || 0) * weight;
    weightTotal += weight;
  });

  return (weightedSum / weightTotal).toFixed(1);
};

/**
 * Parses minutes string ('35:20') to a float (35.33)
 */
const parseMinutes = (minStr) => {
   if (!minStr) return 0;
   const parts = minStr.split(':');
   return parseInt(parts[0]) + (parseInt(parts[1] || 0) / 60);
};

/**
 * Minutes projection based on recent trends
 */
export const calculateMinutesProjection = (stats) => {
    if (!stats || stats.length === 0) return 0;
    
    // Average L5 minutes
    const l5Stats = stats.slice(0, 5).filter(s => s.min && s.min !== '00:00' && s.min !== '0');
    if (l5Stats.length === 0) return 0;
    
    let totalMins = 0;
    l5Stats.forEach(game => {
       totalMins += parseMinutes(game.min);
    });
    
    return totalMins / l5Stats.length;
};

/**
 * True Prediction Probability Engine
 * Returns probability of hitting the OVER, and confidence level
 */
export const calculatePredictionScore = (stats, category, line, context = null) => {
  if (!stats || stats.length === 0 || !line) return { probability: 50, confidence: "Low", rawScore: 50 };

  const hitRateL10 = calculateHitRate(stats, category, line, 10);
  const hitRateL5 = calculateHitRate(stats, category, line, 5);
  const weightedAvg = parseFloat(calculateWeightedAverage(stats, category, 10));
  const slope = parseFloat(calculateTrendSlope(stats, category, 5));
  const consistencyObj = calculateConsistencyScore(stats, category, 15);
  const projMins = calculateMinutesProjection(stats);
  
  // Base Weights
  // 40% Recent Form (L5), 30% Trend (L10), 20% Weighted Average, 10% Consistency
  
  // 1. Convert Hit Rates to base probabilities
  let probability = (hitRateL5 * 0.45) + (hitRateL10 * 0.35);

  // 2. Averages vs Line Edge
  const avgEdge = ((weightedAvg / line) - 1) * 100; // e.g., 25.5 / 24.5 = +4%
  probability += Math.min(15, Math.max(-15, avgEdge * 1.5));

  // 3. Trend Slope (Momentum)
  probability += (slope * 2);

  // 4. Consistency Adjustment
  // Highly consistent players over the line get a bump, under the line get deducted
  if (weightedAvg > line) {
     probability += (consistencyObj.score > 70 ? 5 : 0);
  } else {
     probability -= (consistencyObj.score > 70 ? 5 : 0);
  }
  
  // 5. Minutes Modifier
  // If player is averaging > 32 mins, they have high floor.
  if (projMins < 20) probability -= 10;
  if (projMins > 34) probability += 5;
  
  // 6. Matchup Context (Team Defense & Pace)
  if (context) {
     const paceLeagueAvg = 100;
     const paceAdj = (context.pace / paceLeagueAvg) - 1; // e.g. 103/100 = +3%
     // Adjust probability slightly based on pace expected possessions
     probability += (paceAdj * 100); 
     
     // Opponent defense ranking (1-30, 1 is best defense)
     if (context.defRatingRank > 20) probability += 6; // Weak defense (good for over)
     if (context.defRatingRank < 10) probability -= 6; // Elite defense
  }

  // Bound probability 1-99%
  const finalProb = Math.max(1, Math.min(99, Math.round(probability)));
  
  // Determine Confidence
  let confidence = "Low";
  if (finalProb >= 65 || finalProb <= 35) {
      if (consistencyObj.score >= 60) confidence = "High";
      else confidence = "Medium";
  } else if (finalProb >= 55 || finalProb <= 45) {
      confidence = "Medium";
  }

  return { probability: finalProb, confidence, rawScore: finalProb };
};

/**
 * Calculates Player Heat Indicator based on L5 vs Season/L20 averages
 */
export const calculatePlayerHeat = (stats, category = 'pts') => {
   if (!stats || stats.length < 10) return "Neutral";

   const l5Avg = parseFloat(calculateAverage(stats, category, 5));
   const l20Avg = parseFloat(calculateAverage(stats, category, 20));

   if (l5Avg > l20Avg * 1.15) return "Hot";
   if (l5Avg < l20Avg * 0.85) return "Cold";
   return "Neutral";
};
