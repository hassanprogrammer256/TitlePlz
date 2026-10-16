import React, { useState } from 'react';
import { UserRole } from '../types';
import { ShieldCheck, Key, AlertCircle, Coins, Radio, Terminal } from 'lucide-react';
import { dummyUsers } from '../data/dummyData';
import { USE_MOCKS } from '../config';

interface AuthPageProps {
  onLogin: (username: string, password?: string) => Promise<any>;
  onRegister: (username: string, password?: string, role?: UserRole) => Promise<any>;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onLogin, onRegister }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('detective');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        await onRegister(username, password, role);
      } else {
        await onLogin(username, password);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070a0e] recon-scanlines text-zinc-200 flex items-center justify-center p-4 font-mono relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,242,254,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(0,242,254,0.6) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="w-full max-w-md relative">
        {/* Brand */}
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <div className="w-12 h-12 rounded-lg overflow-hidden shadow-[0_0_18px_rgba(6,182,212,0.5)]">
            <img src="/icon-mark.svg" alt="TitlePlz" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-wider text-cyan-400">TitlePlz</div>
            <div className="text-[10px] text-zinc-500 tracking-widest uppercase">Recon Terminal // V4.2</div>
          </div>
        </div>

        <div className="bg-[#0e131b]/90 backdrop-blur-md border border-cyan-800/60 rounded-lg p-6 shadow-2xl border-glow-cyan text-xs">
          <div className="flex items-center gap-3 mb-4 border-b border-zinc-800 pb-3">
            <div className="w-10 h-10 rounded bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-wide">
                {isRegister ? 'New Detective Enlistment' : 'Agent Access Terminal'}
              </h1>
              <p className="text-[11px] text-zinc-400">
                {isRegister ? 'Join the cinema reconnaissance network.' : 'Enter your callsign to access recon deck.'}
              </p>
            </div>
          </div>

          <div className="mb-4 p-2.5 rounded bg-amber-950/40 border border-amber-500/40 text-amber-300 flex items-center gap-2">
            <Coins className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Enlistment Bonus:</strong> Every new detective starts with{' '}
              <span className="text-white underline font-bold">$100 Credits</span>!
            </span>
          </div>

          {error && (
            <div className="mb-3 p-2.5 rounded bg-red-950/60 border border-red-500/80 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-zinc-400 font-bold mb-1">Callsign / Handle</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="e.g. CinemaSleuth"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 rounded bg-black/60 border border-zinc-800 text-cyan-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 text-xs"
                />
                <span className="absolute left-2.5 top-2 text-cyan-600">&gt;_</span>
              </div>
            </div>

            <div>
              <label className="block text-zinc-400 font-bold mb-1">Access Cipher Password</label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="Enter cipher..."
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 rounded bg-black/60 border border-zinc-800 text-cyan-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 text-xs"
                />
                <Key className="w-3.5 h-3.5 text-zinc-600 absolute left-2.5 top-2.5" />
              </div>
            </div>

            {isRegister && (
              <div>
                <label className="block text-zinc-400 font-bold mb-1">Designated Division Role</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 rounded bg-black/60 border border-zinc-800 text-cyan-200 focus:outline-none focus:border-cyan-500 text-xs"
                >
                  <option value="detective">Verified Detective (Full Access)</option>
                  {USE_MOCKS && <option value="curator">Archival Curator (Admin)</option>}
                  <option value="seeker">Viewer / Spotter (Casual)</option>
                </select>
                <span className="text-[10px] text-zinc-500 block mt-1">
                  Your role is fixed at enlistment and cannot be changed later.
                </span>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded bg-cyan-600 hover:bg-cyan-500 text-black font-bold text-xs shadow-[0_0_12px_rgba(6,182,212,0.4)] transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Radio className="w-3.5 h-3.5" />
                {loading ? 'Authenticating...' : isRegister ? 'Enlist & Claim $100' : 'Login'}
              </button>
            </div>
          </form>

          <div className="mt-4 pt-3 border-t border-zinc-800 text-center text-[11px] text-zinc-500">
            {isRegister ? (
              <span>
                Already enlisted?{' '}
                <button
                  type="button"
                  onClick={() => setIsRegister(false)}
                  className="text-cyan-400 hover:underline font-bold"
                >
                  Sign in here
                </button>
              </span>
            ) : (
              <span>
                New agent?{' '}
                <button
                  type="button"
                  onClick={() => setIsRegister(true)}
                  className="text-cyan-400 hover:underline font-bold"
                >
                  Create identity with $100 starter
                </button>
              </span>
            )}
          </div>
        </div>

        {USE_MOCKS && !isRegister && (
          <div className="mt-4 bg-[#0e131b]/70 border border-zinc-800 rounded-lg p-3 text-[10px] text-zinc-500">
            <div className="flex items-center gap-1.5 text-zinc-400 font-bold mb-1.5">
              <Terminal className="w-3 h-3" />
              <span>Demo Agents (any password)</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dummyUsers.map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setUsername(u.username)}
                  className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 hover:border-cyan-600 text-cyan-400 transition-colors"
                >
                  {u.handle}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
