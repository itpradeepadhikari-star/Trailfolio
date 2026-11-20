import { useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  LocateFixed,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  compressImageToDataUrl,
  formatCoords,
  formatDistance,
  formatElevation,
  formatTimestampTime,
} from '../lib/geo';
import {
  addWaypointToTrek,
  deleteWaypointFromActiveTrek,
  finishTrek,
} from '../services/trailService';
import { fetchCoordinateElevation } from '../services/weatherService';
import {
  BLUEPRINT_LIMITS,
  type LatLngLiteral,
  type Trek,
  type Waypoint,
  type WaypointCategory,
} from '../types/trail';
import { CameraSnapModal } from './CameraSnapModal';
import { DifficultyBadge } from './DifficultyBadge';
import { EditTrekModal } from './EditTrekModal';
import { EditWaypointModal } from './EditWaypointModal';
import { PlaceSearchBox } from './maps/PlaceSearchBox';
import { TrailMap } from './maps/TrailMap';
import { PhotoLightbox, type LightboxItem } from './PhotoLightbox';
import { StopWeatherPreview } from './WeatherPreviewCard';

interface ActiveTrekWorkspaceProps {
  trek: Trek;
  waypoints: Waypoint[];
  onFinished: (trekId: string) => void;
  onBackToPortfolio: () => void;
}

const CATEGORIES: { value: WaypointCategory; label: string }[] = [
  { value: 'viewpoint', label: 'Viewpoint / Landmark' },
  { value: 'camp', label: 'Camp / Stay' },
  { value: 'summit', label: 'Summit / Pass' },
  { value: 'rest', label: 'Rest / Cafe Stop' },
  { value: 'finish', label: 'Final Destination' },
  { value: 'trailhead', label: 'Start Point' },
];

