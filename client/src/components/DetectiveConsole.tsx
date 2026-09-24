import React from 'react';
import { User, SystemStatus } from '../types';
import {
  Shield,
  Coins,
  Trophy,
  Users,
  Target,
  Clock,
  Sparkles,
  Award,
  PlusCircle,
  Database,
  Zap,
  Radio,
} from 'lucide-react';

interface DetectiveConsoleProps {
  user: User | null;
  onOpenCreditsModal: () => void;
  onOpenScoutingModal: () => void;
  systemStatus?: SystemStatus | null;
}

export const DetectiveConsole: React.FC<DetectiveConsoleProps> = ({
  user,
  onOpenCreditsModal,
  onOpenScoutingModal,
  systemStatus,
}) => {
  if (!user) return null;

  return (
    <div className="bg-[#0e131b] border border-cyan-900/60 rounded-lg p-4 font-mono text-xs shadow-lg space-y-3">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-3">
          <img
            src={user.avatar}
            alt={user.handle}
            className="w-10 h-10 rounded-full object-cover border border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
          />
          <div>
            <div className="font-bold text-sm text-cyan-300 flex items-center gap-2">
              <span>{user.handle}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                {user.agentHash}
              </span>
            </div>
            <div className="text-[11px] text-zinc-500">{user.roleTitle}</div>
          </div>
        </div>

        {/* Credits Pill */}
        <div className="text-right">
          <div className="text-[10px] text-zinc-500">Credits Available</div>
          <div className="text-base font-bold text-amber-300 flex items-center gap-1 justify-end">
            <Coins className="w-4 h-4 text-amber-400" />
            <span>${user.credits}</span>
            <button
              onClick={onOpenCreditsModal}
              className="ml-1 p-0.5 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
              title="Reload or claim daily refill"
            >
              <PlusCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Live Recon Infrastructure Mesh */}
      <div className="p-2.5 rounded bg-zinc-950/80 border border-cyan-950/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-zinc-400 font-medium">Real-Time Mesh:</span>
          <span className="text-emerald-300 flex items-center gap-1">
            <Radio className="w-3 h-3" />
            Recon Uplink ({systemStatus?.sockets?.activeSockets || 1} live connection)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 font-medium">Datastore:</span>
          <span className="text-amber-300 flex items-center gap-1">
            <Database className="w-3 h-3" />
            Central Archive ({systemStatus?.mongodb?.status === 'connected' ? 'Archive Connected' : 'Records Synced'})
          </span>
        </div>
      </div>

      {/* Detective Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="p-2.5 rounded bg-zinc-900/80 border border-zinc-800">
          <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1">
            <Trophy className="w-3 h-3 text-amber-400" />
            <span>Leaderboard Score</span>
          </div>
          <div className="text-sm font-bold text-white">{user.points} pts</div>
          <div className="text-[9px] text-zinc-400 mt-0.5">
            Rank #{user.rank || 3} •{' '}
            <span
              className={
                user.tierStanding === 'promoted'
                  ? 'text-emerald-400'
                  : user.tierStanding === 'demoted'
                  ? 'text-red-400'
                  : 'text-cyan-400'
              }
            >
              {user.tierStanding ? user.tierStanding.toUpperCase() : 'SAFE'}
            </span>
          </div>
        </div>

        <div className="p-2.5 rounded bg-zinc-900/80 border border-zinc-800">
          <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1">
            <Target className="w-3 h-3 text-cyan-400" />
            <span>Accuracy Rating</span>
          </div>
          <div className="text-sm font-bold text-cyan-300">{user.accuracyRating}%</div>
          <div className="text-[9px] text-zinc-400 mt-0.5">
            {user.weeklyIdentifications} Solved This Cycle
          </div>
        </div>

        <div className="p-2.5 rounded bg-zinc-900/80 border border-zinc-800">
          <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1">
            <Users className="w-3 h-3 text-cyan-400" />
            <span>Scout Network</span>
          </div>
          <div className="text-sm font-bold text-white">
            {user.following ? user.following.length : 0} / 5
          </div>
          <button
            onClick={onOpenScoutingModal}
            className="text-[9px] text-cyan-400 hover:underline mt-0.5"
          >
            Manage Scouts &rarr;
          </button>
        </div>

        <div className="p-2.5 rounded bg-zinc-900/80 border border-zinc-800">
          <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>24h Credit Rations</span>
          </div>
          <div className="text-xs font-bold text-emerald-400">+$20 Daily</div>
          <button
            onClick={onOpenCreditsModal}
            className="text-[9px] text-amber-300 hover:underline mt-0.5"
          >
            Check Cooldown &rarr;
          </button>
        </div>
      </div>
    </div>
  );
};
