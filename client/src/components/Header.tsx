import React, { useState, useEffect } from 'react';
import { User, SystemStatus } from '../types';
import {
  Coins,
  Radio,
  PlusCircle,
  Users,
  Clock,
  ChevronDown,
  LogOut,
  Database,
  Menu,
} from 'lucide-react';

import { CAN_SWITCH_USERS, USE_MOCKS } from '../config';
interface HeaderProps {
  user: User;
  onOpenDropModal: () => void;
  onOpenCreditsModal: () => void;
  onOpenScoutingModal: () => void;
  onOpenMobileNav: () => void;
  onUserSwitch: (userId: string) => void;
  onLogout: () => void;
  allUsers: User[];
  unreadAlertCount: number;
  socketConnected?: boolean;
  systemStatus?: SystemStatus | null;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  onOpenDropModal,
  onOpenCreditsModal,
  onOpenScoutingModal,
  onOpenMobileNav,
  onUserSwitch,
  onLogout,
  allUsers,
  unreadAlertCount,
  socketConnected = true,
  systemStatus,
}) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [refillTimeText, setRefillTimeText] = useState<string>('');
  const [canRefillNow, setCanRefillNow] = useState<boolean>(false);

  useEffect(() => {
    const updateRefillTimer = () => {
      const now = Date.now();
      const last = user.lastDailyRefillAt || 0;
      const twentyFourHours = 24 * 3600 * 1000;
      const diff = now - last;

      if (diff >= twentyFourHours) {
        setCanRefillNow(true);
        setRefillTimeText('Refill Ready ($20)');
      } else {
        setCanRefillNow(false);
        const remMs = twentyFourHours - diff;
        const hours = Math.floor(remMs / (3600 * 1000));
        const mins = Math.floor((remMs % (3600 * 1000)) / (60 * 1000));
        const secs = Math.floor((remMs % (60 * 1000)) / 1000);
        setRefillTimeText(
          `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        );
      }
    };

    updateRefillTimer();
    const interval = setInterval(updateRefillTimer, 1000);
    return () => clearInterval(interval);
  }, [user.lastDailyRefillAt]);

  return (
    <header className="sticky top-0 z-40 bg-[#0b0f14]/95 border-b border-cyan-900/40 backdrop-blur-md px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-y-2 text-xs tracking-wider">
      {/* Brand & Terminal Identifier */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileNav}
          className="md:hidden p-1.5 -ml-1 rounded text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
          title="Open recon deck menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg overflow-hidden shadow-[0_0_16px_rgba(6,182,212,0.45)] shrink-0">
            <img src="/icon-mark.svg" alt="TitlePlz" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-sm tracking-wider text-cyan-400">TitlePlz</span>
              <span className="hidden sm:inline px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-700/60 text-[10px] font-mono text-cyan-300">
                RECON // V4.2
              </span>
            </div>
            <div className="hidden sm:flex text-[10px] text-zinc-500 font-mono items-center gap-2">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className={`w-1.5 h-1.5 rounded-full ${socketConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`}></span>
                <span>{socketConnected ? 'Recon Uplink Live' : 'Polling'}</span>
              </span>
              <span className="text-zinc-700">•</span>
              <span className="flex items-center gap-1 text-amber-400" title="Central Archive">
                <Database className="w-2.5 h-2.5" />
                <span>Archive {systemStatus?.database?.status === 'connected' ? 'Live' : 'Synced'}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Center Metrics / Actions */}
      <div className="hidden md:flex items-center gap-3">
        {/* Credits Balance & Reload */}
        <div className="flex items-center bg-zinc-900/90 border border-amber-500/40 rounded px-2.5 py-1.5 shadow-[0_0_10px_rgba(245,158,11,0.15)]">
          <Coins className="w-4 h-4 text-amber-400 mr-1.5" />
          <div className="flex flex-col text-left">
            <span className="text-[9px] uppercase tracking-wider text-amber-400/80 font-mono">Agent Credits</span>
            <span className="font-mono font-bold text-sm text-amber-300">${user.credits}</span>
          </div>
          <button
            onClick={onOpenCreditsModal}
            title="Purchase or Refill Credits"
            className="ml-2.5 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 flex items-center gap-1 text-[11px] font-mono transition-colors"
          >
            <PlusCircle className="w-3 h-3" />
            <span>Reload</span>
          </button>
        </div>

        {/* 24-Hour Refill Timer / Claim Pill */}
        <button
          onClick={onOpenCreditsModal}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border font-mono text-[11px] transition-all ${
            canRefillNow
              ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)] animate-pulse'
              : 'bg-zinc-900/80 border-zinc-700/60 text-zinc-400'
          }`}
          title="Every 24 hours $20 credits are refilled"
        >
          <Clock className={`w-3.5 h-3.5 ${canRefillNow ? 'text-emerald-400' : 'text-zinc-500'}`} />
          <span>{canRefillNow ? 'Daily $20 Ready!' : `Refill: ${refillTimeText}`}</span>
        </button>

        {/* Scouting Hub Button (Max 5 Users) */}
        <button
          onClick={onOpenScoutingModal}
          className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-zinc-900/80 border border-cyan-800/60 hover:border-cyan-500/80 text-cyan-300 font-mono text-[11px] transition-all"
          title="Scout network (Follow up to 5 detectives)"
        >
          <Users className="w-3.5 h-3.5 text-cyan-400" />
          <span>Scouts ({user.following ? user.following.length : 0}/5)</span>
          {unreadAlertCount > 0 && (
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-red-600 text-white font-mono text-[9px] font-bold">
              {unreadAlertCount}
            </span>
          )}
        </button>

        {/* New Mystery Drop Button */}
        <button
          onClick={onOpenDropModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-black font-mono font-bold text-xs shadow-[0_0_12px_rgba(6,182,212,0.4)] transition-all cursor-pointer"
        >
          <Radio className="w-3.5 h-3.5" />
          <span>+ Drop Mystery Reel</span>
        </button>
      </div>

      {/* User Status & Identity Drawer */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          {/* Role Badge (fixed at enlistment) */}
          <div
            className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 text-[11px] font-mono"
            title="Role is fixed at enlistment"
          >
            <span className="capitalize">{user.role}</span>
          </div>

          {/* Identity dropdown */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-1.5 sm:gap-2 pl-1 pr-1.5 sm:pr-2 py-1 rounded bg-zinc-900/90 border border-zinc-700 hover:border-cyan-500 transition-colors"
            >
              <img
                src={user.avatar}
                alt={user.handle}
                className="w-6 h-6 rounded-full object-cover border border-cyan-500/50 shrink-0"
              />
              <div className="text-left font-mono">
                <div className="text-[11px] font-bold text-cyan-300 leading-tight flex items-center gap-1">
                  <span>{user.handle}</span>
                  <span className="hidden sm:inline text-[9px] px-1 py-0.2 rounded bg-zinc-800 text-zinc-400">
                    {user.points} pts
                  </span>
                </div>
                <div className="hidden sm:block text-[9px] text-zinc-500 leading-none">{user.roleTitle}</div>
              </div>
              <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-1 w-52 rounded bg-zinc-900 border border-zinc-700 shadow-xl py-1 z-50 font-mono text-[11px]">
                {CAN_SWITCH_USERS && (
                  <div className="px-2 py-1 text-[10px] text-zinc-500 border-b border-zinc-800 flex items-center justify-between">
                    <span>Recon Agent Roster</span>
                    <span className="text-cyan-400">Quick Switch</span>
                  </div>
                )}
                {(CAN_SWITCH_USERS ? allUsers : []).map(u => (
                  <button
                    key={u.id}
                    onClick={() => {
                      onUserSwitch(u.id);
                      setUserMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-zinc-800 flex items-center gap-2 ${
                      u.id === user.id ? 'bg-cyan-950/40 text-cyan-300 font-bold' : 'text-zinc-300'
                    }`}
                  >
                    <img src={u.avatar} alt={u.handle} className="w-5 h-5 rounded-full object-cover" />
                    <div className="flex-1 truncate">
                      <div className="truncate">{u.handle}</div>
                      <div className="text-[9px] text-zinc-500">{USE_MOCKS || u.id === user.id ? `$${u.credits} • ` : ''}{u.points} pts</div>
                    </div>
                    {u.id === user.id && <span className="text-cyan-400">✓</span>}
                  </button>
                ))}
                <div className="border-t border-zinc-800 mt-1 pt-1">
                  <button
                    onClick={() => {
                      onLogout();
                      setUserMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 text-red-400 flex items-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