export function ActiveTrekWorkspace({
  trek,
  waypoints,
  onFinished,
  onBackToPortfolio,
}: ActiveTrekWorkspaceProps) {
  const [wpName, setWpName] = useState('');
  const [wpCategory, setWpCategory] = useState<WaypointCategory>('viewpoint');
  const [wpCoords, setWpCoords] = useState<LatLngLiteral | null>(null);
  const [wpElev, setWpElev] = useState('');
  const [wpNote, setWpNote] = useState('');
  const [wpPhotos, setWpPhotos] = useState<string[]>([]);
  const [selectedWpId, setSelectedWpId] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [showManualCoords, setShowManualCoords] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [savingWp, setSavingWp] = useState(false);
  const [elevLoading, setElevLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elevReqRef = useRef(0);

  const autoFetchElevation = async (lat: number, lng: number) => {
    const reqId = ++elevReqRef.current;
    setElevLoading(true);
    setWpElev('');
    const elev = await fetchCoordinateElevation(lat, lng);
    if (elevReqRef.current === reqId) {
      setElevLoading(false);
      if (elev !== null) {
        setWpElev(String(elev));
      }
    }
  };

  const handleApplyManualCoords = () => {
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      setError('Enter valid latitude (-90 to 90) and longitude (-180 to 180).');
      return;
    }
    const roundedLat = Number(lat.toFixed(6));
    const roundedLng = Number(lng.toFixed(6));
    setError(null);
    setWpCoords({ lat: roundedLat, lng: roundedLng });
    if (!wpName.trim()) {
      setWpName(`Waypoint #${waypoints.length + 1}`);
    }
    setShowManualCoords(false);
    void autoFetchElevation(roundedLat, roundedLng);
  };

  const [showFinishModal, setShowFinishModal] = useState(false);
  const [finishSummary, setFinishSummary] = useState(trek.summary || '');
  const [finishIsPublic, setFinishIsPublic] = useState(trek.isPublic);
  const [finishing, setFinishing] = useState(false);
  const [showEditTrek, setShowEditTrek] = useState(false);
  const [editingWaypoint, setEditingWaypoint] = useState<Waypoint | null>(null);

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

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported in this browser.');
      return;
    }
    setGpsLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setWpCoords({ lat, lng });
        if (pos.coords.altitude !== null && Number.isFinite(pos.coords.altitude)) {
          elevReqRef.current += 1;
          setElevLoading(false);
          setWpElev(String(Math.round(pos.coords.altitude)));
        } else {
          void autoFetchElevation(lat, lng);
        }
        if (!wpName.trim()) {
          setWpName(`Checkpoint #${waypoints.length + 1}`);
        }
        setGpsLoading(false);
      },
      () => {
        setGpsLoading(false);
        setError('Unable to fetch GPS. Click on the map or search a landmark.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || wpPhotos.length >= BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX) return;
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setWpPhotos((prev) =>
        [...prev, dataUrl].slice(0, BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed.');
    }
  };

  const handleAddWaypoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wpCoords) {
      setError('Pin a location on the map, search a place, or use GPS first.');
      return;
    }
    const cleanName = wpName.trim() || `Waypoint #${waypoints.length + 1}`;
    const parsedElev = wpElev.trim() ? Number(wpElev) : null;
    if (parsedElev !== null && (!Number.isFinite(parsedElev) || parsedElev < -500 || parsedElev > 9000)) {
      setError('Elevation must be between -500 m and 9,000 m.');
      return;
    }

    setSavingWp(true);
    setError(null);
    try {
      await addWaypointToTrek({
        trek,
        existingWaypoints: waypoints,
        name: cleanName,
        category: wpCategory,
        lat: wpCoords.lat,
        lng: wpCoords.lng,
        elevationM: parsedElev,
        note: wpNote.trim(),
        photos: wpPhotos,
      });
      setWpName('');
      setWpCoords(null);
      setWpElev('');
      setWpNote('');
      setWpPhotos([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log waypoint.');
    } finally {
      setSavingWp(false);
    }
  };

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setFinishing(true);
    setError(null);
    try {
      await finishTrek({
        trek,
        waypoints,
        summary: finishSummary.trim(),
        isPublic: finishIsPublic,
      });
      setShowFinishModal(false);
      onFinished(trek.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete trek.');
      setFinishing(false);
    }
  };

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 sm:pb-6 border-b border-[#E2E8F0]">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#475569] mb-1.5">
            <DifficultyBadge difficulty={trek.difficulty} size="sm" />
            <span className="font-medium text-[#2563EB]">Active Journey</span>
            <span aria-hidden="true"> · </span>
            <span>{trek.region}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#0F172A]">
            {trek.title}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={() => setShowEditTrek(true)}
            className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] py-2 text-sm font-medium text-[#0F172A] bg-white border border-[#E2E8F0] rounded-xl hover:bg-[#EEF2FF] hover:border-[#C7D2FE] whitespace-nowrap shrink-0 cursor-pointer trail-transition"
          >
            <Pencil className="w-4 h-4 text-[#4F46E5]" />
            <span>Edit Trip</span>
          </button>
          <button
            type="button"
            onClick={onBackToPortfolio}
            className="px-4 min-h-[44px] py-2 text-sm font-medium text-[#475569] hover:text-[#0F172A] whitespace-nowrap shrink-0 cursor-pointer"
          >
            All Trips
          </button>
          <button
            type="button"
            onClick={() => {
              setFinishSummary(trek.summary || '');
              setFinishIsPublic(trek.isPublic);
              setShowFinishModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 min-h-[44px] py-2 text-sm font-medium text-white bg-gradient-to-r from-[#5B21B6] via-[#4F46E5] to-[#2563EB] hover:from-[#4C1D95] hover:via-[#4338CA] hover:to-[#1D4ED8] rounded-xl shadow-sm shadow-indigo-500/15 whitespace-nowrap shrink-0 cursor-pointer trail-transition"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Finish Trip</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-5 border-b border-[#E2E8F0]">
        <div>
          <p className="text-xs text-[#475569]">Distance Logged</p>
          <p className="text-xl font-semibold font-mono tabular-nums text-[#0F172A]">
            {formatDistance(trek.distanceKm)}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#475569]">Locations Reached</p>
          <p className="text-xl font-semibold font-mono tabular-nums text-[#4F46E5]">
            {waypoints.length}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#475569]">Max Elevation</p>
          <p className="text-xl font-semibold font-mono tabular-nums text-[#0F172A]">
            {formatElevation(trek.maxElevationM)}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#475569]">Snaps Captured</p>
          <p className="text-xl font-semibold font-mono tabular-nums text-[#2563EB]">
            {allPhotos.length}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 mt-6 sm:mt-8 items-start">
        {/* Left: Log Reached Location + Chronological Waypoints */}
        <div className="lg:col-span-5 space-y-6 sm:space-y-8 order-2 lg:order-1">
          <form
            onSubmit={(e) => void handleAddWaypoint(e)}
            className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[#0F172A]">
                Pin Reached Location
              </h2>
              <button
                type="button"
                onClick={handleUseGps}
                disabled={gpsLoading}
                className="inline-flex items-center gap-1.5 px-3 min-h-[38px] py-1.5 text-xs font-medium text-[#4F46E5] bg-[#F6F7FB] border border-[#E2E8F0] rounded-xl hover:bg-[#EEF2FF] hover:border-[#C7D2FE] cursor-pointer trail-transition"
              >
                <LocateFixed className="w-3.5 h-3.5" />
                <span>{gpsLoading ? 'Locating...' : 'Current GPS'}</span>
              </button>
            </div>

            <PlaceSearchBox
              placeholder="Search reached landmark, town, pass, or peak..."
              onPlaceSelect={(place) => {
                setWpCoords(place.location);
                setWpName(place.name);
                void autoFetchElevation(place.location.lat, place.location.lng);
              }}
            />

            <div className="text-xs font-mono tabular-nums text-[#475569] flex items-center justify-between gap-2 bg-[#F6F7FB] border border-[#E2E8F0] px-3 py-2.5 rounded-xl">
              <span className="flex items-center gap-1.5 min-w-0 truncate">
                <MapPin className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                {wpCoords
                  ? formatCoords(wpCoords.lat, wpCoords.lng)
                  : 'Pin via GPS, map, or coords'}
              </span>
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowManualCoords((prev) => !prev)}
                  className="font-sans font-medium text-[#4F46E5] hover:underline cursor-pointer"
                >
                  {showManualCoords ? 'Hide' : 'Coords'}
                </button>
                {wpCoords && (
                  <button
                    type="button"
                    onClick={() => {
                      elevReqRef.current += 1;
                      setElevLoading(false);
                      setWpCoords(null);
                      setWpElev('');
                    }}
                    className="font-sans text-[#475569] hover:text-[#0F172A] cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {showManualCoords && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 rounded-xl bg-[#F6F7FB] border border-[#E2E8F0]">
                <input
                  type="number"
                  step="any"
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  placeholder="Lat (e.g. 28.54)"
                  className="px-3 min-h-[40px] text-base sm:text-xs font-mono border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:border-[#4F46E5]"
                />
                <input
                  type="number"
                  step="any"
                  value={manualLng}
                  onChange={(e) => setManualLng(e.target.value)}
                  placeholder="Lng (e.g. 83.92)"
                  className="px-3 min-h-[40px] text-base sm:text-xs font-mono border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:border-[#4F46E5]"
                />
                <button
                  type="button"
                  onClick={handleApplyManualCoords}
                  className="px-3 min-h-[40px] text-xs font-medium text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg cursor-pointer"
                >
                  Apply Pin
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <input
                  type="text"
                  value={wpName}
                  onChange={(e) => setWpName(e.target.value)}
                  maxLength={BLUEPRINT_LIMITS.WAYPOINT_NAME_MAX}
                  placeholder="Location name (e.g., Sunset Point or Camp 1)"
                  className="w-full px-3.5 min-h-[44px] py-2 text-base sm:text-sm border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <input
                  type="number"
                  value={wpElev}
                  onChange={(e) => {
                    elevReqRef.current += 1;
                    setElevLoading(false);
                    setWpElev(e.target.value);
                  }}
                  placeholder={elevLoading ? 'Fetching...' : 'Elev (m)'}
                  min={-500}
                  max={9000}
                  className="w-full px-3.5 min-h-[44px] py-2 text-base sm:text-sm font-mono tabular-nums border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div>
              <select
                value={wpCategory}
                onChange={(e) => setWpCategory(e.target.value as WaypointCategory)}
                className="w-full px-3.5 min-h-[44px] py-2 text-base sm:text-sm border border-[#E2E8F0] rounded-xl bg-white focus:outline-none focus:border-[#4F46E5]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              value={wpNote}
              onChange={(e) => setWpNote(e.target.value)}
              maxLength={BLUEPRINT_LIMITS.NOTE_MAX}
              rows={3}
              placeholder="Write a note for this stop — views, terrain, local tips, or travel memories..."
              className="w-full px-3.5 py-2.5 text-base sm:text-sm border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5] resize-none"
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#475569]">
                  Snaps ({wpPhotos.length}/{BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={wpPhotos.length >= BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX}
                    onClick={() => setShowCamera(true)}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[40px] py-1.5 text-xs font-medium text-[#0F172A] bg-[#F6F7FB] border border-[#E2E8F0] rounded-xl hover:bg-[#EEF2FF] hover:border-[#C7D2FE] disabled:opacity-40 cursor-pointer trail-transition"
                  >
                    <Camera className="w-3.5 h-3.5 text-[#4F46E5]" />
                    <span>Take Snap</span>
                  </button>
                  <label className="inline-flex items-center gap-1.5 px-3 min-h-[40px] py-1.5 text-xs font-medium text-[#0F172A] bg-[#F6F7FB] border border-[#E2E8F0] rounded-xl hover:bg-[#EEF2FF] hover:border-[#C7D2FE] cursor-pointer trail-transition">
                    <Upload className="w-3.5 h-3.5 text-[#2563EB]" />
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => void handleFileUpload(e)}
                      className="hidden"
                      disabled={wpPhotos.length >= BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX}
                    />
                  </label>
                </div>
              </div>

              {wpPhotos.length > 0 && (
                <div className="flex gap-2.5">
                  {wpPhotos.map((src, i) => (
                    <div
                      key={i}
                      className="relative w-24 h-20 rounded-xl overflow-hidden border border-[#E2E8F0]"
                    >
                      <img
                        src={src}
                        alt="Waypoint snap"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setWpPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                        aria-label="Remove snap"
                        className="absolute top-1 right-1 p-1 rounded-md bg-black/65 text-white cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={savingWp}
              className="w-full inline-flex items-center justify-center gap-2 px-4 min-h-[44px] py-2.5 text-sm font-medium text-white bg-gradient-to-r from-[#5B21B6] via-[#4F46E5] to-[#2563EB] hover:from-[#4C1D95] hover:via-[#4338CA] hover:to-[#1D4ED8] rounded-xl shadow-sm shadow-indigo-500/15 disabled:opacity-50 cursor-pointer trail-transition"
            >
              <Plus className="w-4 h-4" />
              <span>{savingWp ? 'Saving Check-in...' : 'Log Reached Location'}</span>
            </button>
          </form>

          {/* Waypoint Timeline */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[#0F172A]">
              Recorded Route Log ({waypoints.length})
            </h3>
            <div className="divide-y divide-[#E2E8F0] bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs">
              {waypoints.map((wp, idx) => (
                <div
                  key={wp.id}
                  onClick={() => setSelectedWpId(wp.id)}
                  className={`p-4 cursor-pointer trail-transition ${
                    selectedWpId === wp.id ? 'bg-[#EEF2FF]' : 'hover:bg-[#F6F7FB]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-[#475569] font-mono tabular-nums capitalize">
                        <span className="text-[#4F46E5] font-semibold">#{idx + 1}</span> · {wp.category}
                        {wp.elevationM !== null ? ` · ${formatElevation(wp.elevationM)}` : ''}
                        {' · '}
                        {formatTimestampTime(wp.reachedAt)}
                      </p>
                      <h4 className="text-sm font-semibold text-[#0F172A] mt-0.5">
                        {wp.name}
                      </h4>
                      <p className="text-[11px] font-mono text-[#475569] tabular-nums mt-0.5">
                        {formatCoords(wp.lat, wp.lng)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingWaypoint(wp);
                        }}
                        aria-label={`Edit ${wp.name}`}
                        className="inline-flex items-center gap-1 px-2.5 min-h-[36px] text-xs font-medium text-[#4F46E5] bg-[#F6F7FB] border border-[#E2E8F0] rounded-lg hover:bg-[#EEF2FF] hover:border-[#C7D2FE] cursor-pointer trail-transition"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void deleteWaypointFromActiveTrek(trek, waypoints, wp.id);
                          }}
                          aria-label="Remove waypoint"
                          className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-[#475569] hover:text-red-700 hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <StopWeatherPreview lat={wp.lat} lng={wp.lng} elevationM={wp.elevationM} />

                  {wp.note && (
                    <p className="mt-2 text-sm text-[#334155] leading-relaxed">
                      {wp.note}
                    </p>
                  )}

                  {wp.photos && wp.photos.length > 0 && (
                    <div className="mt-3 flex gap-2">
                      {wp.photos.map((photo, pIdx) => (
                        <button
                          key={pIdx}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openPhotoInLightbox(photo, wp);
                          }}
                          className="w-24 h-18 rounded-lg overflow-hidden border border-[#E2E8F0] cursor-pointer"
                        >
                          <img
                            src={photo}
                            alt={wp.name}
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
        </div>

        {/* Right: Interactive Map */}
        <div className="lg:col-span-7 lg:sticky lg:top-24 order-1 lg:order-2">
          <TrailMap
            waypoints={waypoints}
            draftPin={wpCoords}
            draftPinLabel={wpName || 'Next Stop'}
            selectedWaypointId={selectedWpId}
            onSelectWaypoint={(wp) => setSelectedWpId(wp ? wp.id : null)}
            interactiveClick={true}
            onMapClick={(clicked) => {
              setWpCoords(clicked);
              if (!wpName.trim()) {
                setWpName(`Waypoint #${waypoints.length + 1}`);
              }
              void autoFetchElevation(clicked.lat, clicked.lng);
            }}
            heightClassName="h-[340px] sm:h-[480px] lg:h-[660px]"
            onPhotoClick={openPhotoInLightbox}
          />
        </div>
      </div>

      {showCamera && (
        <CameraSnapModal
          onCapture={(dataUrl) =>
            setWpPhotos((prev) =>
              [...prev, dataUrl].slice(0, BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX)
            )
          }
          onClose={() => setShowCamera(false)}
        />
      )}

      {showFinishModal && (
        <div className="fixed inset-0 z-50 bg-[#090D16]/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={(e) => void handleFinish(e)}
            className="bg-white border border-[#E2E8F0] rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-5 sm:p-6 space-y-5 shadow-2xl max-h-[90dvh] overflow-y-auto"
          >
            <div className="sm:hidden flex justify-center -mt-1">
              <span className="w-10 h-1 rounded-full bg-[#CBD5E1]" aria-hidden="true" />
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#0F172A]">
                Complete &amp; Archive Trip
              </h3>
              <button
                type="button"
                onClick={() => setShowFinishModal(false)}
                aria-label="Close complete trip dialog"
                className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl text-[#475569] hover:text-[#0F172A] hover:bg-[#EEF1FA] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-[#475569] leading-relaxed">
              Once completed, this trip is permanently archived in your profile portfolio with{' '}
              <span className="font-mono tabular-nums text-[#0F172A] font-medium">
                {formatDistance(trek.distanceKm)}
              </span>{' '}
              and {waypoints.length} recorded stops.
            </p>

            <div>
              <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
                Trip Summary
              </label>
              <textarea
                value={finishSummary}
                onChange={(e) => setFinishSummary(e.target.value)}
                maxLength={BLUEPRINT_LIMITS.SUMMARY_MAX}
                rows={4}
                placeholder="Summarize highlights, route conditions, gear tips, or favorite moments..."
                className="w-full px-3.5 py-2.5 text-base sm:text-sm border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5] resize-none"
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <div>
                <p className="text-sm font-medium text-[#0F172A]">Publish to Public Portfolio</p>
                <p className="text-xs text-[#475569]">
                  Anyone with your portfolio link can view this trip.
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-[#EEF1FA] border border-[#E2E8F0] rounded-xl shrink-0">
                <button
                  type="button"
                  onClick={() => setFinishIsPublic(true)}
                  className={`px-3 min-h-[34px] py-1 text-xs font-medium rounded-lg cursor-pointer trail-transition ${
                    finishIsPublic ? 'bg-white text-[#4F46E5] shadow-xs' : 'text-[#475569]'
                  }`}
                >
                  Public
                </button>
                <button
                  type="button"
                  onClick={() => setFinishIsPublic(false)}
                  className={`px-3 min-h-[34px] py-1 text-xs font-medium rounded-lg cursor-pointer trail-transition ${
                    !finishIsPublic ? 'bg-white text-[#4F46E5] shadow-xs' : 'text-[#475569]'
                  }`}
                >
                  Private
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowFinishModal(false)}
                className="px-4 min-h-[44px] py-2 text-sm font-medium text-[#475569] hover:text-[#0F172A] cursor-pointer"
              >
                Keep Logging
              </button>
              <button
                type="submit"
                disabled={finishing}
                className="px-5 min-h-[44px] py-2 text-sm font-medium text-white bg-gradient-to-r from-[#5B21B6] via-[#4F46E5] to-[#2563EB] hover:from-[#4C1D95] hover:via-[#4338CA] hover:to-[#1D4ED8] rounded-xl shadow-sm shadow-indigo-500/15 disabled:opacity-50 cursor-pointer trail-transition"
              >
                {finishing ? 'Archiving...' : 'Complete Trip'}
              </button>
            </div>
          </form>
        </div>
      )}

      {lightboxState && (
        <PhotoLightbox
          items={lightboxState.items}
          currentIndex={lightboxState.index}
          onNavigate={(index) => setLightboxState({ ...lightboxState, index })}
          onClose={() => setLightboxState(null)}
        />
      )}

      {showEditTrek && (
        <EditTrekModal
          trek={trek}
          waypoints={waypoints}
          onClose={() => setShowEditTrek(false)}
        />
      )}

      {editingWaypoint && (
        <EditWaypointModal
          trek={trek}
          waypoints={waypoints}
          waypoint={editingWaypoint}
          onClose={() => setEditingWaypoint(null)}
        />
      )}
    </div>
  );
}
