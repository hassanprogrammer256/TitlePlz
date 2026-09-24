import React from 'react';
import { Coins, Flame, ShieldAlert, Sparkles } from 'lucide-react';

interface StumpHivemindCardProps {
  onOpenDropModal: () => void;
}

export const StumpHivemindCard: React.FC<StumpHivemindCardProps> = ({ onOpenDropModal }) => {
  return (
    <div className="bg-linear-to-r from-amber-950/40 via-zinc-900/60 to-cyan-950/40 border border-amber-500/40 rounded-lg p-4 font-mono text-xs shadow-lg relative overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:items-center">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-amber-500/20 border border-amber-500/60 text-amber-400">
            <Flame className="w-5 h-5 animate-bounce" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-bold text-sm text-amber-300">
              <span className="min-w-0">Stump The Hivemind // High-Bounty Protocol</span>
              <span className="shrink-0 rounded bg-amber-500 px-1.5 py-0.2 text-[10px] text-black font-bold">
                1 TRIAL ONLY
              </span>
            </div>
            <p className="mt-0.5 wrap-break-word text-zinc-400 text-[11px]">
              Got an obscure 35mm frame or clip under 10 minutes? Stake your bounty. If uncracked within the validity window (1-7 days), you keep your stake!
            </p>
          </div>
        </div>

        <button
          onClick={onOpenDropModal}
          className="w-full shrink-0 rounded bg-amber-500 px-4 py-2 text-black font-bold text-xs shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all cursor-pointer whitespace-nowrap hover:bg-amber-400 sm:w-auto"
        >
          Stake Reel &rarr;
        </button>
      </div>
    </div>
  );
};
