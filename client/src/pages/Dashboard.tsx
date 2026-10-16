import React from 'react';
import {
  User,
  MysteryDrop,
  MovieKingLeader,
  SeasonInfo,
  ScoutActivityNotification,
  AnalyticsTelemetry,
  SystemStatus,
} from '../types';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { MobileNavDrawer } from '../components/MobileNavDrawer';
import { TelemetryHud } from '../components/TelemetryHud';
import { MysteryDropInspector } from '../components/MysteryDropInspector';
import { ActiveRadarQueue } from '../components/ActiveRadarQueue';
import { MovieKingLeaderboard } from '../components/MovieKingLeaderboard';
import { DeconstructionChat } from '../components/DeconstructionChat';
import { DetectiveConsole } from '../components/DetectiveConsole';
import { StumpHivemindCard } from '../components/StumpHivemindCard';
import { DropMysteryModal } from '../components/DropMysteryModal';
import { CreditsRefillModal } from '../components/CreditsRefillModal';
import { ScoutingHubModal } from '../components/ScoutingHubModal';
import { GlobalLeaderboardModal } from '../components/GlobalLeaderboardModal';
import { Bell } from 'lucide-react';

import { canAdministerSeason } from '../config';
interface DashboardProps {
  currentUser: User;
  allUsers: User[];
  drops: MysteryDrop[];
  selectedDropId: string;
  setSelectedDropId: (id: string) => void;
  leaders: MovieKingLeader[];
  season: SeasonInfo | null;
  scoutActivities: ScoutActivityNotification[];
  telemetry: AnalyticsTelemetry | null;
  socketConnected: boolean;
  systemStatus: SystemStatus | null;
  liveToast: { title: string; message: string } | null;
  unreadAlerts: number;
  setUnreadAlerts: React.Dispatch<React.SetStateAction<number>>;
  onUserSwitch: (userId: string) => Promise<void>;
  onLogout: () => void;
  onGuessSubmit: (title: string) => Promise<any>;
  onVoteCandidate: (candidateId: string) => Promise<void>;
  onPostComment: (content: string, timestamp?: string) => Promise<void>;
  onAgreeComment: (commentId: string) => Promise<void>;
  onDropCreated: (dropData: any) => Promise<void>;
  onClaimDailyRefill: () => Promise<void>;
  onPurchaseCredits: (amount: number, packageId: string) => Promise<void>;
  onFollowUser: (handle: string) => Promise<void>;
  onUnfollowUser: (handle: string) => Promise<void>;
  onAdminResetSeason: () => Promise<void>;
}

