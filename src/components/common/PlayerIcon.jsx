import React, { useState } from 'react';
import { User } from 'lucide-react';

const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.split(' ').filter(p => p.length > 0);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const TEAM_COLORS = {
  ATL: "bg-[#e03a3e] text-white", BOS: "bg-[#007a33] text-white", BKN: "bg-[#000000] text-white",
  CHA: "bg-[#1d1160] text-white", CHI: "bg-[#ce1141] text-white", CLE: "bg-[#860038] text-white",
  DAL: "bg-[#00538c] text-white", DEN: "bg-[#0e2240] text-white", DET: "bg-[#c8102e] text-white",
  GSW: "bg-[#1d428a] text-white", HOU: "bg-[#ce1141] text-white", IND: "bg-[#002d62] text-white",
  LAC: "bg-[#c8102e] text-white", LAL: "bg-[#552583] text-white", MEM: "bg-[#5d76a9] text-white",
  MIA: "bg-[#98002e] text-white", MIL: "bg-[#00471b] text-white", MIN: "bg-[#0c2340] text-white",
  NOP: "bg-[#0c2340] text-white", NYK: "bg-[#006bb6] text-white", OKC: "bg-[#007ac1] text-white",
  ORL: "bg-[#0077c0] text-white", PHI: "bg-[#006bb6] text-white", PHX: "bg-[#1d1160] text-white",
  POR: "bg-[#e03a3e] text-white", SAC: "bg-[#5a2d81] text-white", SAS: "bg-[#c4ced4] text-black",
  TOR: "bg-[#ce1141] text-white", UTA: "bg-[#002b5c] text-white", WAS: "bg-[#002b5c] text-white"
};

const getColorClass = (name, teamAbbr) => {
  if (teamAbbr && TEAM_COLORS[teamAbbr.toUpperCase()]) {
    return TEAM_COLORS[teamAbbr.toUpperCase()];
  }
  if (!name) return 'bg-sports-secondary text-sports-muted';
  const colors = ['bg-blue-500 text-white', 'bg-green-500 text-white', 'bg-purple-500 text-white', 'bg-amber-500 text-white', 'bg-red-500 text-white', 'bg-teal-500 text-white'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const PlayerIcon = ({ playerId, name, teamAbbr, className = "" }) => {
  const [error, setError] = useState(false);
  
  const hasSize = /\bw-\d+/.test(className) && /\bh-\d+/.test(className);
  const sizeClass = hasSize ? '' : 'w-10 h-10';
  
  if (!playerId || error) {
    if (name) {
      return (
        <div className={`rounded-full flex items-center justify-center shrink-0 uppercase shadow-sm ${getColorClass(name, teamAbbr)} ${sizeClass} ${className}`} style={{ fontSize: '0.65em' }}>
          {getInitials(name)}
        </div>
      );
    }
    return (
      <div className={`rounded-full bg-sports-secondary/50 border border-sports-secondary flex items-center justify-center shrink-0 ${sizeClass} ${className}`}>
        <User size={hasSize ? "60%" : 18} className="text-sports-muted" />
      </div>
    );
  }

  return (
    <img 
      src={`https://ak-static.cms.nba.com/wp-content/uploads/headshots/nba/latest/260x190/${playerId}.png`} 
      alt={name}
      onError={() => setError(true)}
      className={`rounded-full object-cover bg-sports-card border border-sports-secondary group-hover:border-sports-accent/60 transition-all shrink-0 shadow-sm ${sizeClass} ${className}`}
    />
  );
};

export default PlayerIcon;
