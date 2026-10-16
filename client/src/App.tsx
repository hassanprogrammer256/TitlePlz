import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import {
  User,
  MysteryDrop,
  MovieKingLeader,
  SeasonInfo,
  ScoutActivityNotification,
  AnalyticsTelemetry,
  SystemStatus,
} from './types';
import { AuthPage } from './pages/AuthPage';
import { Dashboard } from './pages/Dashboard';
import { soundEngine } from './utils/soundEngine';
import {
  dummyUsers,
  dummyDrops,
  dummyLeaders,
  dummySeason,
  dummyScoutActivities,
  dummyTelemetry,
  dummySystemStatus,
} from './data/dummyData';
import * as mockApi from './data/mockApi';
import { USE_MOCKS } from './config';

// With VITE_USE_MOCKS=true the app runs on client-side simulated data and logic (see
// data/dummyData.ts + data/mockApi.ts) and never calls the server. By default it talks to the
// real /api backend, and failures surface as errors instead of falling back to fake data.
const OFFLINE_MODE = USE_MOCKS;

/** GET a JSON endpoint; any failure (offline, 401, non-JSON) yields an empty object. */
async function getJson(url: string): Promise<any> {
  try {
    const res = await fetch(url);
    return await res.json();
  } catch {
    return {};
  }
}

