import React, { useState } from 'react';
import { User, ScoutActivityNotification } from '../types';
import {
  Users,
  UserPlus,
  UserMinus,
  Bell,
  Film,
  Award,
  Radio,
  CheckCircle2,
  AlertTriangle,
  X,
  Clock,
  Sparkles,
  Search,
} from 'lucide-react';

interface ScoutingHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  allUsers: User[];
  activities: ScoutActivityNotification[];
  onFollowUser: (handle: string) => Promise<void>;
  onUnfollowUser: (handle: string) => Promise<void>;
  onSelectDrop?: (dropId: string) => void;
}

export const ScoutingHubModal: React.FC<ScoutingHubModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  allUsers,
  activities,
  onFollowUser,
  onUnfollowUser,
  onSelectDrop,
}) => {
  const [activeTab, setActiveTab] = useState<'network' | 'alerts'>('alerts');
  const [loadingHandle, setLoadingHandle] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  if (!isOpen || !currentUser) return null;

  const followingList = currentUser.following || [];
  const normalizedQuery = query.trim().toLowerCase();
  const matchesQuery = (u: User) => !normalizedQuery || u.handle.toLowerCase().includes(normalizedQuery);

  const scoutedUsers = allUsers.filter(u => followingList.includes(u.handle)).filter(matchesQuery);
  const availableUsers = allUsers
    .filter(u => u.handle.toLowerCase() !== currentUser.handle.toLowerCase() && !followingList.includes(u.handle))
    .filter(matchesQuery);

  const handleFollow = async (handle: string) => {
    try {
      setLoadingHandle(handle);
      setStatusMessage(null);
      setErrorMessage(null);
      await onFollowUser(handle);
      setStatusMessage(`Now scouting ${handle}. You will receive immediate reconnaissance alerts.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to scout user.');
    } finally {
      setLoadingHandle(null);
    }
  };

  const handleUnfollow = async (handle: string) => {
    try {
      setLoadingHandle(handle);
      setStatusMessage(null);
      setErrorMessage(null);
      await onUnfollowUser(handle);
      setStatusMessage(`Removed ${handle} from your scout list.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to unscout user.');
    } finally {
      setLoadingHandle(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0e131b] border border-cyan-800/80 rounded-lg max-w-2xl w-full p-6 text-zinc-200 shadow-2xl relative max-h-[90vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-4 border-b border-zinc-800 pb-4">
          <div className="w-10 h-10 rounded bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-mono font-bold text-white tracking-wide flex items-center gap-2">
              <span>Detective Scouting Hub</span>
              <span className={`text-xs px-2 py-0.5 rounded font-mono border ${
                followingList.length >= 5
                  ? 'bg-amber-950 border-amber-500 text-amber-300'
                  : 'bg-cyan-950 border-cyan-500 text-cyan-300'
              }`}>
                {followingList.length} / 5 Scouts Assigned
              </span>
            </h2>
            <p className="text-xs text-zinc-400 font-mono">
              Follow up to 5 top detectives. Get real-time alerts when they drop clips, answer trials, or claim bounties.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800 mb-4 font-mono text-xs">
          <button
            onClick={() => setActiveTab('alerts')}
            className={`pb-2 px-4 font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'alerts'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>Scout Activity Feed</span>
            <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-[10px]">
              {activities.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('network')}
            className={`pb-2 px-4 font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'network'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Manage Scouts ({followingList.length}/5)</span>
          </button>
        </div>

        {/* Feedback alerts */}
        {statusMessage && (
          <div className="mb-3 p-2.5 rounded bg-emerald-950/60 border border-emerald-500/80 text-emerald-300 font-mono text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mb-3 p-2.5 rounded bg-red-950/60 border border-red-500/80 text-red-300 font-mono text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Tab 1: Scout Activity Feed */}
        {activeTab === 'alerts' && (
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {activities.length === 0 ? (
              <div className="text-center py-10 text-zinc-500 font-mono text-xs">
                No scouted detective activities yet. Follow detectives to receive instant notifications when they post clips or guess.
              </div>
            ) : (
              activities.map(act => (
                <div
                  key={act.id}
                  className="p-3 rounded border border-zinc-800 bg-zinc-900/60 hover:border-cyan-800/80 transition-all font-mono text-xs"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      {act.type === 'rewarded_clip' ? (
                        <span className="p-1 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/50">
                          <Award className="w-3.5 h-3.5" />
                        </span>
                      ) : act.type === 'posted_clip' ? (
                        <span className="p-1 rounded bg-cyan-950 text-cyan-400 border border-cyan-500/50">
                          <Radio className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <span className="p-1 rounded bg-amber-950 text-amber-400 border border-amber-500/50">
                          <Film className="w-3.5 h-3.5" />
                        </span>
                      )}
                      <span className="font-bold text-zinc-200">{act.title}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-cyan-400">
                        {act.dropNumber}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <p className="text-zinc-300 text-xs mb-2 leading-relaxed">
                    {act.message}
                  </p>

                  <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-zinc-800/60">
                    <div className="flex items-center gap-1.5 text-zinc-400">
                      <span>Agent: </span>
                      <span className="text-cyan-300 font-bold">{act.userHandle}</span>
                    </div>
                    {onSelectDrop && (
                      <button
                        onClick={() => {
                          onSelectDrop(act.dropId);
                          onClose();
                        }}
                        className="text-cyan-400 hover:text-cyan-300 font-bold hover:underline"
                      >
                        Inspect Drop &rarr;
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 2: Manage Scouts (Follow / Unfollow) */}
        {activeTab === 'network' && (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Search agents by handle */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search detective handle..."
                className="w-full pl-8 pr-3 py-1.5 rounded bg-black/60 border border-zinc-800 text-zinc-300 placeholder:text-zinc-600 font-mono text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Current Scouted Detectives */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-bold text-cyan-300">
                  Currently Scouting ({followingList.length}/5)
                </span>
                {followingList.length >= 5 && (
                  <span className="text-[10px] font-mono text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Max 5 limit reached
                  </span>
                )}
              </div>

              {scoutedUsers.length === 0 ? (
                <div className="p-4 rounded border border-dashed border-zinc-800 text-center text-zinc-500 font-mono text-xs">
                  {followingList.length === 0
                    ? 'You are not currently scouting any detectives. Choose from the available agents below!'
                    : `No scouted detectives match "${query}".`}
                </div>
              ) : (
                <div className="space-y-2">
                  {scoutedUsers.map(u => (
                    <div
                      key={u.id}
                      className="p-2.5 rounded bg-zinc-900 border border-zinc-700/80 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <img src={u.avatar} alt={u.handle} className="w-8 h-8 rounded-full object-cover border border-cyan-500/40" />
                        <div>
                          <div className="font-mono font-bold text-xs text-white">{u.handle}</div>
                          <div className="text-[10px] font-mono text-zinc-400">
                            {u.roleTitle} • {u.points} pts
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleUnfollow(u.handle)}
                        disabled={loadingHandle === u.handle}
                        className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-red-950 hover:text-red-400 border border-zinc-600 hover:border-red-500/60 font-mono text-xs flex items-center gap-1 text-zinc-300 transition-colors"
                      >
                        <UserMinus className="w-3 h-3" />
                        <span>Unscout</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Available Detectives to Scout */}
            <div>
              <span className="font-mono text-xs font-bold text-zinc-400 block mb-2">
                Available Recon Agents in Field
              </span>
              {availableUsers.length === 0 && (
                <div className="p-4 rounded border border-dashed border-zinc-800 text-center text-zinc-500 font-mono text-xs">
                  No available agents match "{query}".
                </div>
              )}
              <div className="space-y-2">
                {availableUsers.map(u => (
                  <div
                    key={u.id}
                    className="p-2.5 rounded bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <img src={u.avatar} alt={u.handle} className="w-8 h-8 rounded-full object-cover border border-zinc-700" />
                      <div>
                        <div className="font-mono font-bold text-xs text-zinc-200">{u.handle}</div>
                        <div className="text-[10px] font-mono text-zinc-400">
                          {u.roleTitle} • {u.points} pts • ${u.credits}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleFollow(u.handle)}
                      disabled={followingList.length >= 5 || loadingHandle === u.handle}
                      className={`px-3 py-1 rounded font-mono text-xs flex items-center gap-1 transition-all ${
                        followingList.length >= 5
                          ? 'bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed'
                          : 'bg-cyan-600 hover:bg-cyan-500 text-black font-bold shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                      }`}
                    >
                      <UserPlus className="w-3 h-3" />
                      <span>Scout Agent</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
