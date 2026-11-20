import { useRef, useState } from 'react';
import { Camera, Compass, LocateFixed, Upload, X } from 'lucide-react';
import { DIFFICULTY_CONFIG, DIFFICULTY_LEVELS } from '../lib/difficulty';
import { compressImageToDataUrl, formatCoords } from '../lib/geo';
import { startTrek } from '../services/trailService';
import { fetchCoordinateElevation } from '../services/weatherService';
import {
  BLUEPRINT_LIMITS,
  type LatLngLiteral,
  type PublicProfile,
  type TrekDifficulty,
} from '../types/trail';
import { CameraSnapModal } from './CameraSnapModal';
import { PlaceSearchBox } from './maps/PlaceSearchBox';
import { TrailMap } from './maps/TrailMap';

interface StartTrekModalProps {
  profile: PublicProfile;
  onClose: () => void;
  onCreated: (trekId: string) => void;
}

export function StartTrekModal({ profile, onClose, onCreated }: StartTrekModalProps) {
  const [title, setTitle] = useState('');
  const [region, setRegion] = useState('');
  const [difficulty, setDifficulty] = useState<TrekDifficulty>('Moderate');
  const [isPublic, setIsPublic] = useState(true);
  const [startLocationName, setStartLocationName] = useState('');
  const [coords, setCoords] = useState<LatLngLiteral | null>(null);
  const [elevationM, setElevationM] = useState<string>('');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [showManualCoords, setShowManualCoords] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [elevLoading, setElevLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elevReqRef = useRef(0);

  const autoFetchElevation = async (lat: number, lng: number) => {
    const reqId = ++elevReqRef.current;
    setElevLoading(true);
    setElevationM('');
    const elev = await fetchCoordinateElevation(lat, lng);
    if (elevReqRef.current === reqId) {
      setElevLoading(false);
      if (elev !== null) {
        setElevationM(String(elev));
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
    setCoords({ lat: roundedLat, lng: roundedLng });
    if (!startLocationName.trim()) {
      setStartLocationName('Manual Start Pin');
    }
    setShowManualCoords(false);
    void autoFetchElevation(roundedLat, roundedLng);
  };

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setGpsLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setCoords({ lat, lng });
        if (pos.coords.altitude !== null && Number.isFinite(pos.coords.altitude)) {
          elevReqRef.current += 1;
          setElevLoading(false);
          setElevationM(String(Math.round(pos.coords.altitude)));
        } else {
          void autoFetchElevation(lat, lng);
        }
        if (!startLocationName.trim()) {
          setStartLocationName('GPS Start Location');
        }
        setGpsLoading(false);
      },
      () => {
        setGpsLoading(false);
        setError('Unable to read GPS location. Search a place or click on the map instead.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || photos.length >= BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX) return;
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setPhotos((prev) => [...prev, dataUrl].slice(0, BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process image.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Enter a title for your trip or route.');
      return;
    }
    if (!region.trim()) {
      setError('Enter the region, park, city, or destination.');
      return;
    }
    if (!coords) {
      setError('Set your start location by searching, clicking the map, or using GPS.');
      return;
    }
    const cleanStartName = startLocationName.trim() || 'Start Location';
    const parsedElev = elevationM.trim() ? Number(elevationM) : null;
    if (parsedElev !== null && (!Number.isFinite(parsedElev) || parsedElev < -500 || parsedElev > 9000)) {
      setError('Elevation must be between -500 m and 9,000 m.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const trekId = await startTrek({
        profile,
        title: title.trim(),
        region: region.trim(),
        difficulty,
        isPublic,
        startLocationName: cleanStartName,
        startLat: coords.lat,
        startLng: coords.lng,
        elevationM: parsedElev,
        note: note.trim(),
        photos,
      });
      onCreated(trekId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start trip.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#090D16]/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-[#E2E8F0] rounded-t-3xl sm:rounded-2xl max-w-4xl w-full sm:my-8 max-h-[92dvh] overflow-y-auto shadow-2xl">
        <div className="sm:hidden flex justify-center pt-2.5">
          <span className="w-10 h-1 rounded-full bg-[#CBD5E1]" aria-hidden="true" />
        </div>

        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-[#E2E8F0] sticky top-0 bg-white/95 backdrop-blur-sm z-10">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-[#0F172A]">Start a New Trip</h2>
            <p className="text-xs text-[#475569]">
              Set your starting location to begin logging stops, snaps, and notes along your route.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl text-[#475569] hover:text-[#0F172A] hover:bg-[#EEF1FA] cursor-pointer trail-transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
                Trip / Route Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={BLUEPRINT_LIMITS.TREK_TITLE_MAX}
                placeholder="e.g., Mardi Himal Ridge or Coastal Road Trip"
                className="w-full px-3.5 min-h-[44px] py-2.5 text-base sm:text-sm border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
                Region / Destination
              </label>
              <input
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                maxLength={BLUEPRINT_LIMITS.REGION_MAX}
                placeholder="e.g., Annapurna, Nepal or Kyoto"
                className="w-full px-3.5 min-h-[44px] py-2.5 text-base sm:text-sm border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
                Difficulty Level
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Difficulty Level">
                {DIFFICULTY_LEVELS.map((level) => {
                  const cfg = DIFFICULTY_CONFIG[level];
                  const active = difficulty === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setDifficulty(level)}
                      className={`text-left px-3 py-2.5 min-h-[54px] rounded-xl border cursor-pointer trail-transition ${
                        active
                          ? `${cfg.activeButtonClass} shadow-xs`
                          : 'bg-white text-[#475569] border-[#E2E8F0] hover:border-[#C7D2FE] hover:text-[#0F172A]'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-xs font-semibold">
                        <span className={`w-2 h-2 rounded-xs shrink-0 ${cfg.dotClass}`} aria-hidden="true" />
                        <span>{level}</span>
                      </span>
                      <span className="block text-[10px] leading-tight text-[#475569] mt-0.5">
                        {cfg.shortHint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
                  Start Location Name
                </label>
                <input
                  type="text"
                  value={startLocationName}
                  onChange={(e) => setStartLocationName(e.target.value)}
                  maxLength={BLUEPRINT_LIMITS.LOCATION_NAME_MAX}
                  placeholder="e.g., Kande Trailhead or Central Station"
                  className="w-full px-3.5 min-h-[44px] py-2.5 text-base sm:text-sm border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
                  Elevation (m)
                </label>
                <input
                  type="number"
                  value={elevationM}
                  onChange={(e) => {
                    elevReqRef.current += 1;
                    setElevLoading(false);
                    setElevationM(e.target.value);
                  }}
                  placeholder={elevLoading ? 'Fetching...' : '1770'}
                  min={-500}
                  max={9000}
                  className="w-full px-3.5 min-h-[44px] py-2.5 text-base sm:text-sm font-mono tabular-nums border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
                Departure Note
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={BLUEPRINT_LIMITS.NOTE_MAX}
                rows={3}
                placeholder="Weather, gear, itinerary highlights, or starting thoughts..."
                className="w-full px-3.5 py-2.5 text-base sm:text-sm border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5] resize-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-[#0F172A]">
                  Starting Snaps ({photos.length}/{BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX})
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={photos.length >= BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX}
                    onClick={() => setShowCamera(true)}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[38px] py-1.5 text-xs font-medium text-[#0F172A] bg-[#F6F7FB] border border-[#E2E8F0] rounded-lg hover:bg-[#EEF2FF] hover:border-[#C7D2FE] disabled:opacity-40 cursor-pointer trail-transition"
                  >
                    <Camera className="w-3.5 h-3.5 text-[#4F46E5]" />
                    <span>Snap</span>
                  </button>
                  <label className="inline-flex items-center gap-1.5 px-3 min-h-[38px] py-1.5 text-xs font-medium text-[#0F172A] bg-[#F6F7FB] border border-[#E2E8F0] rounded-lg hover:bg-[#EEF2FF] hover:border-[#C7D2FE] cursor-pointer trail-transition">
                    <Upload className="w-3.5 h-3.5 text-[#2563EB]" />
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => void handleFileUpload(e)}
                      className="hidden"
                      disabled={photos.length >= BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX}
                    />
                  </label>
                </div>
              </div>
              {photos.length > 0 && (
                <div className="flex gap-2.5">
                  {photos.map((src, i) => (
                    <div key={i} className="relative w-24 h-20 rounded-xl overflow-hidden border border-[#E2E8F0]">
                      <img src={src} alt="Starting snap" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                        aria-label="Remove photo"
                        className="absolute top-1 right-1 p-1 rounded-md bg-black/65 text-white cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-medium text-[#0F172A]">Portfolio Visibility</span>
              <div className="flex items-center gap-1 p-1 bg-[#EEF1FA] border border-[#E2E8F0] rounded-xl">
                <button
                  type="button"
                  onClick={() => setIsPublic(true)}
                  className={`px-3 min-h-[32px] py-1 text-xs font-medium rounded-lg cursor-pointer trail-transition ${
                    isPublic ? 'bg-white text-[#4F46E5] shadow-xs' : 'text-[#475569]'
                  }`}
                >
                  Public
                </button>
                <button
                  type="button"
                  onClick={() => setIsPublic(false)}
                  className={`px-3 min-h-[32px] py-1 text-xs font-medium rounded-lg cursor-pointer trail-transition ${
                    !isPublic ? 'bg-white text-[#4F46E5] shadow-xs' : 'text-[#475569]'
                  }`}
                >
                  Private
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <PlaceSearchBox
                className="flex-1"
                placeholder="Search starting location..."
                onPlaceSelect={(place) => {
                  setCoords(place.location);
                  setStartLocationName(place.name);
                  if (!region.trim() && place.formattedAddress) {
                    const parts = place.formattedAddress.split(',').map((s) => s.trim());
                    setRegion(parts.slice(-2).join(', '));
                  }
                  void autoFetchElevation(place.location.lat, place.location.lng);
                }}
              />
              <button
                type="button"
                onClick={handleUseGps}
                disabled={gpsLoading}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[44px] py-2.5 text-xs font-medium text-[#0F172A] bg-[#F6F7FB] border border-[#E2E8F0] rounded-xl hover:bg-[#EEF2FF] hover:border-[#C7D2FE] whitespace-nowrap shrink-0 cursor-pointer trail-transition"
              >
                <LocateFixed className="w-4 h-4 text-[#4F46E5]" />
                <span>{gpsLoading ? 'Locating...' : 'Use GPS'}</span>
              </button>
            </div>

            <TrailMap
              waypoints={[]}
              draftPin={coords}
              draftPinLabel={startLocationName || 'Start Location'}
              interactiveClick={true}
              onMapClick={(clicked) => {
                setCoords(clicked);
                if (!startLocationName.trim()) {
                  setStartLocationName('Start Pin');
                }
                void autoFetchElevation(clicked.lat, clicked.lng);
              }}
              heightClassName="h-[240px] sm:h-[310px]"
            />

            <div className="flex items-center justify-between text-xs text-[#475569] font-mono tabular-nums">
              <span className="flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-[#4F46E5]" />
                {coords ? formatCoords(coords.lat, coords.lng) : 'No start coordinates pinned yet'}
              </span>
              <button
                type="button"
                onClick={() => setShowManualCoords((prev) => !prev)}
                className="font-sans font-medium text-[#4F46E5] hover:underline cursor-pointer"
              >
                {showManualCoords ? 'Hide Coords' : 'Enter Lat / Lng'}
              </button>
            </div>

            {showManualCoords && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 rounded-xl bg-[#F6F7FB] border border-[#E2E8F0]">
                <input
                  type="number"
                  step="any"
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  placeholder="Lat (e.g. 28.5300)"
                  className="px-3 min-h-[40px] text-base sm:text-xs font-mono border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:border-[#4F46E5]"
                />
                <input
                  type="number"
                  step="any"
                  value={manualLng}
                  onChange={(e) => setManualLng(e.target.value)}
                  placeholder="Lng (e.g. 83.9900)"
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

            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
                {error}
              </div>
            )}

            <div className="mt-auto pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 min-h-[44px] py-2 text-sm font-medium text-[#475569] hover:text-[#0F172A] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 min-h-[44px] py-2.5 text-sm font-medium text-white bg-gradient-to-r from-[#5B21B6] via-[#4F46E5] to-[#2563EB] hover:from-[#4C1D95] hover:via-[#4338CA] hover:to-[#1D4ED8] rounded-xl shadow-sm shadow-indigo-500/15 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer trail-transition"
              >
                {submitting ? 'Starting Trip...' : 'Start Trip'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {showCamera && (
        <CameraSnapModal
          onCapture={(dataUrl) =>
            setPhotos((prev) => [...prev, dataUrl].slice(0, BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX))
          }
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
