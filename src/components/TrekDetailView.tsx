import { useState } from 'react';
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  Share2,
  Trash2,
} from 'lucide-react';
import {
  formatCoords,
  formatDistance,
  formatElevation,
  formatTimestamp,
  formatTimestampTime,
} from '../lib/geo';
import {
  deleteTrekAndWaypoints,
  toggleTrekVisibility,
} from '../services/trailService';
import type { Trek, Waypoint } from '../types/trail';
import { TrailMap } from './maps/TrailMap';
import { PhotoLightbox, type LightboxItem } from './PhotoLightbox';

interface TrekDetailViewProps {
  trek: Trek;
  waypoints: Waypoint[];
  isOwner: boolean;
  onBack: () => void;
  onResumeActive: (trekId: string) => void;
  onOpenTrekker: (handle: string) => void;
  onDeleted: () => void;
}

export function TrekDetailView({
  trek,
  waypoints,
  isOwner,
  onBack,
  onResumeActive,
  onOpenTrekker,
  onDeleted,
}: TrekDetailViewProps) {
  const [selectedWpId, setSelectedWpId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [togglingVis, setTogglingVis] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lightboxState, setLightboxState] = useState<{
    items: LightboxItem[];
    index: number;
  } | null>(null);

  const allPhotos: LightboxItem[] = waypoints.flatMap((wp) =>
    (wp.photos || []).map((photoUrl) => ({ photoUrl, waypoint: wp }))
  );

  const openPhotoInLightbox = (photoUrl: string, waypoint: Waypoint) => {
    const idx = allPhotos.findIndex(
      (item) => item.photoUrl === photoUrl && item.waypoint.id === waypoint.id
    );
    setLightboxState({
      items: allPhotos,
      index: idx >= 0 ? idx : 0,
    });
  };

  const handleCopyShareLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?trek=${encodeURIComponent(trek.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const handleToggleVisibility = async () => {
    setTogglingVis(true);
    try {
      await toggleTrekVisibility(trek, waypoints, !trek.isPublic);
    } finally {
      setTogglingVis(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteTrekAndWaypoints(trek.id, trek.ownerId);
      onDeleted();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 min-h-[40px] text-sm font-medium text-[#475569] hover:text-[#0F172A] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex flex-wrap items-center gap-2.5">
          {trek.isPublic && (
            <button
              type="button"
              onClick={() => void handleCopyShareLink()}
              className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] py-2 text-xs font-medium text-[#0F172A] bg-white border border-[#E2E8F0] rounded-xl hover:bg-[#EEF2FF] hover:border-[#C7D2FE] whitespace-nowrap shrink-0 cursor-pointer trail-transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#4F46E5]" /> : <Share2 className="w-3.5 h-3.5 text-[#4F46E5]" />}
              <span>{copied ? 'Link Copied' : 'Share Trek'}</span>
            </button>
          )}

          {isOwner && trek.status === 'active' && (
            <button
              type="button"
              onClick={() => onResumeActive(trek.id)}
              className="px-4 min-h-[40px] py-2 text-xs font-medium text-white bg-gradient-to-r from-[#5B21B6] via-[#4F46E5] to-[#2563EB] hover:from-[#4C1D95] hover:via-[#4338CA] hover:to-[#1D4ED8] rounded-xl shadow-sm shadow-indigo-500/15 whitespace-nowrap shrink-0 cursor-pointer trail-transition"
            >
              Resume Logging
            </button>
          )}

          {isOwner && trek.status === 'completed' && (
            <button
              type="button"
              disabled={togglingVis}
              onClick={() => void handleToggleVisibility()}
              className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] py-2 text-xs font-medium text-[#0F172A] bg-white border border-[#E2E8F0] rounded-xl hover:bg-[#EEF2FF] hover:border-[#C7D2FE] whitespace-nowrap shrink-0 cursor-pointer trail-transition"
            >
              {trek.isPublic ? <Eye className="w-3.5 h-3.5 text-[#4F46E5]" /> : <EyeOff className="w-3.5 h-3.5 text-[#475569]" />}
              <span>{trek.isPublic ? 'Public Portfolio' : 'Private Log'}</span>
            </button>
          )}

          {isOwner && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 px-3 min-h-[40px] py-2 text-xs font-medium text-red-700 bg-white border border-[#E2E8F0] rounded-xl hover:bg-red-50 whitespace-nowrap shrink-0 cursor-pointer trail-transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          )}

          {isOwner && confirmDelete && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDelete()}
                className="px-3 min-h-[40px] py-2 text-xs font-medium text-white bg-red-700 rounded-xl hover:bg-red-800 cursor-pointer"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-3 min-h-[40px] py-2 text-xs font-medium text-[#475569] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      <header className="pb-6 sm:pb-8 border-b border-[#E2E8F0]">
        <p className="text-xs text-[#475569] mb-2">
          <span>{trek.region}</span>
          <span aria-hidden="true"> · </span>
          <span>{trek.difficulty}</span>
          <span aria-hidden="true"> · </span>
          <span>{formatTimestamp(trek.completedAt || trek.startedAt)}</span>
          <span aria-hidden="true"> · </span>
          <button
            type="button"
            onClick={() => onOpenTrekker(trek.ownerHandle)}
            className="text-[#0F172A] font-medium hover:text-[#4F46E5] hover:underline cursor-pointer"
          >
            {trek.ownerName} (@{trek.ownerHandle})
          </button>
        </p>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-[#0F172A] max-w-3xl [text-wrap:balance]">
          {trek.title}
        </h1>

        {trek.summary && (
          <p className="mt-4 text-base text-[#334155] leading-relaxed max-w-3xl font-editorial">
            {trek.summary}
          </p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 sm:gap-6 mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-[#E2E8F0]">
          <div>
            <p className="text-xs text-[#475569]">Total Distance</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-[#0F172A]">
              {formatDistance(trek.distanceKm)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#475569]">Max Elevation</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-[#0F172A]">
              {formatElevation(trek.maxElevationM)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#475569]">Locations Reached</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-[#4F46E5]">
              {waypoints.length}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#475569]">Field Snaps</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-[#2563EB]">
              {allPhotos.length}
            </p>
          </div>
        </div>
      </header>

      <section className="py-6 sm:py-8">
        <TrailMap
          waypoints={waypoints}
          selectedWaypointId={selectedWpId}
          onSelectWaypoint={(wp) => setSelectedWpId(wp ? wp.id : null)}
          heightClassName="h-[320px] sm:h-[440px] md:h-[520px]"
          onPhotoClick={openPhotoInLightbox}
        />
      </section>

      <section className="py-4 sm:py-6">
        <div className="flex items-baseline justify-between mb-5 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#0F172A]">
            Expedition Waypoints &amp; Field Notes
          </h2>
          <span className="text-xs font-mono tabular-nums text-[#475569]">
            {waypoints.length} stops
          </span>
        </div>

        <div className="space-y-5 sm:space-y-6">
          {waypoints.map((wp, idx) => (
            <article
              key={wp.id}
              onClick={() => setSelectedWpId(wp.id)}
              className={`bg-white border rounded-2xl p-4 sm:p-6 cursor-pointer trail-transition ${
                selectedWpId === wp.id
                  ? 'border-[#4F46E5] ring-1 ring-[#4F46E5]/15'
                  : 'border-[#E2E8F0] hover:border-[#C7D2FE]'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <p className="text-xs font-mono text-[#475569] tabular-nums capitalize">
                    <span className="text-[#4F46E5] font-semibold">
                      Stop {String(idx + 1).padStart(2, '0')}
                    </span>{' '}
                    · {wp.category}
                    {wp.elevationM !== null ? ` · ${formatElevation(wp.elevationM)}` : ''}
                    {' · '}
                    {formatTimestampTime(wp.reachedAt)}
                  </p>
                  <h3 className="text-lg sm:text-xl font-semibold text-[#0F172A]">{wp.name}</h3>
                  <p className="text-xs font-mono text-[#475569] tabular-nums">
                    {formatCoords(wp.lat, wp.lng)}
                  </p>
                </div>
              </div>

              {wp.note && (
                <p className="mt-4 text-[15px] text-[#334155] leading-relaxed max-w-3xl">
                  {wp.note}
                </p>
              )}

              {wp.photos && wp.photos.length > 0 && (
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {wp.photos.map((photo, pIdx) => (
                    <button
                      key={pIdx}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPhotoInLightbox(photo, wp);
                      }}
                      className="group relative aspect-[4/3] rounded-xl overflow-hidden border border-[#E2E8F0] bg-[#EEF1FA] cursor-pointer"
                    >
                      <img
                        src={photo}
                        alt={`${wp.name} snap ${pIdx + 1}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-[1.02] trail-transition"
                      />
                    </button>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {lightboxState && (
        <PhotoLightbox
          items={lightboxState.items}
          currentIndex={lightboxState.index}
          onNavigate={(index) => setLightboxState({ ...lightboxState, index })}
          onClose={() => setLightboxState(null)}
        />
      )}
    </div>
  );
}
