import React from 'react';
import { NavLink } from 'react-router-dom';
import { Activity, LayoutDashboard, UserSearch, Target, TrendingUp, Settings } from 'lucide-react';
import LiveTicker from './LiveTicker';

const Layout = ({ children }) => {
  const menuItems = [
    { name: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/' },
    { name: 'Player Props', icon: <Activity size={20} />, path: '/player' },
    { name: 'Team Trends', icon: <TrendingUp size={20} />, path: '/trends' },
    { name: 'Game Analysis', icon: <Target size={20} />, path: '/analysis' },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#13161b] text-white font-sans overflow-hidden">
      <LiveTicker />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-[#1a1f26] border-r border-[#262c36] flex flex-col hidden md:flex">
        <div className="p-6 pb-2">
          {/* Mockup doesn't show a huge PropEdge logo, it's very subtle. Let's keep it clean. */}
        </div>

        <nav className="flex-1 px-4 mt-4 space-y-1">
          {menuItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${isActive && item.path === '/' // Assume dashboard is active in mockup
                  ? 'bg-[#1a9a5c]/20 text-[#1a9a5c] font-semibold border border-[#1a9a5c]/10'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              {item.icon}
              <span className="font-medium text-sm">{item.name}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-[#262c36] space-y-2">
          <NavLink to="/settings" className="flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
            <Settings size={20} />
            <span className="font-medium text-sm">Settings</span>
          </NavLink>
          <div className="flex flex-col gap-2 px-4 py-3 text-[10px] text-gray-400">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#1a9a5c] shadow-[0_0_5px_rgba(26,154,92,0.8)]"></div>
              <span className="font-bold uppercase tracking-widest text-gray-300">Live Status</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden bg-sports-card border-b border-sports-secondary p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sports-accent">
            <Activity size={24} />
            <span className="text-lg font-bold text-white uppercase">PropEdge</span>
          </div>
          <button className="p-2 text-sports-muted rounded hover:bg-sports-secondary">
            <UserSearch size={24} />
          </button>
        </header>

        {/* Main scrollable area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
    </div>
  );
};

export default Layout;
