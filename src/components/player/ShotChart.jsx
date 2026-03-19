import React, { memo } from 'react';
import { Target, Info } from 'lucide-react';

/**
 * Full SVG NBA court with proper geometry + color-coded zone heatmap.
 * LOC_X range: -250 to 250 (width 500 = 50 feet)
 * LOC_Y range: -47.5 to 422.5 (height = ~47 feet display up to 3pt range)
 */

const COURT_W = 500;   // source units
const COURT_H = 470;   // source units (clipping at 3pt line area)
const SVG_W   = 380;
const SVG_H   = 335;

const sx = (x) => ((x + 250) / COURT_W) * SVG_W;
const sy = (y) => SVG_H - ((y + 47.5) / COURT_H) * SVG_H;

// Color by make rate
const heatColor = (pct) => {
  if (pct >= 55) return '#1df16a';   // hot — green
  if (pct >= 45) return '#facc15';   // warm — yellow
  if (pct >= 35) return '#f97316';   // cool — orange
  return '#ef4444';                  // cold — red
};

const CourtSVG = () => (
  <svg
    viewBox={`0 0 ${SVG_W} ${SVG_H}`}
    width={SVG_W}
    height={SVG_H}
    className="rounded-xl overflow-hidden bg-[#0d1117] border border-white/5"
  >
    {/* Floor */}
    <rect x={0} y={0} width={SVG_W} height={SVG_H} fill="#0d1117" />

    {/* Paint / key */}
    <rect
      x={sx(-80)} y={sy(142.5)}
      width={sx(80) - sx(-80)} height={sy(-47.5) - sy(142.5)}
      fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1.2}
    />
    {/* Free throw circle */}
    <ellipse
      cx={sx(0)} cy={sy(142.5)}
      rx={(sx(60) - sx(-60))} ry={(sy(80) - sy(142.5)) * -1}
      fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1.2}
    />
    {/* Rim */}
    <circle cx={sx(0)} cy={sy(0)} r={4} fill="none" stroke="rgba(255,100,50,0.6)" strokeWidth={1.5} />
    {/* Backboard */}
    <line x1={sx(-30)} y1={sy(-7.5)} x2={sx(30)} y2={sy(-7.5)} stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} />

    {/* Three-point arc */}
    <path
      d={`M ${sx(-220)} ${sy(-47.5)} L ${sx(-220)} ${sy(92.5)} A ${sx(237.5) - sx(0)} ${sy(0) - sy(237.5)} 0 0 1 ${sx(220)} ${sy(92.5)} L ${sx(220)} ${sy(-47.5)}`}
      fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={1.2}
    />

    {/* Half-court line */}
    <line x1={0} y1={sy(COURT_H - 47.5)} x2={SVG_W} y2={sy(COURT_H - 47.5)} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
  </svg>
);

const ShotChart = memo(({ data }) => {
  if (!data || !data.shots || data.shots.length === 0) {
    return (
      <div className="bg-sports-card border border-sports-secondary rounded-2xl p-8 text-center">
        <Target className="mx-auto text-sports-muted mb-4 opacity-20" size={48} />
        <p className="text-sports-muted text-sm">No shot data available for this season.</p>
      </div>
    );
  }

  const { shots, summary, season } = data;

  return (
    <div className="bg-sports-card border border-sports-secondary rounded-2xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="text-sports-accent" size={20} />
          <h2 className="text-lg font-bold text-white uppercase tracking-tight">Shot Zone Analytics</h2>
          {season && <span className="text-[10px] text-sports-muted font-bold bg-sports-dark border border-sports-secondary rounded px-2 py-0.5">{season}</span>}
        </div>
        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-sports-muted">
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>Hot ≥55%</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-yellow-400"></div>Avg</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500"></div>Cold</div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-8 items-start">
        {/* Court View */}
        <div className="relative shrink-0">
          <CourtSVG />
          {/* Shot dots rendered on top via absolute overlay */}
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            width={SVG_W}
            height={SVG_H}
            className="absolute inset-0"
            style={{ pointerEvents: 'none' }}
          >
            {shots.slice(0, 400).map((shot, idx) => {
              const x = sx(shot.LOC_X ?? 0);
              const y = sy(shot.LOC_Y ?? 0);
              if (x < 0 || x > SVG_W || y < 0 || y > SVG_H) return null;
              return (
                <circle
                  key={idx}
                  cx={x} cy={y} r={2.2}
                  fill={shot.SHOT_MADE_FLAG ? 'rgba(29,241,106,0.7)' : 'rgba(239,68,68,0.4)'}
                />
              );
            })}
          </svg>
        </div>

        {/* Zone Stats */}
        <div className="flex-1 w-full space-y-3">
          <p className="text-[10px] font-black text-sports-muted uppercase tracking-widest mb-2">Zone Breakdown</p>
          {(summary || []).map((zone, idx) => {
            const pct  = Number(zone.pct || 0);
            const color = heatColor(pct);
            return (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-sports-muted">
                  <span>{zone.zone}</span>
                  <span className="font-black" style={{ color }}>{Math.round(pct)}% ({zone.made}/{zone.attempts})</span>
                </div>
                <div className="h-1.5 w-full bg-sports-dark rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(pct, 100)}%`, background: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pt-4 border-t border-sports-secondary/50 flex items-start gap-3">
        <Info className="text-sports-accent mt-0.5 shrink-0" size={14} />
        <p className="text-[10px] text-sports-muted leading-relaxed">
          Hot Spots (≥55%) indicate elite efficiency zones. Green dots = made, red = missed. Max 400 shots displayed.
        </p>
      </div>
    </div>
  );
});

export default ShotChart;
