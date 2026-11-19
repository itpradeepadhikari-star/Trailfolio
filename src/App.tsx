import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { Compass, FolderOpen, Navigation, Trophy, User as UserIcon, X } from 'lucide-react';
import { ActiveTrekWorkspace } from './components/ActiveTrekWorkspace';
import { ExploreView } from './components/ExploreView';
import { ProfileView } from './components/ProfileView';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { PublicPortfolioView } from './components/PublicPortfolioView';
import { RankingView } from './components/RankingView';
import { StartTrekModal } from './components/StartTrekModal';
import { TrekDetailView } from './components/TrekDetailView';
import { auth, googleProvider } from './lib/firebase';
import {
  ensurePublicProfile,
  fetchTrekById,
  getPublicProfileByHandle,
  subscribeMyTreks,
  subscribePublicProfiles,
  subscribePublicTreks,
  subscribeTrekWaypoints,
} from './services/trailService';
import type { PublicProfile, Trek, Waypoint } from './types/trail';

type ViewMode =
  | { kind: 'explore' }
  | { kind: 'ranking' }
  | { kind: 'active'; trekId: string }
  | { kind: 'trekDetail'; trekId: string }
  | { kind: 'publicPortfolio'; handle: string }
  | { kind: 'myPortfolio'; tab: 'portfolio' | 'settings' };

const MAPS_LIBRARIES = ['places', 'marker', 'maps'];

function MapsProviderWrapper({
  apiKey,
  children,
}: {
  apiKey: string;
  children: ReactNode;
}) {
  if (!apiKey) {
    return <>{children}</>;
  }
  return (
    <APIProvider apiKey={apiKey} libraries={MAPS_LIBRARIES} language="en">
      {children}
    </APIProvider>
  );
}

