import React, { useState, useEffect, useRef } from 'react';
import { MovieKingLeader, SeasonInfo, User } from '../types';
import {
  Trophy,
  Crown,
  ChevronUp,
  ChevronDown,
  Clock,
  Sparkles,
  ShieldAlert,
  UserPlus,
  UserCheck,
  RefreshCw,
  Award,
  Locate,
} from 'lucide-react';

import { canAdministerSeason } from '../config';
interface MovieKingLeaderboardProps {
  leaders: MovieKingLeader[];
  season: SeasonInfo | null;
  currentUser: User | null;
  onOpenGlobalModal: () => void;
  onFollowUser: (handle: string) => Promise<void>;
  onUnfollowUser: (handle: string) => Promise<void>;
  onAdminResetSeason?: () => Promise<void>;
}

export const MovieKingLeaderboard: React.FC<MovieKingLeaderboardProps> = ({
  leaders,
  season,
  currentUser,
  onOpenGlobalModal,
  onFollowUser,
  onUnfollowUser,
  onAdminResetSeason,
}) => {
  const [seasonTimer, setSeasonTimer] = useState<string>('');
  const [resetError, setResetError] = useState<string | null>(null);

  const handleAdminReset = async () => {
    if (!onAdminResetSeason) return;
    try {
      setResetError(null);
      await onAdminResetSeason();
    } catch (err: any) {
      setResetError(err?.message || 'Could not start a new season.');
    }
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const myRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!season) return;

    const updateTimer = () => {
      const now = Date.now();
      const diff = season.endsAt - now;

      if (diff <= 0) {
        setSeasonTimer('Season Ended • Awaiting Resolution');
      } else {
        const days = Math.floor(diff / (24 * 3600 * 1000));
        const hours = Math.floor((diff % (24 * 3600 * 1000)) / (3600 * 1000));
        const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
        const secs = Math.floor((diff % (60 * 1000)) / 1000);
        setSeasonTimer(`${days}d ${hours}h ${mins}m ${secs}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [season?.endsAt]);

  const top10 = leaders.slice(0, 10);
  const bottom10 = leaders.slice(-10);

  const visibleLeaders = leaders.slice(0, 15);
  const myLeaderEntry = currentUser
    ? leaders.find(l => l.handle.toLowerCase() === currentUser.handle.toLowerCase())
    : undefined;
  const isMyEntryHidden = !!myLeaderEntry && !visibleLeaders.includes(myLeaderEntry);

  const scrollToMyRank = () => {
    myRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="bg-[#0e131b] border border-cyan-900/60 rounded-lg p-4 font-mono text-xs shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-sm text-amber-300">MovieKing Leaderboards</span>
        </div>
        <div className="flex items-center gap-2.5">
          {currentUser && myLeaderEntry && (
            <button
              onClick={scrollToMyRank}
              title="Jump to my rank"
              className="flex items-center gap-1 text-amber-300 hover:text-amber-200 text-[11px] font-bold"
            >
              <Locate className="w-3 h-3" />
              <span>My Rank (#{myLeaderEntry.rank})</span>
            </button>
          )}
          <button
            onClick={onOpenGlobalModal}
            className="text-cyan-400 hover:text-cyan-300 text-[11px] underline font-bold"
          >
            View Full Roster ({leaders.length}) &rarr;
          </button>
        </div>
      </div>

      {/* 31-Day Season Countdown Banner */}
      <div className="p-2.5 rounded bg-zinc-900/90 border border-amber-500/40 mb-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-zinc-300 font-bold text-xs">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>{season?.name || '31-Day Recon Championship'}</span>
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">
            Top 10 Promoted ⬆ • Bottom 10 Demoted ⬇ (Cycle: 31 Days)
          </div>
        </div>
        <div className="text-right">
          <div className="text-amber-400 font-bold text-xs">{seasonTimer}</div>
          <div className="text-[9px] text-zinc-500">Duration Remaining</div>
        </div>
      </div>

      {/* Scoring rule indicator pill */}
      <div className="grid grid-cols-2 gap-2 mb-3 text-[10px]">
        <div className="p-1.5 rounded bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 flex items-center gap-1.5">
          <span className="font-bold text-xs">+5 PTS</span>
          <span>Correct Movie & Bounty</span>
        </div>
        <div className="p-1.5 rounded bg-red-950/40 border border-red-500/40 text-red-300 flex items-center gap-1.5">
          <span className="font-bold text-xs">-3 PTS</span>
          <span>Wrong Trial Guess</span>
        </div>
      </div>

      {/* Leaderboard entries */}
      <div ref={scrollRef} className="space-y-1.5 max-h-95 overflow-y-auto pr-1">
        {visibleLeaders.map(leader => {
          const isCurrentUser =
            currentUser && leader.handle.toLowerCase() === currentUser.handle.toLowerCase();
          const isScouted = currentUser?.following?.includes(leader.handle);

          return (
            <div
              key={leader.rank}
              ref={isCurrentUser ? myRowRef : undefined}
              className={`p-2 rounded border flex items-center justify-between transition-all ${
                isCurrentUser
                  ? 'bg-cyan-950/40 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                  : leader.tier === 'promoted'
                  ? 'bg-zinc-900/60 border-zinc-800 hover:border-amber-500/40'
                  : leader.tier === 'demoted'
                  ? 'bg-red-950/10 border-red-900/30'
                  : 'bg-zinc-900/40 border-zinc-800/80'
              }`}
            >
              {/* Rank & User details */}
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-6 text-center font-bold text-xs ${
                    leader.rank === 1
                      ? 'text-amber-400 text-sm'
                      : leader.rank === 2
                      ? 'text-slate-300 text-sm'
                      : leader.rank === 3
                      ? 'text-amber-600 text-sm'
                      : leader.tier === 'promoted'
                      ? 'text-emerald-400'
                      : leader.tier === 'demoted'
                      ? 'text-red-400'
                      : 'text-zinc-500'
                  }`}
                >
                  {leader.crownEmoji || `#${leader.rank}`}
                </span>

                <div>
                  <div className="flex items-center gap-1.5 font-bold text-zinc-200">
                    <span>{leader.handle}</span>
                    {isCurrentUser && (
                      <span className="px-1 py-0.2 rounded bg-cyan-950 text-cyan-300 text-[9px] border border-cyan-500">
                        YOU
                      </span>
                    )}
                    {leader.tier === 'promoted' && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-600/50">
                        PROMOTING
                      </span>
                    )}
                    {leader.tier === 'demoted' && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-red-950 text-red-400 border border-red-800/50">
                        DEMOTING
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-500">{leader.title}</div>
                </div>
              </div>

              {/* Points & Scout Action */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="font-bold text-amber-300 text-xs">
                    {leader.points} pts
                  </div>
                  <div className="text-[9px] text-zinc-500">
                    {leader.solvedCount} solved
                  </div>
                </div>

                {!isCurrentUser && (
                  <button
                    onClick={() =>
                      (isScouted ? onUnfollowUser(leader.handle) : onFollowUser(leader.handle)).catch(() => {})
                    }
                    className={`p-1 rounded text-[10px] font-mono border transition-colors ${
                      isScouted
                        ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border-zinc-700'
                    }`}
                    title={isScouted ? 'Scouting (Followed)' : 'Scout Detective'}
                  >
                    {isScouted ? <UserCheck className="w-3 h-3 text-cyan-400" /> : <UserPlus className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {isMyEntryHidden && myLeaderEntry && (
          <>
            <div className="text-center text-zinc-700 text-[10px]">&bull; &bull; &bull;</div>
            <div
              ref={myRowRef}
              className="p-2 rounded border flex items-center justify-between bg-cyan-950/40 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-6 text-center font-bold text-xs text-zinc-500">
                  #{myLeaderEntry.rank}
                </span>
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-zinc-200">
                    <span>{myLeaderEntry.handle}</span>
                    <span className="px-1 py-0.2 rounded bg-cyan-950 text-cyan-300 text-[9px] border border-cyan-500">
                      YOU
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500">{myLeaderEntry.title}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-amber-300 text-xs">{myLeaderEntry.points} pts</div>
                <div className="text-[9px] text-zinc-500">{myLeaderEntry.solvedCount} solved</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Admin season reset action if role is curator */}
      {canAdministerSeason(currentUser) && onAdminResetSeason && (
        <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center justify-between">
          <span className="text-[10px] text-zinc-500 font-mono">Curator / Admin Controls:</span>
          <button
            onClick={handleAdminReset}
            className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] flex items-center gap-1 font-mono transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Resolve & Reset 31-Day Season</span>
          </button>
        </div>
      )}
      {resetError && <div role="alert" className="mt-2 text-[10px] text-red-400">{resetError}</div>}
    </div>
  );
};
