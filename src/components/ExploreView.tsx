import { useMemo, useRef, useState } from 'react';
import { Compass, Search, User as UserIcon, X } from 'lucide-react';
import { normalizeDifficulty } from '../lib/difficulty';
import { formatDistance } from '../lib/geo';
import type { PublicProfile, Trek, TrekDifficulty } from '../types/trail';
import { TrekCard } from './TrekCard';

interface ExploreViewProps {
  publicTreks: Trek[];
  publicProfiles: PublicProfile[];
  isSignedIn: boolean;
  isSigningIn?: boolean;
  onStartTrek: () => void;
  onSignIn: () => void;
  onOpenTrek: (trek: Trek) => void;
  onOpenTrekker: (handle: string) => void;
}

const DIFFICULTIES: ('All' | TrekDifficulty)[] = [
  'All',
  'Extreme',
  'Challenging',
  'Moderate',
  'Easy',
];

export function ExploreView({
  publicTreks,
  publicProfiles,
  isSignedIn,
  isSigningIn = false,
  onStartTrek,
  onSignIn,
  onOpenTrek,
  onOpenTrekker,
}: ExploreViewProps) {
  const [difficultyFilter, setDifficultyFilter] = useState<'All' | TrekDifficulty>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const resultsRef = useRef<HTMLElement | null>(null);

  const filteredTreks = useMemo(() => {
    const raw = searchQuery.trim().toLowerCase();
    const handleQuery = raw.replace(/^@+/, '');
    return publicTreks.filter((t) => {
      if (difficultyFilter !== 'All' && normalizeDifficulty(t.difficulty) !== difficultyFilter) {
        return false;
      }
      if (!raw) return true;
      return (
        t.title.toLowerCase().includes(raw) ||
        t.region.toLowerCase().includes(raw) ||
        t.startLocationName.toLowerCase().includes(raw) ||
        t.endLocationName.toLowerCase().includes(raw) ||
        t.ownerName.toLowerCase().includes(raw) ||
        (handleQuery.length > 0 && t.ownerHandle.toLowerCase().includes(handleQuery))
      );
    });
  }, [publicTreks, difficultyFilter, searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const totalDistanceKm = useMemo(
    () => publicTreks.reduce((sum, t) => sum + (t.distanceKm || 0), 0),
    [publicTreks]
  );

  const totalPhotos = useMemo(
    () => publicTreks.reduce((sum, t) => sum + (t.photoCount || 0), 0),
    [publicTreks]
  );

  const activeTrekkers = useMemo(() => {
    const treksByOwner = new Map<string, Trek[]>();
    for (const trek of publicTreks) {
      const list = treksByOwner.get(trek.ownerId) || [];
      list.push(trek);
      treksByOwner.set(trek.ownerId, list);
    }

    return publicProfiles
      .map((person) => {
        const ownerPublicTreks = treksByOwner.get(person.uid) || [];
        const publicCompletedCount = ownerPublicTreks.filter((t) => t.status === 'completed').length;
        const activePublicCount = ownerPublicTreks.filter((t) => t.status === 'active').length;
        const completedCount = Math.max(person.completedTreksCount || 0, publicCompletedCount);
        const totalExpeditions = completedCount + activePublicCount;
        const publicDistance = ownerPublicTreks.reduce((sum, t) => sum + (t.distanceKm || 0), 0);
        const totalDistanceKm = Math.max(person.totalDistanceKm || 0, publicDistance);
        return {
          person,
          completedCount,
          activePublicCount,
          totalExpeditions,
          totalDistanceKm,
        };
      })
      .filter((item) => item.totalExpeditions > 0);
  }, [publicProfiles, publicTreks]);

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-10 sm:space-y-14">
      {/* Top Explore Search Bar */}
      <section aria-label="Search public trips">
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-col sm:flex-row sm:items-center gap-2.5 bg-white border border-[#E2E8F0] focus-within:border-[#4F46E5] focus-within:ring-2 focus-within:ring-[#4F46E5]/10 rounded-2xl p-2 shadow-xs trail-transition"
        >
          <div className="relative flex-1 flex items-center">
            <Search className="w-4 h-4 text-[#4F46E5] absolute left-3.5 pointer-events-none shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search public trips by location, trip title, or @explorer handle..."
              aria-label="Search public trips by location, trip title, or explorer handle"
              className="w-full min-h-[44px] pl-10 pr-10 py-2 text-base sm:text-sm text-[#0F172A] placeholder:text-[#64748B] bg-transparent focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search query"
                className="absolute right-1 min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-xl text-[#475569] hover:text-[#0F172A] hover:bg-[#EEF1FA] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="min-h-[44px] px-5 py-2 text-sm font-medium text-white bg-gradient-to-r from-[#5B21B6] via-[#4F46E5] to-[#2563EB] hover:from-[#4C1D95] hover:via-[#4338CA] hover:to-[#1D4ED8] rounded-xl shadow-sm shadow-indigo-500/15 whitespace-nowrap shrink-0 cursor-pointer trail-transition"
          >
            Search Trips
          </button>
        </form>
        {searchQuery.trim() && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[#475569]">
            <span>
              Showing{' '}
              <span className="font-mono font-semibold tabular-nums text-[#4F46E5]">
                {filteredTreks.length}
              </span>{' '}
              {filteredTreks.length === 1 ? 'matching trip' : 'matching trips'} for &ldquo;
              {searchQuery.trim()}&rdquo;
            </span>
            <button
              type="button"
              onClick={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="font-medium text-[#4F46E5] hover:underline cursor-pointer"
            >
              Jump to results
            </button>
          </div>
        )}
      </section>

      {/* Split-Screen Editorial Hero */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-stretch">
        <div className="lg:col-span-6 flex flex-col justify-between py-1 sm:py-2 lg:py-4 pr-0 lg:pr-4">
          <div className="space-y-4 sm:space-y-5">
            <p className="text-xs font-semibold tracking-wide text-[#4F46E5]">
              For Trekkers, Hikers &amp; Travelers
            </p>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-[#0F172A] leading-[1.08] [text-wrap:balance]">
              Every trail, peak, and journey — mapped and remembered.
            </h1>
            <p className="text-sm sm:text-base text-[#475569] leading-relaxed max-w-xl">
              Set your starting location, pin every stop as you trek, hike, or travel, capture snaps
              and notes along the route, and share a living portfolio of your journeys.
            </p>
          </div>

          <div className="mt-6 sm:mt-8 flex flex-wrap items-center gap-3 sm:gap-4">
            <button
              type="button"
              disabled={!isSignedIn && isSigningIn}
              onClick={isSignedIn ? onStartTrek : onSignIn}
              className="min-h-[44px] px-5 py-3 text-sm font-medium text-white bg-gradient-to-r from-[#5B21B6] via-[#4F46E5] to-[#2563EB] rounded-lg hover:from-[#4C1D95] hover:via-[#4338CA] hover:to-[#1D4ED8] shadow-sm shadow-indigo-500/15 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer trail-transition"
            >
              {isSignedIn
                ? 'Start a New Trip'
                : isSigningIn
                  ? 'Signing in...'
                  : 'Sign in to Start a Trip'}
            </button>
            <a
              href="#public-expeditions"
              className="min-h-[44px] inline-flex items-center px-4 py-3 text-sm font-medium text-[#0F172A] hover:text-[#4F46E5] hover:underline whitespace-nowrap shrink-0"
            >
              Browse Public Trips
            </a>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="w-full h-64 sm:h-96 lg:h-full min-h-[260px] sm:min-h-[340px] rounded-2xl overflow-hidden border border-[#E2E8F0] bg-[#EEF1FA]">
            <img
              src="/src/assets/images/hero_alpine_ridge_1795097603475.jpg"
              alt="Traveler standing on a scenic alpine ridge overlooking mountain valleys at golden hour"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Full-Width 4-Column Metric Strip */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-5 sm:gap-6 py-5 sm:py-6 border-y border-[#E2E8F0]">
        <div>
          <p className="text-xs text-[#475569] mb-1">Public Trips &amp; Treks</p>
          <p className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-[#0F172A]">
            {publicTreks.length}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#475569] mb-1">Explorer Portfolios</p>
          <p className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-[#0F172A]">
            {activeTrekkers.length}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#475569] mb-1">Distance Recorded</p>
          <p className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-[#0F172A]">
            {formatDistance(totalDistanceKm)}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#475569] mb-1">Travel Snaps</p>
          <p className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-[#0F172A]">
            {totalPhotos}
          </p>
        </div>
      </section>

      {/* Public Expeditions Feed */}
      <section ref={resultsRef} id="public-expeditions" className="space-y-6 scroll-mt-24">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-[#0F172A]">
              Public Trip &amp; Trail Logs
            </h2>
            <p className="text-sm text-[#475569] mt-1">
              Click any trip to inspect its interactive route, coordinates, snaps, and travel notes.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#EEF1FA] rounded-lg overflow-x-auto no-scrollbar max-w-full">
            {DIFFICULTIES.map((diff) => (
              <button
                key={diff}
                type="button"
                onClick={() => setDifficultyFilter(diff)}
                className={`min-h-[34px] px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer trail-transition ${
                  difficultyFilter === diff
                    ? 'bg-white text-[#4F46E5] shadow-sm'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                {diff}
              </button>
            ))}
          </div>
        </div>

        {filteredTreks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTreks.map((trek, idx) => (
              <TrekCard
                key={trek.id}
                trek={trek}
                featured={idx === 0 && filteredTreks.length >= 4}
                onOpenTrek={onOpenTrek}
                onOpenTrekker={onOpenTrekker}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 sm:p-10 text-center">
            <Compass className="w-8 h-8 text-[#4F46E5] mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-[#0F172A] mb-1">
              {publicTreks.length === 0
                ? 'Be the first traveler to publish a trip'
                : 'No public trips match this search or filter'}
            </h3>
            <p className="text-sm text-[#475569] max-w-md mx-auto mb-5">
              {publicTreks.length === 0
                ? 'Set your starting point, record locations and photo snaps as you hike, trek, or travel, and share your route publicly.'
                : 'Try searching a different location, trip title, or explorer handle, or reset your filters.'}
            </p>
            {publicTreks.length === 0 ? (
              <button
                type="button"
                disabled={!isSignedIn && isSigningIn}
                onClick={isSignedIn ? onStartTrek : onSignIn}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-[#5B21B6] via-[#4F46E5] to-[#2563EB] rounded-lg hover:from-[#4C1D95] hover:via-[#4338CA] hover:to-[#1D4ED8] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSignedIn
                  ? 'Start First Trip'
                  : isSigningIn
                    ? 'Signing in...'
                    : 'Sign in with Google'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setDifficultyFilter('All');
                }}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-[#4F46E5] bg-[#EEF2FF] hover:bg-[#E0E7FF] border border-[#C7D2FE] rounded-xl cursor-pointer trail-transition"
              >
                Reset Search &amp; Filters
              </button>
            )}
          </div>
        )}
      </section>

      {/* Public Explorer Portfolios Directory */}
      {activeTrekkers.length > 0 && (
        <section className="space-y-6 pt-4 border-t border-[#E2E8F0]">
          <div className="flex items-baseline justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-[#0F172A]">
                Trekkers, Hikers &amp; Travelers
              </h2>
              <p className="text-sm text-[#475569] mt-1">
                Explore complete trip collections and route logs from fellow hikers, trekkers, and travelers.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
            {activeTrekkers.map(({ person, completedCount, activePublicCount, totalDistanceKm: trekkerDist }) => (
              <button
                key={person.uid}
                type="button"
                onClick={() => onOpenTrekker(person.handle)}
                className="text-left bg-white border border-[#E2E8F0] rounded-2xl p-5 hover:border-[#C7D2FE] flex items-start gap-4 active:scale-[0.99] cursor-pointer trail-transition"
              >
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#EEF1FA] shrink-0 flex items-center justify-center border border-[#E2E8F0]">
                  {person.avatarUrl ? (
                    <img
                      src={person.avatarUrl}
                      alt={person.displayName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UserIcon className="w-6 h-6 text-[#4F46E5]" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-[#0F172A] truncate">
                    {person.displayName}
                  </h3>
                  <p className="text-xs text-[#475569] truncate mb-2">
                    @{person.handle}
                    {person.homeBase ? ` · ${person.homeBase}` : ''}
                  </p>
                  <p className="text-xs font-mono tabular-nums text-[#4F46E5]">
                    {completedCount > 0
                      ? `${completedCount} completed${activePublicCount > 0 ? ` · ${activePublicCount} active` : ''}`
                      : `${activePublicCount} active`}{' '}
                    · {formatDistance(trekkerDist)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Editorial Field Workflow Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-6 border-t border-[#E2E8F0] items-center">
        <div className="lg:col-span-5 space-y-6">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-[#0F172A] [text-wrap:balance]">
            Built for the trail and the open road, archived for everyone.
          </h2>

          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-[#0F172A]">
                <span className="text-[#4F46E5] font-mono mr-1.5">01.</span>
                Set Your Start Location
              </h3>
              <p className="text-sm text-[#475569] leading-relaxed mt-1">
                Search any city, park, trailhead, or landmark, tap the map, or lock your device GPS
                to establish your starting coordinate.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#0F172A]">
                <span className="text-[#4F46E5] font-mono mr-1.5">02.</span>
                Record Every Location Reached
              </h3>
              <p className="text-sm text-[#475569] leading-relaxed mt-1">
                Pin each stop, camp, viewpoint, summit, or destination along the way with compressed
                camera snaps, elevation readings, and notes.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#0F172A]">
                <span className="text-[#2563EB] font-mono mr-1.5">03.</span>
                Share Your Public Portfolio
              </h3>
              <p className="text-sm text-[#475569] leading-relaxed mt-1">
                Complete your trip to tally total distance and publish a permanent, shareable link
                to your personal travel &amp; trail portfolio.
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="aspect-[4/3] rounded-2xl overflow-hidden border border-[#E2E8F0] bg-[#EEF1FA]">
            <img
              src="/src/assets/images/editorial_trail_camp_1795097603540.jpg"
              alt="Backcountry tent pitched beside a glacial lake beneath alpine peaks"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="aspect-[4/3] rounded-2xl overflow-hidden border border-[#E2E8F0] bg-[#EEF1FA]">
            <img
              src="/src/assets/images/editorial_field_notes_1795097603547.jpg"
              alt="Field journal, brass compass, and topographic map on granite rock"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