export const Dashboard: React.FC<DashboardProps> = ({
  currentUser,
  allUsers,
  drops,
  selectedDropId,
  setSelectedDropId,
  leaders,
  season,
  scoutActivities,
  telemetry,
  socketConnected,
  systemStatus,
  liveToast,
  unreadAlerts,
  setUnreadAlerts,
  onUserSwitch,
  onLogout,
  onGuessSubmit,
  onVoteCandidate,
  onPostComment,
  onAgreeComment,
  onDropCreated,
  onClaimDailyRefill,
  onPurchaseCredits,
  onFollowUser,
  onUnfollowUser,
  onAdminResetSeason,
}) => {
  const [activeTab, setActiveTab] = React.useState<'inspector' | 'radar' | 'leaderboard' | 'scouts' | 'console'>(
    'inspector'
  );
  const [isDropModalOpen, setIsDropModalOpen] = React.useState(false);
  const [isCreditsModalOpen, setIsCreditsModalOpen] = React.useState(false);
  const [isScoutingModalOpen, setIsScoutingModalOpen] = React.useState(false);
  const [isGlobalLeaderboardOpen, setIsGlobalLeaderboardOpen] = React.useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = React.useState(false);

  const selectedDrop = drops.find(d => d.id === selectedDropId) || drops[0];

  return (
    <div className="min-h-screen bg-[#070a0e] text-zinc-200 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* Header */}
      <Header
        user={currentUser}
        onOpenDropModal={() => setIsDropModalOpen(true)}
        onOpenCreditsModal={() => setIsCreditsModalOpen(true)}
        onOpenScoutingModal={() => {
          setIsScoutingModalOpen(true);
          setUnreadAlerts(0);
        }}
        onOpenMobileNav={() => setIsMobileNavOpen(true)}
        onUserSwitch={onUserSwitch}
        onLogout={onLogout}
        allUsers={allUsers}
        unreadAlertCount={unreadAlerts}
        socketConnected={socketConnected}
        systemStatus={systemStatus}
      />

      {/* Mobile Nav Drawer */}
      <MobileNavDrawer
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenDropModal={() => setIsDropModalOpen(true)}
        onOpenCreditsModal={() => setIsCreditsModalOpen(true)}
        onOpenScoutingModal={() => {
          setIsScoutingModalOpen(true);
          setUnreadAlerts(0);
        }}
        scoutCount={currentUser.following?.length || 0}
        credits={currentUser.credits || 0}
      />

      {/* Telemetry HUD */}
      <TelemetryHud telemetry={telemetry} />

      {/* Live Toast Alert for Scouts */}
      {liveToast && (
        <div className="fixed top-16 right-4 z-50 p-3 rounded-lg bg-zinc-900 border border-cyan-500 text-cyan-300 font-mono text-xs shadow-2xl flex items-center gap-3 animate-bounce">
          <Bell className="w-4 h-4 text-cyan-400 shrink-0" />
          <div>
            <div className="font-bold">{liveToast.title}</div>
            <div className="text-[11px] text-zinc-300">{liveToast.message}</div>
          </div>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenDropModal={() => setIsDropModalOpen(true)}
          onOpenCreditsModal={() => setIsCreditsModalOpen(true)}
          onOpenScoutingModal={() => {
            setIsScoutingModalOpen(true);
            setUnreadAlerts(0);
          }}
          scoutCount={currentUser.following?.length || 0}
          credits={currentUser.credits || 0}
        />

        {/* Content Viewports */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6">
          <div className="max-w-[1800px] mx-auto space-y-4 sm:space-y-6">
          {/* Top Hivemind Card */}
          <StumpHivemindCard onOpenDropModal={() => setIsDropModalOpen(true)} />

          {activeTab === 'console' ? (
            <div className="space-y-6">
              <DetectiveConsole
                user={currentUser}
                onOpenCreditsModal={() => setIsCreditsModalOpen(true)}
                onOpenScoutingModal={() => setIsScoutingModalOpen(true)}
                systemStatus={systemStatus}
              />
              <MovieKingLeaderboard
                leaders={leaders}
                season={season}
                currentUser={currentUser}
                onOpenGlobalModal={() => setIsGlobalLeaderboardOpen(true)}
                onFollowUser={onFollowUser}
                onUnfollowUser={onUnfollowUser}
                onAdminResetSeason={canAdministerSeason(currentUser) ? onAdminResetSeason : undefined}
              />
            </div>
          ) : activeTab === 'radar' ? (
            <div className="space-y-6">
              <ActiveRadarQueue
                drops={drops}
                selectedDropId={selectedDropId}
                onSelectDrop={id => {
                  setSelectedDropId(id);
                  setActiveTab('inspector');
                }}
                onOpenDropModal={() => setIsDropModalOpen(true)}
              />
            </div>
          ) : activeTab === 'leaderboard' ? (
            <div className="space-y-6">
              <MovieKingLeaderboard
                leaders={leaders}
                season={season}
                currentUser={currentUser}
                onOpenGlobalModal={() => setIsGlobalLeaderboardOpen(true)}
                onFollowUser={onFollowUser}
                onUnfollowUser={onUnfollowUser}
                onAdminResetSeason={canAdministerSeason(currentUser) ? onAdminResetSeason : undefined}
              />
            </div>
          ) : (
            /* Default: Drop Inspector + Radar + Leaderboard */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left/Main Column: Mystery Drop Inspector (8 cols) */}
              <div className="lg:col-span-8 space-y-6">
                {selectedDrop ? (
                  <>
                    <MysteryDropInspector
                      drop={selectedDrop}
                      currentUser={currentUser}
                      onGuessSubmit={onGuessSubmit}
                      onVoteCandidate={onVoteCandidate}
                      onOpenCreditsModal={() => setIsCreditsModalOpen(true)}
                      onOpenAuth={() => {}}
                      onFollowUser={onFollowUser}
                      onUnfollowUser={onUnfollowUser}
                    />

                    <DeconstructionChat
                      comments={selectedDrop.comments}
                      currentUser={currentUser}
                      onPostComment={onPostComment}
                      onAgreeComment={onAgreeComment}
                      onOpenAuth={() => {}}
                    />
                  </>
                ) : (
                  <div className="p-8 text-center text-zinc-500 font-mono">
                    No active mystery drop selected.
                  </div>
                )}
              </div>

              {/* Right Column: Active Radar & MovieKing Leaderboard (4 cols) */}
              <div className="lg:col-span-4 space-y-6">
                <ActiveRadarQueue
                  drops={drops}
                  selectedDropId={selectedDropId}
                  onSelectDrop={id => setSelectedDropId(id)}
                  onOpenDropModal={() => setIsDropModalOpen(true)}
                />

                <MovieKingLeaderboard
                  leaders={leaders}
                  season={season}
                  currentUser={currentUser}
                  onOpenGlobalModal={() => setIsGlobalLeaderboardOpen(true)}
                  onFollowUser={onFollowUser}
                  onUnfollowUser={onUnfollowUser}
                  onAdminResetSeason={canAdministerSeason(currentUser) ? onAdminResetSeason : undefined}
                />
              </div>
            </div>
          )}
          </div>
        </main>
      </div>

      {/* Modals */}
      <DropMysteryModal
        isOpen={isDropModalOpen}
        onClose={() => setIsDropModalOpen(false)}
        currentUser={currentUser}
        onDropCreated={onDropCreated}
        onOpenCreditsModal={() => setIsCreditsModalOpen(true)}
      />

      <CreditsRefillModal
        isOpen={isCreditsModalOpen}
        onClose={() => setIsCreditsModalOpen(false)}
        user={currentUser}
        onClaimDailyRefill={onClaimDailyRefill}
        onPurchaseCredits={onPurchaseCredits}
      />

      <ScoutingHubModal
        isOpen={isScoutingModalOpen}
        onClose={() => setIsScoutingModalOpen(false)}
        currentUser={currentUser}
        allUsers={allUsers}
        activities={scoutActivities}
        onFollowUser={onFollowUser}
        onUnfollowUser={onUnfollowUser}
        onSelectDrop={dropId => {
          setSelectedDropId(dropId);
          setActiveTab('inspector');
        }}
      />

      <GlobalLeaderboardModal
        isOpen={isGlobalLeaderboardOpen}
        onClose={() => setIsGlobalLeaderboardOpen(false)}
        leaders={leaders}
        season={season}
        currentUser={currentUser}
        onFollowUser={onFollowUser}
        onUnfollowUser={onUnfollowUser}
        onAdminResetSeason={canAdministerSeason(currentUser) ? onAdminResetSeason : undefined}
      />
    </div>
  );
};