export default function App() {
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [myProfile, setMyProfile] = useState<PublicProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const signInInFlightRef = useRef(false);

  const [publicTreks, setPublicTreks] = useState<Trek[]>([]);
  const [publicProfiles, setPublicProfiles] = useState<PublicProfile[]>([]);
  const [myTreks, setMyTreks] = useState<Trek[]>([]);

  const [view, setView] = useState<ViewMode>({ kind: 'explore' });
  const [backTarget, setBackTarget] = useState<'explore' | 'ranking'>('explore');
  const [showStartModal, setShowStartModal] = useState(false);

  const [directTrek, setDirectTrek] = useState<Trek | null>(null);
  const [directTrekMissing, setDirectTrekMissing] = useState(false);
  const [directProfile, setDirectProfile] = useState<PublicProfile | null>(null);
  const [directProfileMissing, setDirectProfileMissing] = useState(false);
  const [activeWaypoints, setActiveWaypoints] = useState<Waypoint[]>([]);

  // Tier 2 / App-level Google Maps Demo Key quota banner listener
  useEffect(() => {
    const onQuota = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  // Read initial shareable URL params (?trek=..., ?trekker=..., or ?view=ranking)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const trekParam = params.get('trek');
    const trekkerParam = params.get('trekker');
    const viewParam = params.get('view');
    if (trekParam) {
      setView({ kind: 'trekDetail', trekId: trekParam });
    } else if (trekkerParam) {
      setView({ kind: 'publicPortfolio', handle: trekkerParam });
    } else if (viewParam === 'ranking') {
      setView({ kind: 'ranking' });
    }
  }, []);

  // Sync URL query params for shareable links
  const navigateTo = (nextView: ViewMode, from?: 'explore' | 'ranking') => {
    if (from) {
      setBackTarget(from);
    } else if (nextView.kind === 'explore' || nextView.kind === 'ranking') {
      setBackTarget(nextView.kind);
    }
    setView(nextView);
    const url = new URL(window.location.href);
    url.searchParams.delete('trek');
    url.searchParams.delete('trekker');
    url.searchParams.delete('view');
    if (nextView.kind === 'trekDetail') {
      url.searchParams.set('trek', nextView.trekId);
    } else if (nextView.kind === 'publicPortfolio') {
      url.searchParams.set('trekker', nextView.handle);
    } else if (nextView.kind === 'ranking') {
      url.searchParams.set('view', 'ranking');
    }
    window.history.replaceState({}, '', url.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Auth state listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (user) {
        setAuthError(null);
        void ensurePublicProfile(user)
          .then((profile) => setMyProfile(profile))
          .catch((err) => {
            setAuthError(err instanceof Error ? err.message : 'Profile setup failed.');
          });
      } else {
        setMyProfile(null);
        setMyTreks([]);
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to public treks & profiles (no auth required)
  useEffect(() => {
    const unsubTreks = subscribePublicTreks(setPublicTreks);
    const unsubProfiles = subscribePublicProfiles(setPublicProfiles);
    return () => {
      unsubTreks();
      unsubProfiles();
    };
  }, []);

  // Subscribe to signed-in user's own treks
  useEffect(() => {
    if (!authReady || !authUser) return;
    const unsub = subscribeMyTreks(authUser.uid, setMyTreks);
    return () => unsub();
  }, [authReady, authUser]);

  // Resolve selected trek for detail or active workspace
  const selectedTrekId =
    view.kind === 'active' || view.kind === 'trekDetail' ? view.trekId : null;

  const selectedTrek = useMemo(() => {
    if (!selectedTrekId) return null;
    return (
      myTreks.find((t) => t.id === selectedTrekId) ||
      publicTreks.find((t) => t.id === selectedTrekId) ||
      (directTrek?.id === selectedTrekId ? directTrek : null)
    );
  }, [selectedTrekId, myTreks, publicTreks, directTrek]);

  useEffect(() => {
    if (!selectedTrekId) {
      setDirectTrekMissing(false);
      return;
    }
    if (selectedTrek) {
      setDirectTrekMissing(false);
      return;
    }
    let active = true;
    setDirectTrekMissing(false);
    void fetchTrekById(selectedTrekId)
      .then((fetched) => {
        if (!active) return;
        if (fetched) {
          setDirectTrek(fetched);
        } else {
          setDirectTrekMissing(true);
        }
      })
      .catch(() => {
        if (active) setDirectTrekMissing(true);
      });
    return () => {
      active = false;
    };
  }, [selectedTrekId, selectedTrek]);

  // Subscribe to waypoints of currently open trek
  useEffect(() => {
    if (!selectedTrek) {
      setActiveWaypoints([]);
      return;
    }
    const isOwnerViewing = Boolean(authUser && authUser.uid === selectedTrek.ownerId);
    const unsub = subscribeTrekWaypoints(
      selectedTrek.id,
      isOwnerViewing,
      authUser?.uid ?? null,
      setActiveWaypoints
    );
    return () => unsub();
  }, [selectedTrek, authUser]);

  // Resolve public profile when viewing a trekker handle
  const viewedHandle = view.kind === 'publicPortfolio' ? view.handle : null;
  const viewedProfile = useMemo(() => {
    if (!viewedHandle) return null;
    return (
      publicProfiles.find((p) => p.handle === viewedHandle.toLowerCase()) ||
      (directProfile?.handle === viewedHandle.toLowerCase() ? directProfile : null)
    );
  }, [viewedHandle, publicProfiles, directProfile]);

  useEffect(() => {
    if (!viewedHandle || viewedProfile) {
      setDirectProfileMissing(false);
      return;
    }
    let active = true;
    setDirectProfileMissing(false);
    void getPublicProfileByHandle(viewedHandle)
      .then((found) => {
        if (!active) return;
        if (found) {
          setDirectProfile(found);
        } else {
          setDirectProfileMissing(true);
        }
      })
      .catch(() => {
        if (active) setDirectProfileMissing(true);
      });
    return () => {
      active = false;
    };
  }, [viewedHandle, viewedProfile]);

  const latestActiveTrek = useMemo(
    () => myTreks.find((t) => t.status === 'active') || null,
    [myTreks]
  );

  const handleSignIn = async () => {
    if (signInInFlightRef.current) return;
    signInInFlightRef.current = true;
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/popup-closed-by-user'
      ) {
        return;
      }
      if (code === 'auth/popup-blocked') {
        setAuthError(
          'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.'
        );
      } else if (code === 'auth/unauthorized-domain') {
        setAuthError(
          'This domain is not authorized for Google Sign-In in Firebase Authentication settings.'
        );
      } else {
        setAuthError(
          err instanceof Error ? err.message : 'Unable to complete Google sign-in.'
        );
      }
    } finally {
      signInInFlightRef.current = false;
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    navigateTo({ kind: 'explore' });
  };

  const handleOpenActiveTab = () => {
    if (!authUser) {
      void handleSignIn();
      return;
    }
    if (latestActiveTrek) {
      navigateTo({ kind: 'active', trekId: latestActiveTrek.id });
    } else {
      setShowStartModal(true);
    }
  };

  const handleOpenMyPortfolio = (tab: 'portfolio' | 'settings') => {
    if (!authUser) {
      void handleSignIn();
      return;
    }
    navigateTo({ kind: 'myPortfolio', tab });
  };

  return (
    <MapsProviderWrapper apiKey={mapsApiKey}>
      <div className="min-h-screen flex flex-col bg-[#F6F7FB] text-[#0F172A] pb-20 md:pb-0">
        {/* Top Bar Contract: 3 zones, single-line */}
        <header className="sticky top-0 z-30 bg-[#F6F7FB]/90 backdrop-blur-md border-b border-[#E2E8F0]">
          {mapsQuotaExceeded && (
            <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-xs md:text-sm text-center">
              <span>
                Google Maps Platform quota reached. If you are the app owner, visit{' '}
                <a
                  href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold text-amber-950 hover:text-amber-800"
                >
                  maps developer site
                </a>{' '}
                for instructions to update your account.
              </span>
            </div>
          )}
          <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4 md:gap-8">
            {/* Zone 1: Single text element wordmark */}
            <button
              type="button"
              onClick={() => navigateTo({ kind: 'explore' })}
              className="text-lg font-bold tracking-tight text-[#0F172A] hover:text-[#4F46E5] whitespace-nowrap shrink-0 cursor-pointer trail-transition"
            >
              Trailfolio
            </button>

            {/* Zone 2: 5 clean single-line navigation links */}
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#475569]">
              <button
                type="button"
                onClick={() => navigateTo({ kind: 'explore' })}
                className={`hover:text-[#0F172A] whitespace-nowrap shrink-0 cursor-pointer py-1 border-b-2 trail-transition ${
                  view.kind === 'explore'
                    ? 'text-[#0F172A] border-[#4F46E5]'
                    : 'border-transparent'
                }`}
              >
                Explore
              </button>
              <button
                type="button"
                onClick={() => navigateTo({ kind: 'ranking' })}
                className={`hover:text-[#0F172A] whitespace-nowrap shrink-0 cursor-pointer py-1 border-b-2 trail-transition ${
                  view.kind === 'ranking'
                    ? 'text-[#0F172A] border-[#4F46E5]'
                    : 'border-transparent'
                }`}
              >
                Ranking
              </button>
              <button
                type="button"
                onClick={handleOpenActiveTab}
                className={`hover:text-[#0F172A] whitespace-nowrap shrink-0 cursor-pointer py-1 border-b-2 trail-transition ${
                  view.kind === 'active'
                    ? 'text-[#0F172A] border-[#4F46E5]'
                    : 'border-transparent'
                }`}
              >
                Active Trip
              </button>
              <button
                type="button"
                onClick={() => handleOpenMyPortfolio('portfolio')}
                className={`hover:text-[#0F172A] whitespace-nowrap shrink-0 cursor-pointer py-1 border-b-2 trail-transition ${
                  view.kind === 'myPortfolio' && view.tab === 'portfolio'
                    ? 'text-[#0F172A] border-[#4F46E5]'
                    : 'border-transparent'
                }`}
              >
                My Portfolio
              </button>
              <button
                type="button"
                onClick={() => handleOpenMyPortfolio('settings')}
                className={`hover:text-[#0F172A] whitespace-nowrap shrink-0 cursor-pointer py-1 border-b-2 trail-transition ${
                  view.kind === 'myPortfolio' && view.tab === 'settings'
                    ? 'text-[#0F172A] border-[#4F46E5]'
                    : 'border-transparent'
                }`}
              >
                Profile
              </button>
            </nav>

            {/* Zone 3: Install App (mobile/installable) + 1 primary action */}
            <div className="flex items-center gap-2 shrink-0">
              <PWAInstallButton variant="header" />
              {authUser ? (
                <button
                  type="button"
                  onClick={() => setShowStartModal(true)}
                  className="px-4 min-h-[40px] py-2 text-xs font-medium text-white bg-gradient-to-r from-[#5B21B6] via-[#4F46E5] to-[#2563EB] hover:from-[#4C1D95] hover:via-[#4338CA] hover:to-[#1D4ED8] rounded-xl shadow-sm shadow-indigo-500/15 whitespace-nowrap shrink-0 cursor-pointer trail-transition"
                >
                  Start Trip
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSigningIn}
                  onClick={() => void handleSignIn()}
                  className="px-4 min-h-[40px] py-2 text-xs font-medium text-white bg-gradient-to-r from-[#5B21B6] via-[#4F46E5] to-[#2563EB] hover:from-[#4C1D95] hover:via-[#4338CA] hover:to-[#1D4ED8] rounded-xl shadow-sm shadow-indigo-500/15 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer trail-transition"
                >
                  {isSigningIn ? 'Signing in...' : 'Sign In'}
                </button>
              )}
            </div>
          </div>
        </header>

        {authError && (
          <div className="max-w-[1280px] mx-auto w-full px-4 sm:px-6 pt-4">
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between gap-3">
            <span>{authError}</span>
            <button
              type="button"
              onClick={() => setAuthError(null)}
              aria-label="Dismiss authentication message"
              className="text-red-700 hover:text-red-900 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <main className="flex-1">
        {view.kind === 'explore' && (
          <ExploreView
            publicTreks={publicTreks}
            publicProfiles={publicProfiles}
            isSignedIn={Boolean(authUser)}
            isSigningIn={isSigningIn}
            onStartTrek={() => setShowStartModal(true)}
            onSignIn={() => void handleSignIn()}
            onOpenTrek={(trek) => navigateTo({ kind: 'trekDetail', trekId: trek.id }, 'explore')}
            onOpenTrekker={(handle) =>
              navigateTo({ kind: 'publicPortfolio', handle }, 'explore')
            }
          />
        )}

        {view.kind === 'ranking' && (
          <RankingView
            publicProfiles={publicProfiles}
            publicTreks={publicTreks}
            onOpenTrek={(trek) => navigateTo({ kind: 'trekDetail', trekId: trek.id }, 'ranking')}
            onOpenTrekker={(handle) =>
              navigateTo({ kind: 'publicPortfolio', handle }, 'ranking')
            }
          />
        )}

        {view.kind === 'active' && selectedTrek && (
          <ActiveTrekWorkspace
            trek={selectedTrek}
            waypoints={activeWaypoints}
            onFinished={(trekId) => navigateTo({ kind: 'trekDetail', trekId })}
            onBackToPortfolio={() => handleOpenMyPortfolio('portfolio')}
          />
        )}

        {view.kind === 'active' && !selectedTrek && (
          <div className="max-w-lg mx-auto px-6 py-20 text-center">
            <p className="text-sm text-[#475569] mb-4">Loading active trip...</p>
            <button
              type="button"
              onClick={() => navigateTo({ kind: 'explore' })}
              className="text-xs font-medium text-[#4F46E5] underline cursor-pointer"
            >
              Return to Explore
            </button>
          </div>
        )}

        {view.kind === 'trekDetail' && selectedTrek && (
          <TrekDetailView
            trek={selectedTrek}
            waypoints={activeWaypoints}
            isOwner={Boolean(authUser && authUser.uid === selectedTrek.ownerId)}
            onBack={() => navigateTo({ kind: backTarget })}
            onResumeActive={(trekId) => navigateTo({ kind: 'active', trekId })}
            onOpenTrekker={(handle) => navigateTo({ kind: 'publicPortfolio', handle })}
            onDeleted={() => handleOpenMyPortfolio('portfolio')}
          />
        )}

        {view.kind === 'trekDetail' && !selectedTrek && (
          <div className="max-w-lg mx-auto px-6 py-20 text-center">
            <p className="text-sm text-[#475569] mb-4">
              {directTrekMissing
                ? 'This trip could not be found or is set to private.'
                : 'Loading trip record...'}
            </p>
            <button
              type="button"
              onClick={() => navigateTo({ kind: backTarget })}
              className="text-xs font-medium text-[#4F46E5] underline cursor-pointer"
            >
              Return to {backTarget === 'ranking' ? 'Ranking' : 'Explore'}
            </button>
          </div>
        )}

        {view.kind === 'publicPortfolio' && viewedProfile && (
          <PublicPortfolioView
            profile={viewedProfile}
            treks={publicTreks}
            backLabel={backTarget === 'ranking' ? 'Back to Ranking' : 'Back to Explore'}
            onBack={() => navigateTo({ kind: backTarget })}
            onOpenTrek={(trek) => navigateTo({ kind: 'trekDetail', trekId: trek.id })}
          />
        )}

        {view.kind === 'publicPortfolio' && !viewedProfile && (
          <div className="max-w-lg mx-auto px-6 py-20 text-center">
            <p className="text-sm text-[#475569] mb-4">
              {directProfileMissing
                ? 'This explorer portfolio could not be found.'
                : 'Loading explorer portfolio...'}
            </p>
            <button
              type="button"
              onClick={() => navigateTo({ kind: backTarget })}
              className="text-xs font-medium text-[#4F46E5] underline cursor-pointer"
            >
              Return to {backTarget === 'ranking' ? 'Ranking' : 'Explore'}
            </button>
          </div>
        )}

        {view.kind === 'myPortfolio' && myProfile && (
          <ProfileView
            profile={myProfile}
            myTreks={myTreks}
            initialTab={view.tab}
            onStartTrek={() => setShowStartModal(true)}
            onOpenTrek={(trek) => navigateTo({ kind: 'trekDetail', trekId: trek.id })}
            onResumeActive={(trekId) => navigateTo({ kind: 'active', trekId })}
            onPreviewPublic={(handle) => navigateTo({ kind: 'publicPortfolio', handle })}
            onProfileUpdated={setMyProfile}
            onSignOut={() => void handleSignOut()}
          />
        )}

        {view.kind === 'myPortfolio' && !myProfile && (
          <div className="max-w-lg mx-auto px-6 py-20 text-center space-y-4">
            <p className="text-sm text-[#475569]">
              {authUser
                ? 'Setting up your explorer profile...'
                : 'Sign in with Google to view and manage your portfolio.'}
            </p>
            <button
              type="button"
              onClick={() => navigateTo({ kind: 'explore' })}
              className="text-xs font-medium text-[#4F46E5] underline cursor-pointer"
            >
              Return to Explore
            </button>
          </div>
        )}
      </main>

      <footer className="border-t border-[#E2E8F0] mt-16">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#475569]">
          <span>Trailfolio · Trip Portfolios for Trekkers, Hikers &amp; Travelers</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigateTo({ kind: 'explore' })}
              className="hover:text-[#0F172A] cursor-pointer"
            >
              Explore
            </button>
            <button
              type="button"
              onClick={() => navigateTo({ kind: 'ranking' })}
              className="hover:text-[#0F172A] cursor-pointer"
            >
              Ranking
            </button>
            <PWAInstallButton variant="footer" />
            <a
              href="https://cloud.google.com/maps-platform/terms?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#0F172A]"
            >
              Google Maps Terms
            </a>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Tab Bar — Thumb-zone navigation */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E2E8F0] grid grid-cols-5"
      >
        <button
          type="button"
          onClick={() => navigateTo({ kind: 'explore' })}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[54px] py-1.5 text-[11px] font-medium cursor-pointer trail-transition ${
            view.kind === 'explore' ? 'text-[#4F46E5]' : 'text-[#475569]'
          }`}
        >
          <Compass className="w-4 h-4" />
          <span>Explore</span>
        </button>
        <button
          type="button"
          onClick={() => navigateTo({ kind: 'ranking' })}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[54px] py-1.5 text-[11px] font-medium cursor-pointer trail-transition ${
            view.kind === 'ranking' ? 'text-[#4F46E5]' : 'text-[#475569]'
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span>Ranking</span>
        </button>
        <button
          type="button"
          onClick={handleOpenActiveTab}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[54px] py-1.5 text-[11px] font-medium cursor-pointer trail-transition ${
            view.kind === 'active' ? 'text-[#4F46E5]' : 'text-[#475569]'
          }`}
        >
          <Navigation className="w-4 h-4" />
          <span>Active</span>
        </button>
        <button
          type="button"
          onClick={() => handleOpenMyPortfolio('portfolio')}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[54px] py-1.5 text-[11px] font-medium cursor-pointer trail-transition ${
            view.kind === 'myPortfolio' && view.tab === 'portfolio'
              ? 'text-[#4F46E5]'
              : 'text-[#475569]'
          }`}
        >
          <FolderOpen className="w-4 h-4" />
          <span>Portfolio</span>
        </button>
        <button
          type="button"
          onClick={() => handleOpenMyPortfolio('settings')}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[54px] py-1.5 text-[11px] font-medium cursor-pointer trail-transition ${
            view.kind === 'myPortfolio' && view.tab === 'settings'
              ? 'text-[#4F46E5]'
              : 'text-[#475569]'
          }`}
        >
          <UserIcon className="w-4 h-4" />
          <span>Profile</span>
        </button>
      </nav>

      {showStartModal && myProfile && (
        <StartTrekModal
          profile={myProfile}
          onClose={() => setShowStartModal(false)}
          onCreated={(trekId) => {
            setShowStartModal(false);
            navigateTo({ kind: 'active', trekId });
          }}
        />
      )}

      {showStartModal && !myProfile && (
        <div className="fixed inset-0 z-50 bg-[#090D16]/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-t-3xl sm:rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <h2 className="text-lg font-semibold text-[#0F172A]">Preparing Profile</h2>
            <p className="text-sm text-[#475569]">
              {authUser
                ? 'Your explorer profile is still loading. Please wait a moment and try again.'
                : 'Sign in with Google to start logging a new trip.'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowStartModal(false)}
                className="px-4 min-h-[40px] py-2 text-xs font-medium text-[#0F172A] bg-[#EEF1FA] rounded-xl hover:bg-[#E2E8F0] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <OfflineIndicator />
      </div>
    </MapsProviderWrapper>
  );
}
