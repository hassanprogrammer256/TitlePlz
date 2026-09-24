import React from 'react';
import { Film, Radio, Trophy, Users, Coins, Shield } from 'lucide-react';

interface SidebarProps {
  activeTab: 'inspector' | 'radar' | 'leaderboard' | 'scouts' | 'console';
  setActiveTab: (tab: 'inspector' | 'radar' | 'leaderboard' | 'scouts' | 'console') => void;
  onOpenDropModal: () => void;
  onOpenCreditsModal: () => void;
  onOpenScoutingModal: () => void;
  scoutCount: number;
  credits: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onOpenDropModal,
  onOpenCreditsModal,
  onOpenScoutingModal,
  scoutCount,
  credits,
}) => {
  return (
    <aside className="hidden md:flex w-56 shrink-0 bg-[#0b0f14] border-r border-cyan-900/40 p-3 flex-col justify-between text-xs font-mono select-none">
      <div className="space-y-4">
        {/* Navigation Section */}
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest px-2 mb-2 font-bold">
            Recon Deck
          </div>
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('inspector')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-left transition-colors ${
                activeTab === 'inspector'
                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/60 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              <Film className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Drop Inspector</span>
            </button>

            <button
              onClick={() => setActiveTab('radar')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-left transition-colors ${
                activeTab === 'radar'
                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/60 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              <Radio className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Active Radar</span>
            </button>

            <button
              onClick={() => setActiveTab('leaderboard')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-left transition-colors ${
                activeTab === 'leaderboard'
                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/60 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
              <span>31-Day Season</span>
            </button>

            <button
              onClick={onOpenScoutingModal}
              className="w-full flex items-center justify-between px-3 py-2 rounded text-left text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Scouts ({scoutCount}/5)</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('console')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-left transition-colors ${
                activeTab === 'console'
                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/60 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              <Shield className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Agent Console</span>
            </button>
          </nav>
        </div>

        {/* Quick Bank & Reload */}
        <div className="p-3 rounded bg-zinc-900/80 border border-amber-500/30">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-zinc-400 uppercase">Credits Bank</span>
            <span className="text-amber-400 font-bold text-sm">${credits}</span>
          </div>
          <button
            onClick={onOpenCreditsModal}
            className="w-full py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span>Refill / Reload</span>
          </button>
        </div>
      </div>

      {/* Primary Action Button */}
      <div className="pt-3 border-t border-zinc-800">
        <button
          onClick={onOpenDropModal}
          className="w-full py-2.5 rounded bg-cyan-600 hover:bg-cyan-500 text-black font-bold text-xs shadow-[0_0_12px_rgba(6,182,212,0.4)] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
        >
          <Radio className="w-4 h-4" />
          <span>+ Drop Mystery</span>
        </button>
      </div>
    </aside>
  );
};
