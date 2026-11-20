import { useRef, useState } from 'react';
import { Camera, LocateFixed, MapPin, Upload, X } from 'lucide-react';
import { compressImageToDataUrl, formatCoords } from '../lib/geo';
import { updateWaypointDetails } from '../services/trailService';
import { fetchCoordinateElevation } from '../services/weatherService';
import {
  BLUEPRINT_LIMITS,
  type LatLngLiteral,
  type Trek,
  type Waypoint,
  type WaypointCategory,
} from '../types/trail';
import { CameraSnapModal } from './CameraSnapModal';
import { PlaceSearchBox } from './maps/PlaceSearchBox';
import { TrailMap } from './maps/TrailMap';

interface EditWaypointModalProps {
  trek: Trek;
  waypoints: Waypoint[];
  waypoint: Waypoint;
  onClose: () => void;
  onSaved?: () => void;
}

const CATEGORIES: { value: WaypointCategory; label: string }[] = [
  { value: 'trailhead', label: 'Start Point' },
  { value: 'viewpoint', label: 'Viewpoint / Landmark' },
  { value: 'camp', label: 'Camp / Stay' },
  { value: 'summit', label: 'Summit / Pass' },
  { value: 'rest', label: 'Rest / Cafe Stop' },
  { value: 'finish', label: 'Final Destination' },
];

