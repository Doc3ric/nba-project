import React, { memo } from 'react';
import { useAnalytics } from '../../hooks/useAnalytics';

const StatsTable = memo(({ stats, category = 'pts' }) => {
  const { averages, advanced } = useAnalytics(stats, category);

  if (!stats || stats.length === 0) {
    return (
      <div className="text-sports-muted py-8 text-center bg-sports-card rounded-xl">
        No stats available for this player.
      </div>
    );
  }

  // Helper: get opponent abbreviation from a game log entry (no team.id needed)
  const getOpponent = (game, playerTeamAbbr) => {
    if (!game) return 'UNK';
    const home = game.home_team?.abbreviation    || '';
    const away = game.visitor_team?.abbreviation || '';
    if (!home && !away) return 'UNK';
    // If playerTeamAbbr is available, use it directly
    if (playerTeamAbbr) {
      return home === playerTeamAbbr ? `vs ${away}` : `@ ${home}`;
    }
    // Fallback: just show both abbreviations
    return `${away}@${home}`;
  };

  // Get team from the first log if available
  const playerTeamAbbr = null; // We don't have it here, use game-level logic

  return (
    <div className="bg-sports-card border border-sports-secondary rounded-xl overflow-hidden shadow-lg">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-sports-dark text-sports-muted text-xs uppercase tracking-wider">
              <th className="p-4 font-semibold border-b border-sports-secondary">Date</th>
              <th className="p-4 font-semibold border-b border-sports-secondary">Opp</th>
              <th className="p-4 font-semibold border-b border-sports-secondary text-right">MIN</th>
              <th className="p-4 font-semibold border-b border-sports-secondary text-right text-white">PTS</th>
              <th className="p-4 font-semibold border-b border-sports-secondary text-right">REB</th>
              <th className="p-4 font-semibold border-b border-sports-secondary text-right">AST</th>
              <th className="p-4 font-semibold border-b border-sports-secondary text-right hidden sm:table-cell">STL</th>
              <th className="p-4 font-semibold border-b border-sports-secondary text-right hidden sm:table-cell">BLK</th>
              <th className="p-4 font-semibold border-b border-sports-secondary text-right hidden md:table-cell">3PM</th>
              <th className="p-4 font-semibold border-b border-sports-secondary text-right hidden md:table-cell">+/-</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sports-secondary/50">
            {/* Advanced Metrics Summary Row */}
            <tr className="bg-sports-accent/10 border-b-2 border-sports-accent/20">
              <td colSpan="3" className="p-4">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-sports-accent">Advanced Metrics</span>
                  <span className="text-xs text-sports-muted">Based on L20</span>
                </div>
              </td>
              <td colSpan="7" className="p-4 text-right">
                <div className="flex justify-end gap-6 text-xs text-sports-muted">
                  <div className="flex flex-col items-end">
                    <span className="uppercase font-bold tracking-wider">Median</span>
                    <span className="text-sports-text font-bold text-sm">{advanced.median}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="uppercase font-bold tracking-wider">Std Dev</span>
                    <span className="text-sports-text font-bold text-sm">±{advanced.stdDev}</span>
                  </div>
                  <div className="flex flex-col items-end hidden sm:flex">
                    <span className="uppercase font-bold tracking-wider">Consistency</span>
                    <span className="text-sports-text font-bold text-sm">{advanced.consistency?.score ?? '-'}/100</span>
                  </div>
                  <div className="flex flex-col items-end hidden md:flex">
                    <span className="uppercase font-bold tracking-wider">Trend</span>
                    <span className={`font-bold text-sm ${
                      parseFloat(advanced.trendSlope) > 0.5 ? 'text-sports-accent' :
                      parseFloat(advanced.trendSlope) < -0.5 ? 'text-sports-red' : 'text-sports-muted'
                    }`}>
                      {parseFloat(advanced.trendSlope) > 0.5 ? 'Hot' :
                       parseFloat(advanced.trendSlope) < -0.5 ? 'Cold' : 'Flat'}
                    </span>
                  </div>
                </div>
              </td>
            </tr>

            {/* L5 / L10 Average rows */}
            <tr className="bg-sports-secondary/30 hover:bg-sports-secondary/50 transition-colors">
              <td colSpan="3" className="p-4 text-sm font-bold text-sports-text">L5 Average</td>
              <td className="p-4 text-right font-bold text-sports-text">{category === 'pts'  ? averages.l5 : '-'}</td>
              <td className="p-4 text-right font-bold text-sports-text">{category === 'reb'  ? averages.l5 : '-'}</td>
              <td className="p-4 text-right font-bold text-sports-text">{category === 'ast'  ? averages.l5 : '-'}</td>
              <td className="p-4 text-right font-bold text-sports-text hidden sm:table-cell">{category === 'stl'  ? averages.l5 : '-'}</td>
              <td className="p-4 text-right font-bold text-sports-text hidden sm:table-cell">{category === 'blk'  ? averages.l5 : '-'}</td>
              <td className="p-4 text-right font-bold text-sports-text hidden md:table-cell">{category === 'fg3m' ? averages.l5 : '-'}</td>
              <td className="p-4 text-right font-bold text-sports-text hidden md:table-cell">-</td>
            </tr>
            <tr className="bg-sports-secondary/20 hover:bg-sports-secondary/40 transition-colors border-b-2 border-sports-secondary">
              <td colSpan="3" className="p-4 text-sm font-bold text-sports-muted">L10 Average</td>
              <td className="p-4 text-right font-bold text-sports-muted">{category === 'pts'  ? averages.l10 : '-'}</td>
              <td className="p-4 text-right font-bold text-sports-muted">{category === 'reb'  ? averages.l10 : '-'}</td>
              <td className="p-4 text-right font-bold text-sports-muted">{category === 'ast'  ? averages.l10 : '-'}</td>
              <td className="p-4 text-right font-bold text-sports-muted hidden sm:table-cell">{category === 'stl'  ? averages.l10 : '-'}</td>
              <td className="p-4 text-right font-bold text-sports-muted hidden sm:table-cell">{category === 'blk'  ? averages.l10 : '-'}</td>
              <td className="p-4 text-right font-bold text-sports-muted hidden md:table-cell">{category === 'fg3m' ? averages.l10 : '-'}</td>
              <td className="p-4 text-right font-bold text-sports-muted hidden md:table-cell">-</td>
            </tr>

            {/* Individual game log rows */}
            {stats.slice(0, 15).map((game) => {
              const home = game.game?.home_team?.abbreviation    || '';
              const away = game.game?.visitor_team?.abbreviation || '';
              // We can't determine home/away without player's team abbr here,
              // so just list both teams cleanly
              const oppDisplay = home && away ? `${away} @ ${home}` : home || away || 'UNK';

              const dnp = !game.min || game.min === '0' || game.min === '0:00' || game.min === '00:00';

              return (
                <tr key={game.id} className={`hover:bg-sports-secondary/30 transition-colors ${dnp ? 'opacity-40' : ''}`}>
                  <td className="p-4 text-sm text-sports-muted">
                    {game.game?.date
                      ? new Date(game.game.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : '-'}
                  </td>
                  <td className="p-4 text-sm font-medium">{dnp ? 'DNP' : oppDisplay}</td>
                  <td className="p-4 text-sm text-sports-muted text-right">{game.min || '-'}</td>
                  <td className={`p-4 text-sm font-bold text-right ${
                    category === 'pts' ? 'text-white' : 'text-sports-muted'
                  }`}>{dnp ? '-' : (game.pts ?? '-')}</td>
                  <td className={`p-4 text-sm text-right ${category === 'reb' ? 'text-white font-bold' : 'text-sports-muted'}`}>
                    {dnp ? '-' : (game.reb ?? '-')}
                  </td>
                  <td className={`p-4 text-sm text-right ${category === 'ast' ? 'text-white font-bold' : 'text-sports-muted'}`}>
                    {dnp ? '-' : (game.ast ?? '-')}
                  </td>
                  <td className={`p-4 text-sm text-right hidden sm:table-cell ${category === 'stl' ? 'text-white font-bold' : 'text-sports-muted'}`}>
                    {dnp ? '-' : (game.stl ?? '-')}
                  </td>
                  <td className={`p-4 text-sm text-right hidden sm:table-cell ${category === 'blk' ? 'text-white font-bold' : 'text-sports-muted'}`}>
                    {dnp ? '-' : (game.blk ?? '-')}
                  </td>
                  <td className={`p-4 text-sm text-right hidden md:table-cell ${category === 'fg3m' ? 'text-white font-bold' : 'text-sports-muted'}`}>
                    {dnp ? '-' : (game.fg3m ?? '-')}
                  </td>
                  <td className={`p-4 text-sm text-right hidden md:table-cell ${
                    (game.plus_minus || 0) > 0 ? 'text-sports-accent' :
                    (game.plus_minus || 0) < 0 ? 'text-sports-red'   : 'text-sports-muted'
                  }`}>
                    {dnp ? '-' : ((game.plus_minus || 0) > 0 ? `+${game.plus_minus}` : game.plus_minus ?? '-')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default StatsTable;
