import React, { useState, useEffect, useRef } from 'react';
import { MovieKingLeader, SeasonInfo, User } from '../types';
import {
  Trophy,
  Crown,
  Clock,
  Sparkles,
  ChevronUp,
  ChevronDown,
  ShieldCheck,
  AlertTriangle,
  X,
  RefreshCw,
  UserPlus,
  UserCheck,
  Search,
  Locate,
} from 'lucide-react';

interface GlobalLeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  leaders: MovieKingLeader[];
  season: SeasonInfo | null;
  currentUser: User | null;
  onFollowUser: (handle: string) => Promise<void>;
  onUnfollowUser: (handle: string) => Promise<void>;
  onAdminResetSeason?: () => Promise<void>;
}

export const GlobalLeaderboardModal: React.FC<GlobalLeaderboardModalProps> = ({
  isOpen,
  onClose,
  leaders,
  season,
  currentUser,
  onFollowUser,
  onUnfollowUser,
  onAdminResetSeason,
}) => {
  const [seasonTimer, setSeasonTimer] = useState<string>('');
  const [filterTier, setFilterTier] = useState<'all' | 'promoted' | 'safe' | 'demoted'>('all');
  const [isResetting, setIsResetting] = useState(false);
  const [query, setQuery] = useState('');
  const myRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!season) return;

    const updateTimer = () => {
      const now = Date.now();
      const diff = season.endsAt - now;

      if (diff <= 0) {
        setSeasonTimer('Season Concluded • Resolving Tier Movements');
      } else {
        const days = Math.floor(diff / (24 * 3600 * 1000));
        const hours = Math.floor((diff % (24 * 3600 * 1000)) / (3600 * 1000));
        const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
        const secs = Math.floor((diff % (60 * 1000)) / 1000);
        setSeasonTimer(`${days}d ${hours}h ${mins}m ${secs}s remaining`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [season?.endsAt]);

  if (!isOpen) return null;

  const normalizedQuery = query.trim().toLowerCase();

  const filteredLeaders = leaders.filter(l => {
    if (filterTier === 'promoted' && l.tier !== 'promoted') return false;
    if (filterTier === 'safe' && l.tier !== 'safe') return false;
    if (filterTier === 'demoted' && l.tier !== 'demoted') return false;
    if (normalizedQuery && !l.handle.toLowerCase().includes(normalizedQuery)) return false;
    return true;
  });

  const myLeaderEntry = currentUser
    ? leaders.find(l => l.handle.toLowerCase() === currentUser.handle.toLowerCase())
    : undefined;

  const scrollToMyRank = () => {
    setQuery('');
    setFilterTier('all');
    requestAnimationFrame(() => myRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const handleAdminReset = async () => {
    if (!onAdminResetSeason) return;
    try {
      setIsResetting(true);
      await onAdminResetSeason();
    } catch (err) {
      console.error(err);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0e131b] border border-cyan-800/80 rounded-lg max-w-3xl w-full p-6 text-zinc-200 shadow-2xl relative max-h-[90vh] flex flex-col font-mono text-xs">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-4 border-b border-zinc-800 pb-3">
          <div className="w-10 h-10 rounded bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
              <span>{season?.name || 'MovieKing Leaderboards'}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-amber-950 border border-amber-500/60 text-amber-300 font-bold">
                31-DAY CYCLE
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              Season Cycle: Exactly 31 days from initiation. Top 10 promoted ⬆ • Bottom 10 demoted ⬇.
            </p>
          </div>
        </div>

        {/* Season Banner & Rules */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
          <div className="p-3 rounded bg-zinc-900 border border-zinc-700 flex flex-col justify-between">
            <div className="text-[10px] text-zinc-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Championship Clock</span>
            </div>
            <div className="text-sm font-bold text-amber-300 mt-1">{seasonTimer}</div>
            <div className="text-[9px] text-zinc-500">Counts down 31 days per season</div>
          </div>

          <div className="p-3 rounded bg-emerald-950/30 border border-emerald-500/50 flex flex-col justify-between">
            <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Promotion Zone (Top 10)</span>
            </div>
            <div className="text-sm font-bold text-white mt-1">10 Detectives</div>
            <div className="text-[9px] text-emerald-300/80">Promoted to Crown Tier at cycle end</div>
          </div>

          <div className="p-3 rounded bg-red-950/30 border border-red-500/50 flex flex-col justify-between">
            <div className="text-[10px] text-red-400 font-bold flex items-center gap-1">
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Demotion Zone (Last 10)</span>
            </div>
            <div className="text-sm font-bold text-white mt-1">10 Detectives</div>
            <div className="text-[9px] text-red-300/80">Demoted to Novice Tier at cycle end</div>
          </div>
        </div>

        {/* Search & jump-to-me */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-zinc-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search detective handle..."
              className="w-full pl-8 pr-3 py-1.5 rounded bg-black/60 border border-zinc-800 text-zinc-300 placeholder:text-zinc-600 text-xs focus:outline-none focus:border-cyan-500"
            />
          </div>
          {currentUser && myLeaderEntry && (
            <button
              onClick={scrollToMyRank}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded bg-cyan-950/60 border border-cyan-700/60 text-cyan-300 hover:border-cyan-500 text-xs font-bold transition-colors"
            >
              <Locate className="w-3.5 h-3.5" />
              <span>My Rank (#{myLeaderEntry.rank})</span>
            </button>
          )}
        </div>

        {/* Tier filter tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2 mb-3">
          <div className="flex flex-wrap gap-2">
            {(['all', 'promoted', 'safe', 'demoted'] as const).map(t => (
              <button
                key={t}
                onClick={() => setFilterTier(t)}
                className={`px-3 py-1 rounded capitalize font-bold transition-colors ${
                  filterTier === t
                    ? 'bg-cyan-950 border border-cyan-500 text-cyan-300'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {t === 'all' ? `All (${leaders.length})` : t}
              </button>
            ))}
          </div>

          <div className="hidden sm:flex text-[11px] text-zinc-400 items-center gap-2">
            <span className="text-emerald-400 font-bold">+5 pts</span>
            <span>correct movie</span>
            <span>•</span>
            <span className="text-red-400 font-bold">-3 pts</span>
            <span>wrong movie</span>
          </div>
        </div>

        {/* Leaderboard Table */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {filteredLeaders.length === 0 && (
            <div className="text-center text-zinc-600 text-xs py-8">
              No detectives match "{query}".
            </div>
          )}
          {filteredLeaders.map(leader => {
            const isCurrentUser =
              currentUser && leader.handle.toLowerCase() === currentUser.handle.toLowerCase();
            const isScouted = currentUser?.following?.includes(leader.handle);

            return (
              <div
                key={leader.rank}
                ref={isCurrentUser ? myRowRef : undefined}
                className={`p-2.5 rounded border flex items-center justify-between transition-all ${
                  isCurrentUser
                    ? 'bg-cyan-950/60 border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                    : leader.tier === 'promoted'
                    ? 'bg-zinc-900/80 border-emerald-500/40 hover:border-emerald-500'
                    : leader.tier === 'demoted'
                    ? 'bg-zinc-900/60 border-red-500/40 hover:border-red-500'
                    : 'bg-zinc-900/40 border-zinc-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-8 text-center font-bold text-sm ${
                      leader.rank === 1
                        ? 'text-amber-400'
                        : leader.rank === 2
                        ? 'text-slate-300'
                        : leader.rank === 3
                        ? 'text-amber-600'
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
                    <div className="flex items-center gap-2 font-bold text-zinc-100">
                      <span>{leader.handle}</span>
                      {isCurrentUser && (
                        <span className="px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-500 text-[10px]">
                          YOU
                        </span>
                      )}
                      {leader.tier === 'promoted' && (
                        <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-500 text-[10px] font-bold">
                          PROMOTING ⬆
                        </span>
                      )}
                      {leader.tier === 'demoted' && (
                        <span className="px-1.5 py-0.2 rounded bg-red-950 text-red-300 border border-red-500 text-[10px] font-bold">
                          DEMOTING ⬇
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-400">{leader.title}</div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-bold text-sm text-amber-300 font-mono">
                      {leader.points} pts
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      {leader.solvedCount} Solved • ${leader.bountyEarnedTotal} Won
                    </div>
                  </div>

                  {!isCurrentUser && (
                    <button
                      onClick={() =>
                        isScouted ? onUnfollowUser(leader.handle) : onFollowUser(leader.handle)
                      }
                      className={`px-2.5 py-1 rounded text-xs font-mono border flex items-center gap-1 transition-colors ${
                        isScouted
                          ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                      }`}
                    >
                      {isScouted ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                      <span>{isScouted ? 'Scouted' : 'Scout'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Curator Admin Reset */}
        {currentUser?.role === 'curator' && onAdminResetSeason && (
          <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center justify-between">
            <span className="text-[10px] text-zinc-400">
              Curator Command: Manually resolve 31-day season and rotate tiers.
            </span>
            <button
              onClick={handleAdminReset}
              disabled={isResetting}
              className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
              <span>{isResetting ? 'Resolving Season...' : 'Initiate New 31-Day Season'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