/** Uploads one file and returns the server-issued storage key to reference when creating a drop. */
async function uploadMedia(kind: 'image' | 'video', blob: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append('file', blob, filename);
  const res = await fetch(`/api/uploads?kind=${kind}`, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
  return data.upload.key as string;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',');
  const mime = /data:(.*?)[;,]/.exec(meta)?.[1] ?? 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [drops, setDrops] = useState<MysteryDrop[]>([]);
  const [selectedDropId, setSelectedDropId] = useState<string>('');
  const [leaders, setLeaders] = useState<MovieKingLeader[]>([]);
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [scoutActivities, setScoutActivities] = useState<ScoutActivityNotification[]>([]);
  const [telemetry, setTelemetry] = useState<AnalyticsTelemetry | null>(null);

  // Real-time Infrastructure & Socket.io Status
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  // Live Toast for scout notifications
  const [liveToast, setLiveToast] = useState<{ title: string; message: string } | null>(null);
  const [unreadAlerts, setUnreadAlerts] = useState<number>(0);

  // Poll system infrastructure status (database, sockets)
  useEffect(() => {
    if (OFFLINE_MODE) {
      setSystemStatus(dummySystemStatus);
      const interval = setInterval(() => {
        setSystemStatus(prev => (prev ? { ...prev, uptimeSeconds: prev.uptimeSeconds + 6, timestamp: Date.now() } : prev));
      }, 6000);
      return () => clearInterval(interval);
    }

    const fetchStatus = () => {
      fetch('/api/system/status')
        .then(r => r.json())
        .then(data => setSystemStatus(data))
        .catch(() => {});
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 6000);
    return () => clearInterval(interval);
  }, []);

  const socketRef = useRef<Socket | null>(null);

  // Failures of fire-and-forget actions (vote, agree, scout) have no form to show an error in,
  // so surface the server's reason as a toast. `rethrow` keeps inline error handling working.
  const safely =
    <A extends unknown[]>(fn: (...args: A) => Promise<void>, rethrow = false) =>
    async (...args: A) => {
      try {
        await fn(...args);
      } catch (err) {
        setLiveToast({ title: 'Action failed', message: err instanceof Error ? err.message : String(err) });
        setTimeout(() => setLiveToast(null), 5000);
        if (rethrow) throw err;
      }
    };

  const refreshDrop = async (dropId: string) => {
    const res = await getJson(`/api/drops/${dropId}`);
    if (res.drop) setDrops(prev => prev.map(d => (d.id === dropId ? res.drop : d)));
  };

  const refreshScoutFeed = async () => {
    const res = await getJson('/api/scouts/feed');
    if (res.activities) setScoutActivities(res.activities);
  };

  // Socket.io live connection. It reconnects when the signed-in user changes, so the handshake
  // carries the right session cookie and the server puts the socket in that user's private room.
  useEffect(() => {
    if (OFFLINE_MODE) {
      // Simulate a live connection badge; real-time events are driven locally instead.
      const timeout = setTimeout(() => setSocketConnected(true), 600);
      return () => clearTimeout(timeout);
    }

    const socket = io({
      transports: ['websocket', 'polling'],
      path: '/socket.io',
      reconnectionAttempts: 20,
    });
    socketRef.current = socket;

    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));

    socket.on('new_drop', (drop: MysteryDrop) => {
      setDrops(prev => [drop, ...prev.filter(d => d.id !== drop.id)]);
    });

    // Someone guessed on a drop we are watching.
    socket.on('guess_result', (payload: any) => {
      setDrops(prev =>
        prev.map(d =>
          d.id === payload.dropId
            ? {
                ...d,
                status: payload.status ?? d.status,
                totalGuessesCast: payload.totalGuessesCast ?? d.totalGuessesCast,
                candidates: payload.candidates ?? d.candidates,
                solvedBy: payload.isCorrect ? payload.userHandle : d.solvedBy,
              }
            : d
        )
      );
      // The push never carries the answer; fetch the drop again so a solved one reveals its title.
      if (payload.isCorrect) refreshDrop(payload.dropId);
    });

    // Crowd state changed (a guess or a vote).
    socket.on('consensus_update', ({ dropId, status, totalGuessesCast, candidates }: any) => {
      setDrops(prev => prev.map(d => (d.id === dropId ? { ...d, status, totalGuessesCast, candidates } : d)));
    });

    socket.on('new_comment', ({ dropId, comment }: any) => {
      setDrops(prev =>
        prev.map(d =>
          d.id === dropId && !d.comments.some(c => c.id === comment.id) ? { ...d, comments: [comment, ...d.comments] } : d
        )
      );
    });

    // Sent only to people who scout the actor, so no client-side filtering is needed.
    socket.on('scout_activity', (activity: ScoutActivityNotification) => {
      setScoutActivities(prev => [activity, ...prev.filter(a => a.id !== activity.id)]);
      setLiveToast({ title: activity.title, message: activity.message });
      setUnreadAlerts(prev => prev + 1);
      soundEngine.playAlert();
      setTimeout(() => setLiveToast(null), 5000);
    });

    socket.on('credit_update', ({ credits }: { credits: number }) => {
      setCurrentUser(prev => (prev ? { ...prev, credits } : prev));
    });

    socket.on('leaderboard_update', ({ leaders: newLeaders, season: newSeason }: any) => {
      if (newLeaders) setLeaders(newLeaders);
      if (newSeason) setSeason(newSeason);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, [currentUser?.id]);

  // Watch the selected drop's room (and rejoin after a reconnect).
  useEffect(() => {
    const socket = socketRef.current;
    if (OFFLINE_MODE || !socket || !selectedDropId) return;
    const join = () => socket.emit('join_drop', selectedDropId);
    if (socket.connected) join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
      socket.emit('leave_drop', selectedDropId);
    };
  }, [selectedDropId, currentUser?.id]);

  // Mock mode: seed everything once from the bundled demo data.
  useEffect(() => {
    if (!OFFLINE_MODE) return;
    // currentUser stays null until the visitor authenticates via the "/" auth page.
    setAllUsers(dummyUsers);
    setDrops(dummyDrops);
    setSelectedDropId(dummyDrops[0].id);
    setLeaders(dummyLeaders);
    setSeason(dummySeason);
    setScoutActivities(dummyScoutActivities);
    setTelemetry(dummyTelemetry);
  }, []);

  // Real mode: load on mount (which also restores a session from the cookie) and reload whenever
  // the signed-in user changes, so drops carry that user's own trials and the scout feed is theirs.
  useEffect(() => {
    if (OFFLINE_MODE) return;
    let cancelled = false;

    async function loadData() {
      const [meRes, dropsRes, leadersRes, usersRes, feedRes] = await Promise.all([
        getJson('/api/auth/me'),
        getJson('/api/drops?limit=100'),
        getJson('/api/leaderboard'),
        getJson('/api/users'),
        currentUser ? getJson('/api/scouts/feed') : Promise.resolve({}),
      ]);
      if (cancelled) return; // a newer load (after login/logout/switch) owns the state now

      if (meRes.user) setCurrentUser(meRes.user);
      if (dropsRes.drops) {
        setDrops(dropsRes.drops);
        setSelectedDropId(prev => (dropsRes.drops.some((d: MysteryDrop) => d.id === prev) ? prev : (dropsRes.drops[0]?.id ?? '')));
      }
      if (leadersRes.leaderboard) setLeaders(leadersRes.leaderboard);
      if (leadersRes.season) setSeason(leadersRes.season);
      if (usersRes.users) setAllUsers(usersRes.users);
      setScoutActivities(feedRes.activities ?? []);
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  // Simulate one scout-activity alert shortly after login, so the notification
  // toast + sound are reachable without a live backend to push real ones.
  useEffect(() => {
    if (!OFFLINE_MODE || !currentUser || currentUser.following.length === 0) return;

    const followedHandle = currentUser.following[0];
    const followedUser = allUsers.find(u => u.handle === followedHandle);
    if (!followedUser) return;

    const timeout = setTimeout(() => {
      const activity: ScoutActivityNotification = {
        id: `sa-${Date.now()}`,
        userId: followedUser.id,
        userHandle: followedUser.handle,
        userAvatar: followedUser.avatar,
        type: 'posted_clip',
        dropId: dummyDrops[0].id,
        dropNumber: dummyDrops[0].dropNumber,
        title: 'Scout Activity',
        message: `${followedUser.handle} just posted a new mystery drop.`,
        timestamp: Date.now(),
      };
      setScoutActivities(prev => [activity, ...prev]);
      setLiveToast({ title: activity.title, message: activity.message });
      setUnreadAlerts(prev => prev + 1);
      soundEngine.playAlert();
      setTimeout(() => setLiveToast(null), 5000);
    }, 8000);

    return () => clearTimeout(timeout);
  }, [currentUser?.id]);

  // Public telemetry stream. Everything else arrives over Socket.IO.
  useEffect(() => {
    if (OFFLINE_MODE) {
      // Simulate gentle telemetry drift so the HUD still feels "live".
      const interval = setInterval(() => {
        setTelemetry(prev => {
          if (!prev) return prev;
          const jitter = (n: number, spread: number) => Math.max(0, Math.round(n + (Math.random() - 0.5) * spread));
          return {
            ...prev,
            activeSolvers: jitter(prev.activeSolvers, 4),
            solverVelocity: Math.max(0, +(prev.solverVelocity + (Math.random() - 0.5) * 0.6).toFixed(1)),
            guessesSubmittedToday: prev.guessesSubmittedToday + Math.round(Math.random() * 2),
          };
        });
      }, 5000);
      return () => clearInterval(interval);
    }

    const eventSource = new EventSource('/api/analytics/stream');

    eventSource.addEventListener('initial_telemetry', (e: any) => {
      try {
        setTelemetry(JSON.parse(e.data));
      } catch {}
    });

    eventSource.addEventListener('telemetry', (e: any) => {
      try {
        const data = JSON.parse(e.data);
        setTelemetry(prev => (prev ? { ...prev, ...data } : data));
      } catch {}
    });

    eventSource.addEventListener('season_reset', (e: any) => {
      try {
        const { season: newSeason, leaders: newLeaders } = JSON.parse(e.data);
        if (newSeason) setSeason(newSeason);
        if (newLeaders) setLeaders(newLeaders);
      } catch {}
    });

    return () => {
      eventSource.close();
    };
  }, []);

  // Leaderboard pushes come without a viewer, so mark "this is me" here by handle.
  const leadersForView = useMemo(
    () => leaders.map(l => ({ ...l, isCurrent: l.handle === currentUser?.handle })),
    [leaders, currentUser?.handle]
  );

  const selectedDrop = drops.find(d => d.id === selectedDropId) || drops[0];

  // Actions
  const handleGuessSubmit = async (title: string) => {
    if (!selectedDrop) return;

    if (OFFLINE_MODE) {
      if (!currentUser) throw new Error('You must be authenticated to submit a guess.');
      const data = mockApi.mockSubmitGuess(selectedDrop, currentUser, title);
      setDrops(prev => prev.map(d => (d.id === data.drop.id ? data.drop : d)));
      setCurrentUser(data.user);
      return data;
    }

    const res = await fetch(`/api/drops/${selectedDrop.id}/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to submit guess');
    }

    if (data.drop) {
      setDrops(prev => prev.map(d => (d.id === data.drop.id ? data.drop : d)));
    }
    if (data.user && currentUser) {
      setCurrentUser(prev => (prev ? { ...prev, ...data.user } : prev));
    }

    return data;
  };

  const handleVoteCandidate = async (candidateId: string) => {
    if (!selectedDrop) return;

    if (OFFLINE_MODE) {
      const data = mockApi.mockVote(selectedDrop, candidateId);
      setDrops(prev => prev.map(d => (d.id === data.drop.id ? data.drop : d)));
      return;
    }

    const res = await fetch(`/api/drops/${selectedDrop.id}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to vote');
    }
    if (data.drop) {
      setDrops(prev => prev.map(d => (d.id === data.drop.id ? data.drop : d)));
    }
  };

  const handlePostComment = async (content: string, timestamp?: string) => {
    if (!selectedDrop) return;

    if (OFFLINE_MODE) {
      if (!currentUser) throw new Error('You must be authenticated to comment.');
      const data = mockApi.mockPostComment(currentUser, content, timestamp);
      setDrops(prev =>
        prev.map(d => (d.id === selectedDrop.id ? { ...d, comments: [data.comment, ...d.comments] } : d))
      );
      return;
    }

    const res = await fetch(`/api/drops/${selectedDrop.id}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, timestamp }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to post comment');
    if (data.comment) {
      setDrops(prev =>
        prev.map(d =>
          d.id === selectedDrop.id
            ? { ...d, comments: [data.comment, ...d.comments.filter(c => c.id !== data.comment.id)] }
            : d
        )
      );
    }
  };

  const handleAgreeComment = async (commentId: string) => {
    if (!selectedDrop) return;

    if (OFFLINE_MODE) {
      const data = mockApi.mockAgreeComment(selectedDrop, commentId);
      setDrops(prev =>
        prev.map(d =>
          d.id === selectedDrop.id
            ? { ...d, comments: d.comments.map(c => (c.id === commentId ? data.comment : c)) }
            : d
        )
      );
      return;
    }

    const res = await fetch(`/api/drops/${selectedDrop.id}/comments/${commentId}/agree`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to agree with comment');
    if (data.comment) {
      setDrops(prev =>
        prev.map(d => {
          if (d.id === selectedDrop.id) {
            return {
              ...d,
              comments: d.comments.map(c => (c.id === commentId ? data.comment : c)),
            };
          }
          return d;
        })
      );
    }
  };

  const handleDropCreated = async (dropData: any) => {
    if (OFFLINE_MODE) {
      if (!currentUser) throw new Error('You must be authenticated to drop a mystery reel.');
      const data = mockApi.mockCreateDrop(dropData, currentUser);
      setDrops(prev => [data.drop, ...prev]);
      setSelectedDropId(data.drop.id);
      setCurrentUser(data.user);
      return;
    }

    // Upload the media first (a clip also needs its poster frame as a separate image),
    // then create the drop referencing the server-issued keys.
    const { specimenFile, posterDataUrl, imageUrl: _imageUrl, videoUrl: _videoUrl, ...fields } = dropData;
    if (!specimenFile) throw new Error('Please select a media specimen first.');

    let imageKey: string;
    let videoKey: string | undefined;
    if (fields.mediaType === 'clip') {
      if (!posterDataUrl) throw new Error('Could not capture a poster frame from this clip. Try another MP4.');
      // Video first: it is the file the server may refuse (length, format), and nothing else
      // should be stored if it does.
      videoKey = await uploadMedia('video', specimenFile, specimenFile.name);
      imageKey = await uploadMedia('image', dataUrlToBlob(posterDataUrl), 'poster.jpg');
    } else {
      imageKey = await uploadMedia('image', specimenFile, specimenFile.name);
    }

    const res = await fetch('/api/drops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fields, imageKey, videoKey }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create drop');
    }

    if (data.drop) {
      // The socket push may have already added it; keep exactly one copy (this one has the answer for the uploader).
      setDrops(prev => [data.drop, ...prev.filter(d => d.id !== data.drop.id)]);
      setSelectedDropId(data.drop.id);
    }
    if (data.user && currentUser) {
      setCurrentUser(prev => (prev ? { ...prev, credits: data.user.credits } : prev));
    }
  };

  const handleClaimDailyRefill = async () => {
    if (OFFLINE_MODE) {
      if (!currentUser) throw new Error('You must be authenticated to claim a refill.');
      const data = mockApi.mockClaimDailyRefill(currentUser);
      setCurrentUser(data.user);
      return;
    }

    const res = await fetch('/api/credits/refill', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Daily refill not ready');
    }
    if (data.user) {
      setCurrentUser(data.user);
    }
  };

  const handlePurchaseCredits = async (amount: number, packageId: string) => {
    if (OFFLINE_MODE) {
      if (!currentUser) throw new Error('You must be authenticated to purchase credits.');
      const data = mockApi.mockPurchaseCredits(currentUser, amount);
      setCurrentUser(data.user);
      return;
    }

    const res = await fetch('/api/credits/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, packageId }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Payment failed');
    }
    if (data.user) {
      setCurrentUser(data.user);
    }
  };

  const handleFollowUser = async (handle: string) => {
    if (OFFLINE_MODE) {
      if (!currentUser) throw new Error('You must be authenticated to scout a detective.');
      const data = mockApi.mockFollow(currentUser, handle);
      setCurrentUser(data.user);
      return;
    }

    const res = await fetch('/api/scouts/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to follow');
    }
    if (data.user) {
      setCurrentUser(data.user);
    }
    refreshScoutFeed();
  };

  const handleUnfollowUser = async (handle: string) => {
    if (OFFLINE_MODE) {
      if (!currentUser) throw new Error('You must be authenticated to unfollow a detective.');
      const data = mockApi.mockUnfollow(currentUser, handle);
      setCurrentUser(data.user);
      return;
    }

    const res = await fetch('/api/scouts/unfollow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to unfollow');
    }
    if (data.user) {
      setCurrentUser(data.user);
    }
    refreshScoutFeed();
  };

  const handleAdminResetSeason = async () => {
    if (OFFLINE_MODE) {
      if (!season) return;
      const data = mockApi.mockResetSeason(season, leaders);
      setSeason(data.season);
      setLeaders(data.leaders);
      soundEngine.playAlert();
      return;
    }

    const res = await fetch('/api/season/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durationDays: 31 }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to reset season');
    }
    if (data.season) setSeason(data.season);
    if (data.leaders) setLeaders(data.leaders);
    soundEngine.playAlert();
  };

  const handleUserSwitch = async (userId: string) => {
    if (OFFLINE_MODE) {
      const data = mockApi.mockUserSwitch(allUsers, userId);
      setCurrentUser(data.user);
      return;
    }

    const res = await fetch('/api/auth/switch-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not switch user');
    if (data.user) setCurrentUser(data.user);
  };

  const handleLogin = async (username: string, password?: string) => {
    if (OFFLINE_MODE) {
      const data = mockApi.mockLogin(allUsers, username);
      setCurrentUser(data.user);
      return;
    }

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }
    if (data.user) setCurrentUser(data.user);
  };

  const handleRegister = async (username: string, password?: string, role?: string) => {
    if (OFFLINE_MODE) {
      const data = mockApi.mockRegister(allUsers, username, role as any);
      setCurrentUser(data.user);
      setAllUsers(prev => [...prev, data.user]);
      return;
    }

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    if (data.user) {
      setCurrentUser(data.user);
      setAllUsers(prev => [...prev, data.user]);
    }
  };

  const handleLogout = async () => {
    if (!OFFLINE_MODE) {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch {}
      setUnreadAlerts(0);
    }
    setCurrentUser(null);
  };

  return (
    <Routes>
      <Route
        path="/"
        element={
          currentUser ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <AuthPage onLogin={handleLogin} onRegister={handleRegister} />
          )
        }
      />
      <Route
        path="/dashboard"
        element={
          currentUser ? (
            <Dashboard
              currentUser={currentUser}
              allUsers={allUsers}
              drops={drops}
              selectedDropId={selectedDropId}
              setSelectedDropId={setSelectedDropId}
              leaders={leadersForView}
              season={season}
              scoutActivities={scoutActivities}
              telemetry={telemetry}
              socketConnected={socketConnected}
              systemStatus={systemStatus}
              liveToast={liveToast}
              unreadAlerts={unreadAlerts}
              setUnreadAlerts={setUnreadAlerts}
              onUserSwitch={handleUserSwitch}
              onLogout={handleLogout}
              onGuessSubmit={handleGuessSubmit}
              onVoteCandidate={safely(handleVoteCandidate)}
              onPostComment={handlePostComment}
              onAgreeComment={safely(handleAgreeComment)}
              onDropCreated={handleDropCreated}
              onClaimDailyRefill={handleClaimDailyRefill}
              onPurchaseCredits={handlePurchaseCredits}
              onFollowUser={safely(handleFollowUser, true)}
              onUnfollowUser={safely(handleUnfollowUser, true)}
              onAdminResetSeason={handleAdminResetSeason}
            />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
