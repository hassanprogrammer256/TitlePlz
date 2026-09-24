import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { io } from 'socket.io-client';
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

// No backend exists yet — every fetch/socket/SSE call below falls back to
// client-side simulated data & logic (see data/dummyData.ts + data/mockApi.ts)
// so the whole app can be explored end to end ahead of a real server.
const OFFLINE_MODE = true;

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [drops, setDrops] = useState<MysteryDrop[]>([]);
  const [selectedDropId, setSelectedDropId] = useState<string>('drop-9042-alpha');
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

  // Poll system infrastructure status (MongoDB Atlas, Redis, Socket.io)
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

  // Socket.io live connection & events listener
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

    socket.on('connect', () => {
      setSocketConnected(true);
      if (currentUser?.id) {
        socket.emit('join_user', currentUser.id);
      }
      if (selectedDropId) {
        socket.emit('join_drop', selectedDropId);
      }
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('telemetry', (data: AnalyticsTelemetry) => {
      setTelemetry(prev => (prev ? { ...prev, ...data } : data));
    });

    socket.on('new_drop', (drop: MysteryDrop) => {
      setDrops(prev => [drop, ...prev.filter(d => d.id !== drop.id)]);
    });

    socket.on('guess_result', (payload: any) => {
      setDrops(prev =>
        prev.map(d => {
          if (d.id === payload.dropId) {
            return {
              ...d,
              status: payload.isCorrect ? 'solved' : d.status,
              solvedBy: payload.isCorrect ? payload.userHandle : d.solvedBy,
            };
          }
          return d;
        })
      );
    });

    socket.on('scout_activity', (activity: ScoutActivityNotification) => {
      setScoutActivities(prev => [activity, ...prev]);
      if (currentUser?.following?.includes(activity.userHandle)) {
        setLiveToast({ title: activity.title, message: activity.message });
        setUnreadAlerts(prev => prev + 1);
        setTimeout(() => setLiveToast(null), 5000);
      }
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
    };
  }, [currentUser?.id, selectedDropId]);

  // Load initial data
  useEffect(() => {
    if (OFFLINE_MODE) {
      // currentUser stays null until the visitor authenticates via the "/" auth page.
      setAllUsers(dummyUsers);
      setDrops(dummyDrops);
      setSelectedDropId(dummyDrops[0].id);
      setLeaders(dummyLeaders);
      setSeason(dummySeason);
      setScoutActivities(dummyScoutActivities);
      setTelemetry(dummyTelemetry);
      return;
    }

    async function loadData() {
      try {
        const [meRes, dropsRes, leadersRes, usersRes, scoutFeedRes] = await Promise.all([
          fetch('/api/auth/me').then(r => r.json()),
          fetch('/api/drops').then(r => r.json()),
          fetch('/api/leaderboard').then(r => r.json()),
          fetch('/api/users').then(r => r.json()),
          fetch('/api/scouts/feed').then(r => r.json()),
        ]);

        if (meRes?.user) setCurrentUser(meRes.user);
        if (dropsRes?.drops) {
          setDrops(dropsRes.drops);
          if (dropsRes.drops.length > 0) {
            setSelectedDropId(dropsRes.drops[0].id);
          }
        }
        if (leadersRes?.leaderboard) setLeaders(leadersRes.leaderboard);
        if (leadersRes?.season) setSeason(leadersRes.season);
        if (usersRes?.users) setAllUsers(usersRes.users);
        if (scoutFeedRes?.activities) setScoutActivities(scoutFeedRes.activities);
      } catch (err) {
        console.error('Failed to load initial data:', err);
      }
    }

    loadData();
  }, []);

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

  // SSE Stream for real-time analytics and scouting alerts
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
      } catch (err) {}
    });

    eventSource.addEventListener('telemetry', (e: any) => {
      try {
        const data = JSON.parse(e.data);
        setTelemetry(prev => (prev ? { ...prev, ...data } : data));
      } catch (err) {}
    });

    eventSource.addEventListener('scout_activity', (e: any) => {
      try {
        const { activity, authorHandle } = JSON.parse(e.data);
        setScoutActivities(prev => [activity, ...prev]);

        // If current user is following the author, show live toast!
        if (currentUser?.following?.includes(authorHandle)) {
          setLiveToast({ title: activity.title, message: activity.message });
          setUnreadAlerts(prev => prev + 1);
          soundEngine.playAlert();
          setTimeout(() => setLiveToast(null), 5000);
        }
      } catch (err) {}
    });

    eventSource.addEventListener('guess_submitted', (e: any) => {
      try {
        const payload = JSON.parse(e.data);
        setDrops(prev =>
          prev.map(d => {
            if (d.id === payload.dropId) {
              const updatedTrials = { ...d.userTrials };
              if (payload.trialRecord) {
                updatedTrials[payload.trialRecord.userId] = payload.trialRecord;
              }
              return {
                ...d,
                totalGuessesCast: payload.totalGuessesCast,
                candidates: payload.candidates,
                comments: [payload.newComment, ...d.comments],
                status: payload.dropStatus || d.status,
                solvedBy: payload.solvedBy || d.solvedBy,
                userTrials: updatedTrials,
              };
            }
            return d;
          })
        );

        // Refresh leaderboards
        fetch('/api/leaderboard')
          .then(r => r.json())
          .then(res => {
            if (res.leaderboard) setLeaders(res.leaderboard);
          });
      } catch (err) {}
    });

    eventSource.addEventListener('new_drop_created', (e: any) => {
      try {
        const { drop, user } = JSON.parse(e.data);
        setDrops(prev => [drop, ...prev.filter(d => d.id !== drop.id)]);
        if (currentUser && user && currentUser.handle === user.handle) {
          setCurrentUser(prev => (prev ? { ...prev, credits: user.credits } : prev));
        }
      } catch (err) {}
    });

    eventSource.addEventListener('vote_recorded', (e: any) => {
      try {
        const { dropId, candidates, totalGuessesCast } = JSON.parse(e.data);
        setDrops(prev =>
          prev.map(d => (d.id === dropId ? { ...d, candidates, totalGuessesCast } : d))
        );
      } catch (err) {}
    });

    eventSource.addEventListener('user_credited', (e: any) => {
      try {
        const { userId, credits } = JSON.parse(e.data);
        if (currentUser && currentUser.id === userId) {
          setCurrentUser(prev => (prev ? { ...prev, credits } : prev));
        }
      } catch (err) {}
    });

    eventSource.addEventListener('season_reset', (e: any) => {
      try {
        const { season: newSeason, leaders: newLeaders } = JSON.parse(e.data);
        if (newSeason) setSeason(newSeason);
        if (newLeaders) setLeaders(newLeaders);
      } catch (err) {}
    });

    return () => {
      eventSource.close();
    };
  }, [currentUser]);

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
          d.id === selectedDrop.id ? { ...d, comments: [data.comment, ...d.comments] } : d
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

    const res = await fetch('/api/drops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dropData),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create drop');
    }

    if (data.drop) {
      setDrops(prev => [data.drop, ...prev]);
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

  const handleLogout = () => {
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
              leaders={leaders}
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
              onVoteCandidate={handleVoteCandidate}
              onPostComment={handlePostComment}
              onAgreeComment={handleAgreeComment}
              onDropCreated={handleDropCreated}
              onClaimDailyRefill={handleClaimDailyRefill}
              onPurchaseCredits={handlePurchaseCredits}
              onFollowUser={handleFollowUser}
              onUnfollowUser={handleUnfollowUser}
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
