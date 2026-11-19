import { Fragment, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Compass,
  Map as MapIcon,
  Search,
  User as UserIcon,
} from 'lucide-react';
import {
  formatCoords,
  formatDistance,
  formatElevation,
  formatTimestamp,
  formatTimestampTime,
} from '../lib/geo';
import { fetchPublicTrekWaypoints } from '../services/trailService';
import type { PublicProfile, Trek, Waypoint } from '../types/trail';
import { TrailMap } from './maps/TrailMap';
import { PhotoLightbox, type LightboxItem } from './PhotoLightbox';

interface RankingViewProps {
  publicProfiles: PublicProfile[];
  publicTreks: Trek[];
  onOpenTrek: (trek: Trek) => void;
  onOpenTrekker: (handle: string) => void;
}

type SortCriterion = 'travels' | 'distance' | 'elevation';

interface RankedTraveler {
  profile: PublicProfile;
  publicTreks: Trek[];
  completedCount: number;
  activePublicCount: number;
  privateCompletedCount: number;
  totalTravelsCount: number;
  totalDistanceKm: number;
  highestElevationM: number;
  totalWaypoints: number;
  totalPhotos: number;
  travelRank: number;
}

export function RankingView({
  publicProfiles,
  publicTreks,
  onOpenTrek,
  onOpenTrekker,
}: RankingViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortCriterion>('travels');

  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [expandedTrekId, setExpandedTrekId] = useState<string | null>(null);
  const [selectedWpByTrek, setSelectedWpByTrek] = useState<Record<string, string | null>>({});

  const [waypointsCache, setWaypointsCache] = useState<Record<string, Waypoint[]>>({});
  const [loadingTrekId, setLoadingTrekId] = useState<string | null>(null);
  const [waypointErrors, setWaypointErrors] = useState<Record<string, string>>({});

  const [lightboxState, setLightboxState] = useState<{
    items: LightboxItem[];
    index: number;
  } | null>(null);

  const rankedTravelers = useMemo(() => {
    const treksByOwner = new Map<string, Trek[]>();
    for (const trek of publicTreks) {
      const list = treksByOwner.get(trek.ownerId) || [];
      list.push(trek);
      treksByOwner.set(trek.ownerId, list);
    }

    const profileMap = new Map<string, PublicProfile>();
    for (const profile of publicProfiles) {
      profileMap.set(profile.uid, profile);
    }

    // Ensure any public trek owner without a loaded profile still appears cleanly
    for (const [ownerId, ownerTreks] of treksByOwner.entries()) {
      if (!profileMap.has(ownerId) && ownerTreks.length > 0) {
        const sample = ownerTreks[0];
        profileMap.set(ownerId, {
          uid: ownerId,
          displayName: sample.ownerName,
          handle: sample.ownerHandle,
          bio: '',
          homeBase: '',
          avatarUrl: '',
          completedTreksCount: ownerTreks.filter((t) => t.status === 'completed').length,
          totalDistanceKm: ownerTreks.reduce((sum, t) => sum + (t.distanceKm || 0), 0),
          createdAt: null,
          updatedAt: null,
        });
      }
    }

    const entries: Omit<RankedTraveler, 'travelRank'>[] = [];

    for (const profile of profileMap.values()) {
      const ownerPublicTreks = [...(treksByOwner.get(profile.uid) || [])].sort((a, b) => {
        const aTime = a.completedAt?.toMillis?.() ?? a.updatedAt?.toMillis?.() ?? 0;
        const bTime = b.completedAt?.toMillis?.() ?? b.updatedAt?.toMillis?.() ?? 0;
        return bTime - aTime;
      });

      const publicCompleted = ownerPublicTreks.filter((t) => t.status === 'completed');
      const publicActive = ownerPublicTreks.filter((t) => t.status === 'active');

      const completedCount = Math.max(profile.completedTreksCount || 0, publicCompleted.length);
      const activePublicCount = publicActive.length;
      const privateCompletedCount = Math.max(0, completedCount - publicCompleted.length);
      const totalTravelsCount = completedCount + activePublicCount;

      if (totalTravelsCount === 0) {
        continue;
      }

      const publicDistanceKm = ownerPublicTreks.reduce((sum, t) => sum + (t.distanceKm || 0), 0);
      const totalDistanceKm = Math.max(profile.totalDistanceKm || 0, publicDistanceKm);

      const highestElevationM = ownerPublicTreks.reduce(
        (max, t) => (t.maxElevationM && t.maxElevationM > max ? t.maxElevationM : max),
        0
      );
      const totalWaypoints = ownerPublicTreks.reduce((sum, t) => sum + (t.waypointCount || 0), 0);
      const totalPhotos = ownerPublicTreks.reduce((sum, t) => sum + (t.photoCount || 0), 0);

      entries.push({
        profile,
        publicTreks: ownerPublicTreks,
        completedCount,
        activePublicCount,
        privateCompletedCount,
        totalTravelsCount,
        totalDistanceKm,
        highestElevationM,
        totalWaypoints,
        totalPhotos,
      });
    }

    // Primary canonical rank by number of travels descending
    const sortedByTravels = [...entries].sort((a, b) => {
      if (b.totalTravelsCount !== a.totalTravelsCount) {
        return b.totalTravelsCount - a.totalTravelsCount;
      }
      if (b.totalDistanceKm !== a.totalDistanceKm) {
        return b.totalDistanceKm - a.totalDistanceKm;
      }
      if (b.publicTreks.length !== a.publicTreks.length) {
        return b.publicTreks.length - a.publicTreks.length;
      }
      if (b.totalPhotos !== a.totalPhotos) {
        return b.totalPhotos - a.totalPhotos;
      }
      return a.profile.displayName.localeCompare(b.profile.displayName);
    });

    return sortedByTravels.map((entry, idx) => ({
      ...entry,
      travelRank: idx + 1,
    }));
  }, [publicProfiles, publicTreks]);

  const displayedTravelers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = rankedTravelers.filter((entry) => {
      if (!q) return true;
      return (
        entry.profile.displayName.toLowerCase().includes(q) ||
        entry.profile.handle.toLowerCase().includes(q) ||
        entry.profile.homeBase.toLowerCase().includes(q) ||
        entry.publicTreks.some(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.region.toLowerCase().includes(q) ||
            t.startLocationName.toLowerCase().includes(q) ||
            t.endLocationName.toLowerCase().includes(q)
        )
      );
    });

    if (sortBy === 'travels') {
      return filtered;
    }

    return [...filtered].sort((a, b) => {
      if (sortBy === 'distance') {
        if (b.totalDistanceKm !== a.totalDistanceKm) {
          return b.totalDistanceKm - a.totalDistanceKm;
        }
      } else if (sortBy === 'elevation') {
        if (b.highestElevationM !== a.highestElevationM) {
          return b.highestElevationM - a.highestElevationM;
        }
      }
      return a.travelRank - b.travelRank;
    });
  }, [rankedTravelers, searchQuery, sortBy]);

  const aggregateStats = useMemo(() => {
    const totalTravels = rankedTravelers.reduce((sum, e) => sum + e.totalTravelsCount, 0);
    const totalDistanceKm = rankedTravelers.reduce((sum, e) => sum + e.totalDistanceKm, 0);
    const totalSnaps = publicTreks.reduce((sum, t) => sum + (t.photoCount || 0), 0);
    return {
      travelerCount: rankedTravelers.length,
      totalTravels,
      totalDistanceKm,
      totalSnaps,
    };
  }, [rankedTravelers, publicTreks]);

  const toggleExpandTraveler = (uid: string) => {
    setExpandedUid((prev) => (prev === uid ? null : uid));
  };

  const handleToggleRouteDetails = async (trek: Trek) => {
    if (expandedTrekId === trek.id) {
      setExpandedTrekId(null);
      return;
    }
    setExpandedTrekId(trek.id);

    if (waypointsCache[trek.id] || loadingTrekId === trek.id) {
      return;
    }

    setLoadingTrekId(trek.id);
    setWaypointErrors((prev) => {
      const next = { ...prev };
      delete next[trek.id];
      return next;
    });

    try {
      const wps = await fetchPublicTrekWaypoints(trek.id);
      setWaypointsCache((prev) => ({ ...prev, [trek.id]: wps }));
    } catch (err) {
      setWaypointErrors((prev) => ({
        ...prev,
        [trek.id]:
          err instanceof Error ? err.message : 'Unable to load public waypoints for this trek.',
      }));
    } finally {
      setLoadingTrekId(null);
    }
  };

  const openTrekPhotoLightbox = (trekId: string, photoUrl: string, waypoint: Waypoint) => {
    const wps = waypointsCache[trekId] || [];
    const items: LightboxItem[] = wps.flatMap((wp) =>
      (wp.photos || []).map((url) => ({ photoUrl: url, waypoint: wp }))
    );
    const idx = items.findIndex(
      (item) => item.photoUrl === photoUrl && item.waypoint.id === waypoint.id
    );
    setLightboxState({
      items: items.length > 0 ? items : [{ photoUrl, waypoint }],
      index: idx >= 0 ? idx : 0,
    });
  };

  const renderExpandedTravelerLedger = (entry: RankedTraveler) => (
    <div className="bg-[#F6F7FB] px-4 sm:px-6 py-5 sm:py-6 space-y-5 border-t border-[#E2E8F0]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <p className="text-xs font-medium text-[#4F46E5]">
            Public Trip Ledger · @{entry.profile.handle}
          </p>
          <h3 className="text-lg font-semibold text-[#0F172A]">
            {entry.profile.displayName}&apos;s Recorded Trips ({entry.publicTreks.length} public)
          </h3>
          {entry.profile.bio && (
            <p className="text-xs text-[#475569] leading-relaxed">{entry.profile.bio}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => onOpenTrekker(entry.profile.handle)}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[40px] py-2 text-xs font-medium text-[#0F172A] bg-white border border-[#E2E8F0] rounded-xl hover:border-[#4F46E5] hover:text-[#4F46E5] whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto trail-transition"
        >
          <span>Open Full Portfolio</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {entry.publicTreks.length > 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl divide-y divide-[#E2E8F0] overflow-hidden shadow-xs">
          {entry.publicTreks.map((trek) => {
            const isRouteOpen = expandedTrekId === trek.id;
            const cachedWaypoints = waypointsCache[trek.id] || [];
            const isLoadingWps = loadingTrekId === trek.id;
            const wpError = waypointErrors[trek.id];
            const selectedWpId = selectedWpByTrek[trek.id] ?? null;

            return (
              <div key={trek.id} className="p-4 sm:p-5 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className="w-20 h-18 sm:w-24 sm:h-20 rounded-xl overflow-hidden bg-[#EEF1FA] border border-[#E2E8F0] shrink-0 flex items-center justify-center">
                      {trek.coverPhotoDataUrl ? (
                        <img
                          src={trek.coverPhotoDataUrl}
                          alt={trek.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Compass className="w-6 h-6 text-[#4F46E5]" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="space-y-0.5">
                        <p className="text-xs text-[#475569]">
                          <span>{trek.region}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{trek.difficulty}</span>
                          <span aria-hidden="true"> · </span>
                          <span className={trek.status === 'active' ? 'text-[#2563EB] font-medium' : ''}>
                            {trek.status === 'completed' ? 'Completed' : 'In Progress'}
                          </span>
                          <span aria-hidden="true"> · </span>
                          <span>
                            {trek.completedAt
                              ? `Finished ${formatTimestamp(trek.completedAt)}`
                              : `Started ${formatTimestamp(trek.startedAt)}`}
                          </span>
                        </p>
                        <h4 className="text-base font-semibold text-[#0F172A] leading-snug">
                          {trek.title}
                        </h4>
                      </div>

                      {trek.summary && (
                        <p className="text-xs text-[#475569] leading-relaxed max-w-3xl">
                          {trek.summary}
                        </p>
                      )}

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 pt-1 text-xs">
                        <div>
                          <span className="text-[#475569] block">Start Location</span>
                          <span className="font-medium text-[#0F172A] block truncate">
                            {trek.startLocationName}
                          </span>
                          <span className="font-mono text-[11px] text-[#475569] tabular-nums">
                            {formatCoords(trek.startLat, trek.startLng)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#475569] block">
                            {trek.status === 'completed' ? 'Final Reached' : 'Latest Point'}
                          </span>
                          <span className="font-medium text-[#0F172A] block truncate">
                            {trek.endLocationName || trek.startLocationName}
                          </span>
                          <span className="font-mono text-[11px] text-[#475569] tabular-nums">
                            {formatCoords(trek.endLat, trek.endLng)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#475569] block">Distance &amp; Peak</span>
                          <span className="font-mono tabular-nums font-medium text-[#0F172A]">
                            {formatDistance(trek.distanceKm)} · {formatElevation(trek.maxElevationM)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#475569] block">Stops &amp; Snaps</span>
                          <span className="font-mono tabular-nums font-medium text-[#0F172A]">
                            {trek.waypointCount} pts · {trek.photoCount} snaps
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap lg:flex-col items-center lg:items-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleToggleRouteDetails(trek)}
                      className={`inline-flex items-center gap-1.5 px-3.5 min-h-[40px] py-2 text-xs font-medium rounded-xl border whitespace-nowrap shrink-0 cursor-pointer trail-transition ${
                        isRouteOpen
                          ? 'bg-gradient-to-r from-[#5B21B6] via-[#4F46E5] to-[#2563EB] text-white border-transparent shadow-xs'
                          : 'bg-white text-[#0F172A] border-[#E2E8F0] hover:border-[#4F46E5] hover:text-[#4F46E5]'
                      }`}
                    >
                      <MapIcon className="w-3.5 h-3.5" />
                      <span>{isRouteOpen ? 'Hide Route & Notes' : 'Route & Notes'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenTrek(trek)}
                      className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] py-2 text-xs font-medium text-[#4F46E5] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Full Trip Page</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isRouteOpen && (
                  <div className="pt-4 border-t border-[#E2E8F0] space-y-5">
                    {isLoadingWps && (
                      <p className="text-xs text-[#475569]">
                        Loading route coordinates, field notes, and snaps...
                      </p>
                    )}

                    {wpError && (
                      <p className="text-xs text-red-700">{wpError}</p>
                    )}

                    {!isLoadingWps && !wpError && cachedWaypoints.length > 0 && (
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                        <div className="lg:col-span-6">
                          <TrailMap
                            waypoints={cachedWaypoints}
                            selectedWaypointId={selectedWpId}
                            onSelectWaypoint={(wp) =>
                              setSelectedWpByTrek((prev) => ({
                                ...prev,
                                [trek.id]: wp?.id ?? null,
                              }))
                            }
                            onPhotoClick={(photoUrl, wp) =>
                              openTrekPhotoLightbox(trek.id, photoUrl, wp)
                            }
                            heightClassName="h-[240px] sm:h-[300px]"
                          />
                        </div>

                        <div className="lg:col-span-6 space-y-3 max-h-[300px] overflow-y-auto pr-1">
                          {cachedWaypoints.map((wp, idx) => (
                            <div
                              key={wp.id}
                              onClick={() =>
                                setSelectedWpByTrek((prev) => ({
                                  ...prev,
                                  [trek.id]: wp.id,
                                }))
                              }
                              className={`p-3.5 rounded-xl border cursor-pointer trail-transition ${
                                selectedWpId === wp.id
                                  ? 'bg-[#EEF2FF] border-[#4F46E5]'
                                  : 'bg-white border-[#E2E8F0] hover:border-[#C7D2FE]'
                              }`}
                            >
                              <div className="flex items-baseline justify-between gap-3">
                                <h5 className="text-sm font-semibold text-[#0F172A]">
                                  <span className="font-mono text-xs text-[#4F46E5] mr-2">
                                    #{idx + 1}
                                  </span>
                                  {wp.name}
                                </h5>
                                <span className="text-[11px] font-mono tabular-nums text-[#475569] shrink-0">
                                  {formatElevation(wp.elevationM)}
                                </span>
                              </div>

                              <p className="text-[11px] font-mono tabular-nums text-[#475569] mt-0.5">
                                {wp.category} · {formatCoords(wp.lat, wp.lng)} ·{' '}
                                {formatTimestampTime(wp.reachedAt)}
                              </p>

                              {wp.note && (
                                <p className="text-xs text-[#334155] leading-relaxed mt-2">
                                  {wp.note}
                                </p>
                              )}

                              {wp.photos && wp.photos.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2.5">
                                  {wp.photos.map((photo, pIdx) => (
                                    <button
                                      key={`${wp.id}-p-${pIdx}`}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openTrekPhotoLightbox(trek.id, photo, wp);
                                      }}
                                      className="w-16 h-12 rounded-lg overflow-hidden border border-[#E2E8F0] bg-[#EEF1FA] cursor-pointer"
                                    >
                                      <img
                                        src={photo}
                                        alt={`${wp.name} snap ${pIdx + 1}`}
                                        referrerPolicy="no-referrer"
                                        className="w-full h-full object-cover"
                                      />
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {!isLoadingWps && !wpError && cachedWaypoints.length === 0 && (
                      <p className="text-xs text-[#475569]">
                        No public waypoint coordinates logged for this trip yet.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 text-center">
          <p className="text-xs text-[#475569]">
            {entry.profile.displayName} has not published any public travels yet.
          </p>
        </div>
      )}

      {entry.privateCompletedCount > 0 && (
        <p className="text-xs text-[#475569]">
          {entry.privateCompletedCount} additional completed trip
          {entry.privateCompletedCount === 1 ? ' is' : 's are'} kept private by this explorer.
        </p>
      )}
    </div>
  );

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8 sm:space-y-10">
      {/* Page Title & Lead */}
      <section className="space-y-3 sm:space-y-4">
        <p className="text-xs font-semibold tracking-wide text-[#4F46E5]">
          Public Explorer Leaderboard
        </p>
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#0F172A] leading-[1.12] [text-wrap:balance]">
              Trekkers, Hikers &amp; Travelers Ranking
            </h1>
            <p className="text-sm md:text-base text-[#475569] leading-relaxed">
              Public leaderboard ordered by each explorer&apos;s number of completed and active
              trips, hikes, and treks. Expand any row to inspect their complete list of routes,
              coordinates, distances, elevation peaks, and travel notes.
            </p>
          </div>
        </div>
      </section>

      {/* Full-Width 4-Column Metric Strip */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-5 sm:gap-6 py-5 sm:py-6 border-y border-[#E2E8F0]">
        <div>
          <p className="text-xs text-[#475569] mb-1">Ranked Explorers</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#0F172A]">
            {aggregateStats.travelerCount}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#475569] mb-1">Total Trips Logged</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#4F46E5]">
            {aggregateStats.totalTravels}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#475569] mb-1">Combined Distance</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#0F172A]">
            {formatDistance(aggregateStats.totalDistanceKm)}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#475569] mb-1">Public Snaps</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#2563EB]">
            {aggregateStats.totalSnaps}
          </p>
        </div>
      </section>

      {/* Controls Bar */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, @handle, or route..."
            aria-label="Search traveler rankings"
            className="pl-9 pr-3.5 min-h-[44px] py-2 text-base sm:text-xs bg-white border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5] w-full"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#EEF1FA] border border-[#E2E8F0] rounded-xl overflow-x-auto no-scrollbar max-w-full self-start md:self-auto">
          <button
            type="button"
            onClick={() => setSortBy('travels')}
            className={`px-3 min-h-[36px] py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer trail-transition ${
              sortBy === 'travels'
                ? 'bg-white text-[#4F46E5] shadow-xs'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Rank by Trips
          </button>
          <button
            type="button"
            onClick={() => setSortBy('distance')}
            className={`px-3 min-h-[36px] py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer trail-transition ${
              sortBy === 'distance'
                ? 'bg-white text-[#4F46E5] shadow-xs'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Sort by Distance
          </button>
          <button
            type="button"
            onClick={() => setSortBy('elevation')}
            className={`px-3 min-h-[36px] py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer trail-transition ${
              sortBy === 'elevation'
                ? 'bg-white text-[#4F46E5] shadow-xs'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Sort by Peak
          </button>
        </div>
      </section>

      {/* Travellers Ranking Table (Desktop) & Stacked Ledger (Mobile) */}
      {displayedTravelers.length > 0 ? (
        <>
          <section className="hidden md:block bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F6F7FB] border-b border-[#E2E8F0] text-xs font-medium text-[#475569]">
                    <th className="py-3.5 pl-6 pr-3 w-20">Rank</th>
                    <th className="py-3.5 px-3">Explorer</th>
                    <th className="py-3.5 px-3 text-right">Trips</th>
                    <th className="py-3.5 px-3 text-right">Distance</th>
                    <th className="py-3.5 px-3 text-right">Peak Elevation</th>
                    <th className="py-3.5 px-3 text-right">Stops &amp; Snaps</th>
                    <th className="py-3.5 pl-3 pr-6 text-right">Trips List</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {displayedTravelers.map((entry) => {
                    const isExpanded = expandedUid === entry.profile.uid;
                    const isTopThree = entry.travelRank <= 3 && entry.totalTravelsCount > 0;

                    return (
                      <Fragment key={entry.profile.uid}>
                        <tr
                          onClick={() => toggleExpandTraveler(entry.profile.uid)}
                          className={`cursor-pointer trail-transition ${
                            isExpanded ? 'bg-[#EEF2FF]/60' : 'hover:bg-[#F6F7FB]'
                          }`}
                        >
                          <td className="py-4 pl-6 pr-3 align-middle">
                            <span
                              className={`font-mono tabular-nums text-sm font-semibold ${
                                isTopThree ? 'text-[#4F46E5]' : 'text-[#475569]'
                              }`}
                            >
                              #{entry.travelRank}
                            </span>
                          </td>

                          <td className="py-4 px-3 align-middle">
                            <div className="flex items-center gap-3.5 min-w-0">
                              <div className="w-11 h-11 rounded-xl overflow-hidden bg-[#EEF1FA] border border-[#E2E8F0] shrink-0 flex items-center justify-center">
                                {entry.profile.avatarUrl ? (
                                  <img
                                    src={entry.profile.avatarUrl}
                                    alt={entry.profile.displayName}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <UserIcon className="w-5 h-5 text-[#4F46E5]" />
                                )}
                              </div>

                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-[#0F172A] truncate">
                                  {entry.profile.displayName}
                                </p>
                                <p className="text-xs text-[#475569] truncate">
                                  @{entry.profile.handle}
                                  {entry.profile.homeBase ? ` · ${entry.profile.homeBase}` : ''}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-3 align-middle text-right">
                            <p className="text-sm font-semibold font-mono tabular-nums text-[#0F172A]">
                              {entry.totalTravelsCount}
                            </p>
                            <p className="text-[11px] text-[#475569] font-mono tabular-nums">
                              {entry.completedCount} completed
                              {entry.activePublicCount > 0
                                ? ` · ${entry.activePublicCount} active`
                                : ''}
                            </p>
                          </td>

                          <td className="py-4 px-3 align-middle text-right font-mono tabular-nums text-sm text-[#0F172A]">
                            {formatDistance(entry.totalDistanceKm)}
                          </td>

                          <td className="py-4 px-3 align-middle text-right font-mono tabular-nums text-sm text-[#0F172A]">
                            {entry.highestElevationM > 0
                              ? formatElevation(entry.highestElevationM)
                              : '—'}
                          </td>

                          <td className="py-4 px-3 align-middle text-right font-mono tabular-nums text-xs text-[#475569]">
                            {entry.totalWaypoints} pts · {entry.totalPhotos} snaps
                          </td>

                          <td className="py-4 pl-3 pr-6 align-middle text-right">
                            <div className="inline-flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpandTraveler(entry.profile.uid);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0F172A] bg-white border border-[#E2E8F0] rounded-xl hover:border-[#4F46E5] hover:text-[#4F46E5] whitespace-nowrap shrink-0 cursor-pointer trail-transition"
                              >
                                <span>
                                  {isExpanded
                                    ? 'Hide Trips'
                                    : `View Trips (${entry.publicTreks.length})`}
                                </span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="p-0">
                              {renderExpandedTravelerLedger(entry)}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Mobile Ranking List */}
          <section className="md:hidden space-y-4">
            {displayedTravelers.map((entry) => {
              const isExpanded = expandedUid === entry.profile.uid;
              const isTopThree = entry.travelRank <= 3 && entry.totalTravelsCount > 0;

              return (
                <div
                  key={entry.profile.uid}
                  className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs"
                >
                  <div
                    onClick={() => toggleExpandTraveler(entry.profile.uid)}
                    className="p-4 sm:p-5 space-y-4 cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`font-mono tabular-nums text-base font-semibold shrink-0 ${
                            isTopThree ? 'text-[#4F46E5]' : 'text-[#475569]'
                          }`}
                        >
                          #{entry.travelRank}
                        </span>
                        <div className="w-11 h-11 rounded-xl overflow-hidden bg-[#EEF1FA] border border-[#E2E8F0] shrink-0 flex items-center justify-center">
                          {entry.profile.avatarUrl ? (
                            <img
                              src={entry.profile.avatarUrl}
                              alt={entry.profile.displayName}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <UserIcon className="w-5 h-5 text-[#4F46E5]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-[#0F172A] truncate">
                            {entry.profile.displayName}
                          </h3>
                          <p className="text-xs text-[#475569] truncate">
                            @{entry.profile.handle}
                            {entry.profile.homeBase ? ` · ${entry.profile.homeBase}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-base font-semibold font-mono tabular-nums text-[#4F46E5]">
                          {entry.totalTravelsCount}
                        </p>
                        <p className="text-[11px] text-[#475569]">trips</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[#E2E8F0] text-xs">
                      <div>
                        <span className="text-[#475569] block">Distance</span>
                        <span className="font-mono tabular-nums font-medium text-[#0F172A]">
                          {formatDistance(entry.totalDistanceKm)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#475569] block">Peak</span>
                        <span className="font-mono tabular-nums font-medium text-[#0F172A]">
                          {entry.highestElevationM > 0
                            ? formatElevation(entry.highestElevationM)
                            : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#475569] block">Snaps</span>
                        <span className="font-mono tabular-nums font-medium text-[#0F172A]">
                          {entry.totalPhotos}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpandTraveler(entry.profile.uid);
                      }}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 min-h-[44px] py-2 text-xs font-medium text-[#0F172A] bg-[#F6F7FB] border border-[#E2E8F0] hover:border-[#4F46E5] rounded-xl cursor-pointer trail-transition"
                    >
                      <span>
                        {isExpanded
                          ? 'Hide Trips'
                          : `View Trips (${entry.publicTreks.length})`}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {isExpanded && renderExpandedTravelerLedger(entry)}
                </div>
              );
            })}
          </section>
        </>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-10 text-center">
          <Compass className="w-8 h-8 text-[#4F46E5] mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-[#0F172A] mb-1">
            {rankedTravelers.length === 0
              ? 'No ranked explorers yet'
              : 'No explorers match this search'}
          </h2>
          <p className="text-sm text-[#475569]">
            {rankedTravelers.length === 0
              ? 'Trekkers, hikers, and travelers appear in the public ranking once they log a public trip or complete a journey.'
              : 'Clear your search query to view all ranked explorers.'}
          </p>
        </div>
      )}

      {lightboxState && (
        <PhotoLightbox
          items={lightboxState.items}
          currentIndex={lightboxState.index}
          onNavigate={(index) =>
            setLightboxState((prev) => (prev ? { ...prev, index } : null))
          }
          onClose={() => setLightboxState(null)}
        />
      )}
    </div>
  );
}
