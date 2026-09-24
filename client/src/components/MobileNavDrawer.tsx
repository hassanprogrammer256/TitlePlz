import React, { useEffect } from 'react';
import { Film, Radio, Trophy, Users, Coins, Shield, X } from 'lucide-react';

type Tab = 'inspector' | 'radar' | 'leaderboard' | 'scouts' | 'console';

interface MobileNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  onOpenDropModal: () => void;
  onOpenCreditsModal: () => void;
  onOpenScoutingModal: () => void;
  scoutCount: number;
  credits: number;
}

export const MobileNavDrawer: React.FC<MobileNavDrawerProps> = ({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  onOpenDropModal,
  onOpenCreditsModal,
  onOpenScoutingModal,
  scoutCount,
  credits,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const goTo = (tab: Tab) => {
    setActiveTab(tab);
    onClose();
  };

  return (
    <div
      className={`md:hidden fixed inset-0 z-50 transition-opacity duration-200 ${
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      aria-hidden={!isOpen}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer panel */}
      <div
        className={`absolute top-0 left-0 bottom-0 w-72 max-w-[85vw] bg-[#0b0f14] border-r border-cyan-900/60 shadow-2xl flex flex-col text-xs font-mono transition-transform duration-200 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Recon Deck</span>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          <nav className="space-y-1">
            <button
              onClick={() => goTo('inspector')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded text-left transition-colors ${
                activeTab === 'inspector'
                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/60 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              <Film className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Drop Inspector</span>
            </button>

            <button
              onClick={() => goTo('radar')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded text-left transition-colors ${
                activeTab === 'radar'
                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/60 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              <Radio className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Active Radar</span>
            </button>

            <button
              onClick={() => goTo('leaderboard')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded text-left transition-colors ${
                activeTab === 'leaderboard'
                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/60 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
              <span>31-Day Season</span>
            </button>

            <button
              onClick={() => {
                onOpenScoutingModal();
                onClose();
              }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded text-left text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Scouts ({scoutCount}/5)</span>
              </div>
            </button>

            <button
              onClick={() => goTo('console')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded text-left transition-colors ${
                activeTab === 'console'
                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/60 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              <Shield className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Agent Console</span>
            </button>
          </nav>

          {/* Quick Bank & Reload */}
          <div className="p-3 rounded bg-zinc-900/80 border border-amber-500/30">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-zinc-400 uppercase">Credits Bank</span>
              <span className="text-amber-400 font-bold text-sm">${credits}</span>
            </div>
            <button
              onClick={() => {
                onOpenCreditsModal();
                onClose();
              }}
              className="w-full py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>Refill / Reload</span>
            </button>
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="p-3 border-t border-zinc-800">
          <button
            onClick={() => {
              onOpenDropModal();
              onClose();
            }}
            className="w-full py-2.5 rounded bg-cyan-600 hover:bg-cyan-500 text-black font-bold text-xs shadow-[0_0_12px_rgba(6,182,212,0.4)] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <Radio className="w-4 h-4" />
            <span>+ Drop Mystery</span>
          </button>
        </div>
      </div>
    </div>
  );
};