export function EditWaypointModal({
  trek,
  waypoints,
  waypoint,
  onClose,
  onSaved,
}: EditWaypointModalProps) {
  const [name, setName] = useState(waypoint.name);
  const [category, setCategory] = useState<WaypointCategory>(waypoint.category);
  const [coords, setCoords] = useState<LatLngLiteral>({
    lat: waypoint.lat,
    lng: waypoint.lng,
  });
  const [latInput, setLatInput] = useState(String(waypoint.lat));
  const [lngInput, setLngInput] = useState(String(waypoint.lng));
  const [elevationM, setElevationM] = useState(
    waypoint.elevationM !== null && Number.isFinite(waypoint.elevationM)
      ? String(waypoint.elevationM)
      : ''
  );
  const [note, setNote] = useState(waypoint.note || '');
  const [photos, setPhotos] = useState<string[]>(waypoint.photos || []);
  const [showCamera, setShowCamera] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [elevLoading, setElevLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const syncCoords = (next: LatLngLiteral, shouldFetchElev = false) => {
    const rounded = {
      lat: Number(next.lat.toFixed(6)),
      lng: Number(next.lng.toFixed(6)),
    };
    setCoords(rounded);
    setLatInput(String(rounded.lat));
    setLngInput(String(rounded.lng));
    if (shouldFetchElev) {
      void autoFetchElevation(rounded.lat, rounded.lng);
    }
  };

  const handleLatChange = (val: string) => {
    setLatInput(val);
    const parsed = Number(val);
    if (val.trim() !== '' && Number.isFinite(parsed) && parsed >= -90 && parsed <= 90) {
      setCoords((prev) => ({ ...prev, lat: Number(parsed.toFixed(6)) }));
    }
  };

  const handleLngChange = (val: string) => {
    setLngInput(val);
    const parsed = Number(val);
    if (val.trim() !== '' && Number.isFinite(parsed) && parsed >= -180 && parsed <= 180) {
      setCoords((prev) => ({ ...prev, lng: Number(parsed.toFixed(6)) }));
    }
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
        const hasGpsAlt = pos.coords.altitude !== null && Number.isFinite(pos.coords.altitude);
        syncCoords(
          {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          },
          !hasGpsAlt
        );
        if (hasGpsAlt && pos.coords.altitude !== null) {
          elevReqRef.current += 1;
          setElevLoading(false);
          setElevationM(String(Math.round(pos.coords.altitude)));
        }
        setGpsLoading(false);
      },
      () => {
        setGpsLoading(false);
        setError('Unable to fetch GPS. Click the map, search a place, or edit coordinates directly.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || photos.length >= BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX) return;
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setPhotos((prev) =>
        [...prev, dataUrl].slice(0, BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX)
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedLat = Number(latInput);
    const parsedLng = Number(lngInput);
    if (
      !Number.isFinite(parsedLat) ||
      parsedLat < -90 ||
      parsedLat > 90 ||
      !Number.isFinite(parsedLng) ||
      parsedLng < -180 ||
      parsedLng > 180
    ) {
      setError('Enter valid latitude (-90 to 90) and longitude (-180 to 180).');
      return;
    }

    const cleanName = name.trim();
    if (!cleanName) {
      setError('Enter a name for this stop.');
      return;
    }

    const parsedElev = elevationM.trim() ? Number(elevationM) : null;
    if (
      parsedElev !== null &&
      (!Number.isFinite(parsedElev) || parsedElev < -500 || parsedElev > 9000)
    ) {
      setError('Elevation must be between -500 m and 9,000 m.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateWaypointDetails({
        trek,
        existingWaypoints: waypoints,
        waypoint,
        name: cleanName,
        category,
        lat: Number(parsedLat.toFixed(6)),
        lng: Number(parsedLng.toFixed(6)),
        elevationM: parsedElev,
        note: note.trim(),
        photos,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update stop details.');
      setSaving(false);
    }
  };

  const otherWaypoints = waypoints.filter((w) => w.id !== waypoint.id);

  return (
    <div className="fixed inset-0 z-50 bg-[#090D16]/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-[#E2E8F0] rounded-t-3xl sm:rounded-2xl max-w-2xl w-full max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden">
        <div className="sm:hidden flex justify-center pt-2.5">
          <span className="w-10 h-1 rounded-full bg-[#CBD5E1]" aria-hidden="true" />
        </div>

        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#E2E8F0]">
          <div>
            <h2 className="text-lg font-semibold text-[#0F172A]">Edit Stop &amp; Snaps</h2>
            <p className="text-xs text-[#475569]">
              Update map pin, coordinates, snaps, elevation, category, or notes
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close edit stop dialog"
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl text-[#475569] hover:text-[#0F172A] hover:bg-[#EEF1FA] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 sm:p-6 space-y-5 overflow-y-auto">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium text-[#0F172A]">
                Location Pin &amp; Coordinates
              </label>
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
              placeholder="Search place, landmark, peak, or town to move pin..."
              onPlaceSelect={(place) => {
                syncCoords(place.location, true);
                if (!name.trim()) {
                  setName(place.name);
                }
              }}
            />

            <TrailMap
              waypoints={otherWaypoints}
              draftPin={coords}
              draftPinLabel={name || 'Edited Location'}
              interactiveClick={true}
              onMapClick={(clicked) => syncCoords(clicked, true)}
              heightClassName="h-[220px] sm:h-[260px]"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#475569] mb-1">
                  Latitude
                </label>
                <input
                  type="number"
                  step="any"
                  value={latInput}
                  onChange={(e) => handleLatChange(e.target.value)}
                  className="w-full px-3.5 min-h-[42px] py-2 text-base sm:text-xs font-mono tabular-nums border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#475569] mb-1">
                  Longitude
                </label>
                <input
                  type="number"
                  step="any"
                  value={lngInput}
                  onChange={(e) => handleLngChange(e.target.value)}
                  className="w-full px-3.5 min-h-[42px] py-2 text-base sm:text-xs font-mono tabular-nums border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <p className="text-xs font-mono tabular-nums text-[#475569] flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
              <span>Pinned: {formatCoords(coords.lat, coords.lng)} (click map to reposition)</span>
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-[#E2E8F0] pt-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
                Location Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={BLUEPRINT_LIMITS.WAYPOINT_NAME_MAX}
                placeholder="e.g., Sunset Ridge or Base Camp"
                className="w-full px-3.5 min-h-[44px] py-2 text-base sm:text-sm border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5]"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-[#0F172A]">
                  Elevation (m)
                </label>
                <button
                  type="button"
                  disabled={elevLoading}
                  onClick={() => void autoFetchElevation(coords.lat, coords.lng)}
                  className="text-[11px] font-medium text-[#4F46E5] hover:underline disabled:opacity-50 cursor-pointer"
                >
                  {elevLoading ? 'Fetching...' : 'Auto'}
                </button>
              </div>
              <input
                type="number"
                value={elevationM}
                onChange={(e) => {
                  elevReqRef.current += 1;
                  setElevLoading(false);
                  setElevationM(e.target.value);
                }}
                placeholder={elevLoading ? 'Fetching...' : 'Optional'}
                min={-500}
                max={9000}
                className="w-full px-3.5 min-h-[44px] py-2 text-base sm:text-sm font-mono tabular-nums border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
              Stop Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as WaypointCategory)}
              className="w-full px-3.5 min-h-[44px] py-2 text-base sm:text-sm border border-[#E2E8F0] rounded-xl bg-white focus:outline-none focus:border-[#4F46E5]"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
              Notes &amp; Observations
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={BLUEPRINT_LIMITS.NOTE_MAX}
              rows={3}
              placeholder="Write a note for this stop — views, terrain, local tips, or travel memories..."
              className="w-full px-3.5 py-2.5 text-base sm:text-sm border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5] resize-none"
            />
          </div>

          <div className="space-y-2.5 border-t border-[#E2E8F0] pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#0F172A]">
                Snaps ({photos.length}/{BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX})
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={photos.length >= BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX}
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
                    disabled={photos.length >= BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX}
                  />
                </label>
              </div>
            </div>

            {photos.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {photos.map((src, i) => (
                  <div
                    key={i}
                    className="relative w-28 h-24 rounded-xl overflow-hidden border border-[#E2E8F0]"
                  >
                    <img
                      src={src}
                      alt={`${name || 'Waypoint'} snap ${i + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label="Remove snap"
                      className="absolute top-1.5 right-1.5 min-w-[28px] min-h-[28px] inline-flex items-center justify-center rounded-lg bg-black/70 text-white hover:bg-black cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#475569]">
                No snaps attached to this stop yet. Take or upload up to 2 photos.
              </p>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 min-h-[44px] py-2 text-sm font-medium text-[#475569] hover:text-[#0F172A] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 min-h-[44px] py-2 text-sm font-medium text-white bg-gradient-to-r from-[#5B21B6] via-[#4F46E5] to-[#2563EB] hover:from-[#4C1D95] hover:via-[#4338CA] hover:to-[#1D4ED8] rounded-xl shadow-sm shadow-indigo-500/15 disabled:opacity-50 cursor-pointer trail-transition"
            >
              {saving ? 'Saving...' : 'Save Stop Changes'}
            </button>
          </div>
        </form>
      </div>

      {showCamera && (
        <CameraSnapModal
          onCapture={(dataUrl) =>
            setPhotos((prev) =>
              [...prev, dataUrl].slice(0, BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX)
            )
          }
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
