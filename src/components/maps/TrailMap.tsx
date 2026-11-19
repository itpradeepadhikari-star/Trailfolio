import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  APILoadingStatus,
  APIProviderContext,
  InfoWindow,
  Map as GoogleMap,
  Polyline,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import { Compass, LocateFixed, MapPin, Minus, Plus, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/usePWAInstall';
import { formatCoords, formatElevation, formatTimestampTime } from '../../lib/geo';
import type { LatLngLiteral, Waypoint } from '../../types/trail';

interface WaypointMarkerProps {
  waypoint: Waypoint;
  index: number;
  total: number;
  isSelected: boolean;
  onSelect: (wp: Waypoint, marker: google.maps.marker.AdvancedMarkerElement) => void;
}

function WaypointMarker({
  waypoint,
  index,
  total,
  isSelected,
  onSelect,
}: WaypointMarkerProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const isStart = index === 0;
  const isEnd = total > 1 && index === total - 1;

  const badgeBg = isSelected
    ? 'bg-[#6D28D9] text-white border-white scale-110'
    : isStart
      ? 'bg-[#4F46E5] text-white border-white'
      : isEnd
        ? 'bg-[#2563EB] text-white border-white'
        : 'bg-white text-[#0F172A] border-[#4F46E5]';

  return (
    <AdvancedMarker
      ref={markerRef}
      position={{ lat: waypoint.lat, lng: waypoint.lng }}
      zIndex={isSelected ? 1000 : isStart || isEnd ? 500 : index + 10}
      title={waypoint.name}
      onClick={() => {
        if (marker) {
          onSelect(waypoint, marker);
        }
      }}
    >
      <div
        className={`min-w-7 h-7 px-1.5 rounded-full border-2 shadow-md flex items-center justify-center text-xs font-mono font-semibold tabular-nums cursor-pointer trail-transition ${badgeBg}`}
      >
        {isStart ? 'S' : index + 1}
      </div>
    </AdvancedMarker>
  );
}

interface BoundsControllerProps {
  points: LatLngLiteral[];
  focusPoint?: LatLngLiteral | null;
}

function BoundsController({ points, focusPoint }: BoundsControllerProps) {
  const map = useMap();
  const focusLat = focusPoint?.lat ?? null;
  const focusLng = focusPoint?.lng ?? null;

  useEffect(() => {
    if (!map) return;
    if (focusLat !== null && focusLng !== null) {
      map.setCenter({ lat: focusLat, lng: focusLng });
      if ((map.getZoom() ?? 10) < 13) {
        map.setZoom(13);
      }
      return;
    }
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(13);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, { top: 48, right: 48, bottom: 48, left: 48 });
  }, [map, points, focusLat, focusLng]);

  return null;
}

interface TrailMapProps {
  waypoints: Waypoint[];
  draftPin?: LatLngLiteral | null;
  draftPinLabel?: string;
  selectedWaypointId?: string | null;
  onSelectWaypoint?: (wp: Waypoint | null) => void;
  interactiveClick?: boolean;
  onMapClick?: (coords: LatLngLiteral) => void;
  defaultCenter?: LatLngLiteral;
  defaultZoom?: number;
  heightClassName?: string;
  onPhotoClick?: (photoUrl: string, waypoint: Waypoint) => void;
}

const DEFAULT_HIMALAYAN_CENTER: LatLngLiteral = { lat: 28.53, lng: 83.99 };

const CATEGORY_LABELS: Record<string, string> = {
  trailhead: 'Start Point',
  viewpoint: 'Viewpoint',
  camp: 'Camp / Stay',
  summit: 'Summit / Pass',
  rest: 'Rest Stop',
  finish: 'Final Destination',
};

const TILE_SIZE = 256;

function clampLat(lat: number): number {
  return Math.max(-85.05112878, Math.min(85.05112878, lat));
}

function latLngToWorldPx(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const sinLat = Math.sin((clampLat(lat) * Math.PI) / 180);
  const x = ((lng + 180) / 360) * scale;
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function worldPxToLatLng(worldX: number, worldY: number, zoom: number): LatLngLiteral {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const lng = (worldX / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * worldY) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return {
    lat: Number(clampLat(lat).toFixed(6)),
    lng: Number((((lng + 180) % 360 + 360) % 360 - 180).toFixed(6)),
  };
}

/**
 * Interactive Slippy Tile Map fallback rendered online when Google Maps API key
 * is not configured or cannot load (e.g., dev preview or unconfigured external host).
 */
function FallbackTileMap({
  waypoints,
  draftPin = null,
  draftPinLabel = 'New Pin',
  selectedWaypointId = null,
  onSelectWaypoint,
  interactiveClick = false,
  onMapClick,
  defaultCenter = DEFAULT_HIMALAYAN_CENTER,
  defaultZoom = 11,
  heightClassName = 'h-[420px] sm:h-[460px]',
  onPhotoClick,
}: TrailMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 640, height: 320 });
  const [center, setCenter] = useState<LatLngLiteral>(() => {
    if (draftPin) return draftPin;
    if (waypoints.length > 0) return { lat: waypoints[waypoints.length - 1].lat, lng: waypoints[waypoints.length - 1].lng };
    return defaultCenter;
  });
  const [zoom, setZoom] = useState<number>(() => (draftPin || waypoints.length > 0 ? Math.max(defaultZoom, 13) : defaultZoom));
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);

  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startCenter: LatLngLiteral;
    moved: boolean;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    startCenter: defaultCenter,
    moved: false,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draftLat = draftPin?.lat ?? null;
  const draftLng = draftPin?.lng ?? null;

  useEffect(() => {
    if (draftLat !== null && draftLng !== null) {
      setCenter({ lat: draftLat, lng: draftLng });
      setZoom((prev) => (prev < 13 ? 13 : prev));
    }
  }, [draftLat, draftLng]);

  const effectiveSelectedId = selectedWaypointId ?? localSelectedId;
  const selectedWp = waypoints.find((w) => w.id === effectiveSelectedId) || null;

  useEffect(() => {
    if (selectedWaypointId) {
      const wp = waypoints.find((w) => w.id === selectedWaypointId);
      if (wp) {
        setCenter({ lat: wp.lat, lng: wp.lng });
        setZoom((prev) => (prev < 13 ? 13 : prev));
      }
    }
  }, [selectedWaypointId, waypoints]);

  // Fit bounds on initial waypoint load when no draftPin is set
  const wpCount = waypoints.length;
  useEffect(() => {
    if (draftLat !== null || wpCount === 0) return;
    if (wpCount === 1) {
      setCenter({ lat: waypoints[0].lat, lng: waypoints[0].lng });
      setZoom(13);
      return;
    }
    const lats = waypoints.map((w) => w.lat);
    const lngs = waypoints.map((w) => w.lng);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    setCenter({ lat: midLat, lng: midLng });
    const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs));
    if (span > 2) setZoom(7);
    else if (span > 0.6) setZoom(9);
    else if (span > 0.15) setZoom(11);
    else setZoom(13);
  }, [wpCount, draftLat, waypoints]);

  const centerPx = useMemo(
    () => latLngToWorldPx(center.lat, center.lng, zoom),
    [center.lat, center.lng, zoom]
  );

  const tiles = useMemo(() => {
    const topLeftWorldX = centerPx.x - size.width / 2;
    const topLeftWorldY = centerPx.y - size.height / 2;
    const startTileX = Math.floor(topLeftWorldX / TILE_SIZE);
    const endTileX = Math.floor((topLeftWorldX + size.width) / TILE_SIZE);
    const startTileY = Math.floor(topLeftWorldY / TILE_SIZE);
    const endTileY = Math.floor((topLeftWorldY + size.height) / TILE_SIZE);
    const numTiles = Math.pow(2, zoom);

    const list: { key: string; url: string; left: number; top: number }[] = [];
    for (let tx = startTileX; tx <= endTileX; tx += 1) {
      for (let ty = startTileY; ty <= endTileY; ty += 1) {
        if (ty < 0 || ty >= numTiles) continue;
        const wrappedX = ((tx % numTiles) + numTiles) % numTiles;
        list.push({
          key: `${zoom}-${tx}-${ty}`,
          url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${ty}.png`,
          left: tx * TILE_SIZE - topLeftWorldX,
          top: ty * TILE_SIZE - topLeftWorldY,
        });
      }
    }
    return list;
  }, [centerPx, size.width, size.height, zoom]);

  const projectToScreen = useCallback(
    (lat: number, lng: number) => {
      const p = latLngToWorldPx(lat, lng, zoom);
      return {
        x: p.x - centerPx.x + size.width / 2,
        y: p.y - centerPx.y + size.height / 2,
      };
    },
    [zoom, centerPx, size.width, size.height]
  );

  const screenWaypoints = useMemo(
    () => waypoints.map((wp, index) => ({ wp, index, ...projectToScreen(wp.lat, wp.lng) })),
    [waypoints, projectToScreen]
  );

  const screenDraft = useMemo(
    () => (draftPin ? projectToScreen(draftPin.lat, draftPin.lng) : null),
    [draftPin, projectToScreen]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    dragStateRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startCenter: center,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active) return;
    const dx = e.clientX - dragStateRef.current.startX;
    const dy = e.clientY - dragStateRef.current.startY;
    if (Math.hypot(dx, dy) > 5) {
      dragStateRef.current.moved = true;
    }
    const startPx = latLngToWorldPx(
      dragStateRef.current.startCenter.lat,
      dragStateRef.current.startCenter.lng,
      zoom
    );
    const nextCenter = worldPxToLatLng(startPx.x - dx, startPx.y - dy, zoom);
    setCenter(nextCenter);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active) return;
    const wasMoved = dragStateRef.current.moved;
    dragStateRef.current.active = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if capture already released
    }

    if (!wasMoved) {
      if (interactiveClick && onMapClick && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;
        const worldX = centerPx.x - size.width / 2 + offsetX;
        const worldY = centerPx.y - size.height / 2 + offsetY;
        onMapClick(worldPxToLatLng(worldX, worldY, zoom));
      } else {
        setLocalSelectedId(null);
        onSelectWaypoint?.(null);
      }
    }
  };

  const recenterTarget = draftPin || (waypoints.length > 0 ? { lat: waypoints[waypoints.length - 1].lat, lng: waypoints[waypoints.length - 1].lng } : defaultCenter);

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ minHeight: '240px', touchAction: 'none' }}
      className={`relative w-full shrink-0 ${heightClassName} rounded-2xl overflow-hidden border border-[#E2E8F0] bg-[#E5E9F0] select-none cursor-grab active:cursor-grabbing`}
    >
      {/* Raster tile layer */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {tiles.map((t) => (
          <img
            key={t.key}
            src={t.url}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: `${t.left}px`,
              top: `${t.top}px`,
              width: `${TILE_SIZE}px`,
              height: `${TILE_SIZE}px`,
              maxWidth: 'none',
            }}
          />
        ))}
      </div>

      {/* Polyline overlay */}
      {screenWaypoints.length >= 2 && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
          <polyline
            fill="none"
            stroke="#4F46E5"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity="0.92"
            points={screenWaypoints.map((p) => `${p.x},${p.y}`).join(' ')}
          />
        </svg>
      )}

      {/* Waypoint markers */}
      {screenWaypoints.map(({ wp, index, x, y }) => {
        const isStart = index === 0;
        const isEnd = screenWaypoints.length > 1 && index === screenWaypoints.length - 1;
        const isSelected = selectedWp?.id === wp.id;
        return (
          <button
            key={wp.id}
            type="button"
            title={wp.name}
            onClick={(ev) => {
              ev.stopPropagation();
              setLocalSelectedId(wp.id);
              onSelectWaypoint?.(wp);
            }}
            style={{ left: `${x}px`, top: `${y}px` }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 min-w-7 h-7 px-1.5 rounded-full border-2 shadow-md flex items-center justify-center text-xs font-mono font-semibold tabular-nums cursor-pointer trail-transition ${
              isSelected
                ? 'bg-[#6D28D9] text-white border-white scale-110 z-30'
                : isStart
                  ? 'bg-[#4F46E5] text-white border-white z-20'
                  : isEnd
                    ? 'bg-[#2563EB] text-white border-white z-20'
                    : 'bg-white text-[#0F172A] border-[#4F46E5] z-20'
            }`}
          >
            {isStart ? 'S' : index + 1}
          </button>
        );
      })}

      {/* Draft pin */}
      {screenDraft && (
        <div
          style={{ left: `${screenDraft.x}px`, top: `${screenDraft.y}px` }}
          className="absolute -translate-x-1/2 -translate-y-full z-30 flex flex-col items-center pointer-events-none"
        >
          <div className="px-2.5 py-1 rounded-md bg-[#2563EB] text-white text-xs font-medium shadow-md flex items-center gap-1 whitespace-nowrap">
            <MapPin className="w-3 h-3" />
            <span>{draftPinLabel}</span>
          </div>
          <div className="w-3 h-3 rounded-full bg-[#2563EB] border-2 border-white shadow mt-0.5" />
        </div>
      )}

      {/* Map zoom & recenter controls */}
      <div className="absolute top-3 right-3 z-30 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(17, z + 1))}
          aria-label="Zoom in"
          className="w-9 h-9 rounded-xl bg-white/95 border border-[#E2E8F0] shadow-sm flex items-center justify-center text-[#0F172A] hover:bg-[#EEF2FF] cursor-pointer"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(3, z - 1))}
          aria-label="Zoom out"
          className="w-9 h-9 rounded-xl bg-white/95 border border-[#E2E8F0] shadow-sm flex items-center justify-center text-[#0F172A] hover:bg-[#EEF2FF] cursor-pointer"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setCenter(recenterTarget);
            setZoom((z) => Math.max(z, 13));
          }}
          aria-label="Center map on pin"
          className="w-9 h-9 rounded-xl bg-white/95 border border-[#E2E8F0] shadow-sm flex items-center justify-center text-[#4F46E5] hover:bg-[#EEF2FF] cursor-pointer"
        >
          <LocateFixed className="w-4 h-4" />
        </button>
      </div>

      {/* Selected waypoint inspector */}
      {selectedWp && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-8 left-3 right-3 sm:right-auto sm:max-w-xs z-30 bg-white/95 backdrop-blur-sm border border-[#E2E8F0] rounded-xl p-3 flex items-center justify-between gap-3 shadow-md"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-mono text-[#475569] truncate">
              #{selectedWp.orderIndex + 1} · {CATEGORY_LABELS[selectedWp.category] || selectedWp.category}
              {selectedWp.elevationM !== null ? ` · ${formatElevation(selectedWp.elevationM)}` : ''}
            </p>
            <p className="text-sm font-semibold text-[#0F172A] truncate">{selectedWp.name}</p>
            <p className="text-[11px] font-mono text-[#475569] tabular-nums">
              {formatCoords(selectedWp.lat, selectedWp.lng)}
            </p>
          </div>
          {selectedWp.photos && selectedWp.photos.length > 0 && (
            <button
              type="button"
              onClick={() => onPhotoClick?.(selectedWp.photos[0], selectedWp)}
              className="w-12 h-12 rounded-lg overflow-hidden border border-[#E2E8F0] shrink-0 cursor-pointer"
            >
              <img
                src={selectedWp.photos[0]}
                alt={selectedWp.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </button>
          )}
        </div>
      )}

      {interactiveClick && (
        <div className="pointer-events-none absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm border border-[#E2E8F0] px-2.5 py-1 rounded-lg text-[11px] text-[#0F172A] shadow-xs z-20">
          Tap map to pinpoint · Drag to pan
        </div>
      )}

      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-2 right-2 z-20 bg-white/85 px-2 py-0.5 rounded text-[10px] text-[#475569] hover:underline"
      >
        © OpenStreetMap
      </a>
    </div>
  );
}

function OfflineRouteCanvas({
  waypoints,
  draftPin = null,
  draftPinLabel = 'New Pin',
  selectedWaypointId = null,
  onSelectWaypoint,
  heightClassName = 'h-[420px] sm:h-[460px]',
  onPhotoClick,
  offlineReason,
}: {
  waypoints: Waypoint[];
  draftPin?: LatLngLiteral | null;
  draftPinLabel?: string;
  selectedWaypointId?: string | null;
  onSelectWaypoint?: (wp: Waypoint | null) => void;
  heightClassName?: string;
  onPhotoClick?: (photoUrl: string, waypoint: Waypoint) => void;
  offlineReason: string;
}) {
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const effectiveSelectedId = selectedWaypointId ?? localSelectedId;
  const selectedWp = waypoints.find((w) => w.id === effectiveSelectedId) || null;

  const projected = useMemo(() => {
    const allCoords: LatLngLiteral[] = [
      ...waypoints.map((w) => ({ lat: w.lat, lng: w.lng })),
      ...(draftPin ? [draftPin] : []),
    ];
    if (allCoords.length === 0) {
      return {
        wpPositions: [] as { wp: Waypoint; x: number; y: number; index: number }[],
        draftPos: null as { x: number; y: number } | null,
        polylinePoints: '',
      };
    }

    const lats = allCoords.map((c) => c.lat);
    const lngs = allCoords.map((c) => c.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latSpan = Math.max(maxLat - minLat, 0.004);
    const lngSpan = Math.max(maxLng - minLng, 0.004);

    const project = (lat: number, lng: number) => {
      const pad = 16;
      const x =
        allCoords.length === 1
          ? 50
          : pad + ((lng - minLng) / lngSpan) * (100 - pad * 2);
      const y =
        allCoords.length === 1
          ? 50
          : pad + (1 - (lat - minLat) / latSpan) * (100 - pad * 2);
      return { x, y };
    };

    const wpPositions = waypoints.map((wp, index) => ({
      wp,
      index,
      ...project(wp.lat, wp.lng),
    }));
    const draftPos = draftPin ? project(draftPin.lat, draftPin.lng) : null;
    const polylinePoints = wpPositions.map((p) => `${p.x},${p.y}`).join(' ');

    return { wpPositions, draftPos, polylinePoints };
  }, [waypoints, draftPin]);

  return (
    <div
      style={{ minHeight: '240px' }}
      className={`relative w-full shrink-0 ${heightClassName} rounded-2xl overflow-hidden border border-[#C7D2FE] bg-gradient-to-br from-[#F8FAFC] via-[#EEF2FF] to-[#E0E7FF] flex flex-col justify-between p-4`}
    >
      {/* Top status bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/95 border border-[#E2E8F0] text-xs font-medium text-[#0F172A] shadow-xs">
          <WifiOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>{offlineReason}</span>
        </div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/90 border border-[#E2E8F0] text-[11px] font-mono text-[#475569]">
          <Compass className="w-3.5 h-3.5 text-[#4F46E5]" />
          <span>N ↑ · {waypoints.length} pts</span>
        </div>
      </div>

      {/* Topographic grid + SVG polyline */}
      {projected.wpPositions.length === 0 && !projected.draftPos ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <MapPin className="w-8 h-8 text-[#4F46E5] mb-2" />
          <p className="text-sm font-medium text-[#0F172A]">Offline Route Canvas Ready</p>
          <p className="text-xs text-[#475569] mt-1 max-w-xs">
            Tap Current GPS (works via phone satellites without internet) or enter coordinates to plot
            your route locally.
          </p>
        </div>
      ) : (
        <div className="relative flex-1 my-2 min-h-0">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full opacity-35 pointer-events-none"
          >
            <defs>
              <pattern id="offlineGrid" width="12.5" height="12.5" patternUnits="userSpaceOnUse">
                <path
                  d="M 12.5 0 L 0 0 0 12.5"
                  fill="none"
                  stroke="#94A3B8"
                  strokeWidth="0.3"
                />
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#offlineGrid)" />
            {projected.wpPositions.length >= 2 && (
              <polyline
                fill="none"
                stroke="#4F46E5"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={projected.polylinePoints}
              />
            )}
          </svg>

          {/* Interactive HTML markers layered over normalized coords */}
          {projected.wpPositions.map(({ wp, x, y, index }) => {
            const isStart = index === 0;
            const isEnd = projected.wpPositions.length > 1 && index === projected.wpPositions.length - 1;
            const isSelected = selectedWp?.id === wp.id;
            return (
              <button
                key={wp.id}
                type="button"
                title={wp.name}
                onClick={() => {
                  setLocalSelectedId(wp.id);
                  onSelectWaypoint?.(wp);
                }}
                style={{ left: `${x}%`, top: `${y}%` }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 min-w-7 h-7 px-1.5 rounded-full border-2 shadow-md flex items-center justify-center text-xs font-mono font-semibold tabular-nums cursor-pointer trail-transition ${
                  isSelected
                    ? 'bg-[#6D28D9] text-white border-white scale-115 z-20'
                    : isStart
                      ? 'bg-[#4F46E5] text-white border-white z-10'
                      : isEnd
                        ? 'bg-[#2563EB] text-white border-white z-10'
                        : 'bg-white text-[#0F172A] border-[#4F46E5] z-10'
                }`}
              >
                {isStart ? 'S' : index + 1}
              </button>
            );
          })}

          {projected.draftPos && (
            <div
              style={{ left: `${projected.draftPos.x}%`, top: `${projected.draftPos.y}%` }}
              className="absolute -translate-x-1/2 -translate-y-full z-30 flex flex-col items-center pointer-events-none"
            >
              <div className="px-2 py-0.5 rounded-md bg-[#2563EB] text-white text-[11px] font-medium shadow-md flex items-center gap-1 whitespace-nowrap">
                <MapPin className="w-3 h-3" />
                <span>{draftPinLabel}</span>
              </div>
              <div className="w-2.5 h-2.5 rounded-full bg-[#2563EB] border-2 border-white shadow mt-0.5" />
            </div>
          )}
        </div>
      )}

      {/* Selected waypoint inspector or offline hint */}
      {selectedWp ? (
        <div className="relative z-10 bg-white/95 backdrop-blur-sm border border-[#E2E8F0] rounded-xl p-3 flex items-center justify-between gap-3 shadow-sm">
          <div className="min-w-0">
            <p className="text-[11px] font-mono text-[#475569] truncate">
              #{selectedWp.orderIndex + 1} · {CATEGORY_LABELS[selectedWp.category] || selectedWp.category}
              {selectedWp.elevationM !== null ? ` · ${formatElevation(selectedWp.elevationM)}` : ''}
            </p>
            <p className="text-sm font-semibold text-[#0F172A] truncate">{selectedWp.name}</p>
            <p className="text-[11px] font-mono text-[#475569] tabular-nums">
              {formatCoords(selectedWp.lat, selectedWp.lng)}
            </p>
          </div>
          {selectedWp.photos && selectedWp.photos.length > 0 && (
            <button
              type="button"
              onClick={() => onPhotoClick?.(selectedWp.photos[0], selectedWp)}
              className="w-14 h-14 rounded-lg overflow-hidden border border-[#E2E8F0] shrink-0 cursor-pointer"
            >
              <img
                src={selectedWp.photos[0]}
                alt={selectedWp.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </button>
          )}
        </div>
      ) : (
        <div className="relative z-10 bg-white/90 border border-[#E2E8F0] rounded-xl px-3 py-2 text-[11px] text-[#475569]">
          Offline route plot active. Interactive map tiles resume automatically when internet returns.
        </div>
      )}
    </div>
  );
}

export function TrailMap(props: TrailMapProps) {
  const apiCtx = useContext(APIProviderContext);
  const isOnline = useOnlineStatus();

  if (!isOnline) {
    return (
      <OfflineRouteCanvas
        waypoints={props.waypoints}
        draftPin={props.draftPin}
        draftPinLabel={props.draftPinLabel}
        selectedWaypointId={props.selectedWaypointId}
        onSelectWaypoint={props.onSelectWaypoint}
        heightClassName={props.heightClassName}
        onPhotoClick={props.onPhotoClick}
        offlineReason="Offline Route View"
      />
    );
  }

  if (!apiCtx) {
    return <FallbackTileMap {...props} />;
  }

  return <TrailMapInner {...props} />;
}

function TrailMapInner(props: TrailMapProps) {
  const {
    waypoints,
    draftPin = null,
    draftPinLabel = 'New Pin',
    selectedWaypointId = null,
    onSelectWaypoint,
    interactiveClick = false,
    onMapClick,
    defaultCenter = DEFAULT_HIMALAYAN_CENTER,
    defaultZoom = 11,
    heightClassName = 'h-[420px] sm:h-[460px]',
    onPhotoClick,
  } = props;

  const apiStatus = useApiLoadingStatus();
  const [quotaOrAuthFailed, setQuotaOrAuthFailed] = useState(false);
  const [activeWp, setActiveWp] = useState<Waypoint | null>(null);
  const [activeAnchor, setActiveAnchor] =
    useState<google.maps.marker.AdvancedMarkerElement | null>(null);

  useEffect(() => {
    const onFail = () => setQuotaOrAuthFailed(true);
    window.addEventListener('gmp-quota-exceeded', onFail);
    return () => window.removeEventListener('gmp-quota-exceeded', onFail);
  }, []);

  const pathPoints: LatLngLiteral[] = useMemo(
    () => waypoints.map((w) => ({ lat: w.lat, lng: w.lng })),
    [waypoints]
  );

  const allBoundsPoints = useMemo(
    () => (draftPin ? [...pathPoints, draftPin] : pathPoints),
    [pathPoints, draftPin]
  );

  const selectedWaypoint = selectedWaypointId
    ? waypoints.find((w) => w.id === selectedWaypointId) || null
    : activeWp;

  const focusPoint = useMemo(() => {
    if (draftPin) return draftPin;
    if (selectedWaypointId && selectedWaypoint) {
      return { lat: selectedWaypoint.lat, lng: selectedWaypoint.lng };
    }
    return null;
  }, [draftPin, selectedWaypointId, selectedWaypoint]);

  const handleMarkerSelect = useCallback(
    (wp: Waypoint, marker: google.maps.marker.AdvancedMarkerElement) => {
      setActiveWp(wp);
      setActiveAnchor(marker);
      onSelectWaypoint?.(wp);
    },
    [onSelectWaypoint]
  );

  if (
    quotaOrAuthFailed ||
    apiStatus === APILoadingStatus.FAILED ||
    apiStatus === APILoadingStatus.AUTH_FAILURE
  ) {
    return <FallbackTileMap {...props} />;
  }

  const initialCenter =
    allBoundsPoints.length > 0 ? allBoundsPoints[0] : defaultCenter;

  return (
    <div
      style={{ minHeight: '240px' }}
      className={`relative w-full shrink-0 ${heightClassName} rounded-2xl overflow-hidden border border-[#E2E8F0] bg-[#EEF1FA]`}
    >
      <GoogleMap
        mapId="DEMO_MAP_ID"
        defaultCenter={initialCenter}
        defaultZoom={defaultZoom}
        mapTypeId="terrain"
        gestureHandling="greedy"
        mapTypeControl={true}
        streetViewControl={false}
        fullscreenControl={true}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{ width: '100%', height: '100%', minHeight: '240px' }}
        onClick={(ev) => {
          if (interactiveClick && ev.detail.latLng && onMapClick) {
            onMapClick({
              lat: Number(ev.detail.latLng.lat.toFixed(6)),
              lng: Number(ev.detail.latLng.lng.toFixed(6)),
            });
          } else {
            setActiveWp(null);
            setActiveAnchor(null);
          }
        }}
      >
        <BoundsController points={allBoundsPoints} focusPoint={focusPoint} />

        {pathPoints.length >= 2 && (
          <Polyline
            path={pathPoints}
            strokeColor="#4F46E5"
            strokeOpacity={0.92}
            strokeWeight={3.5}
            geodesic={true}
          />
        )}

        {waypoints.map((wp, idx) => (
          <WaypointMarker
            key={wp.id}
            waypoint={wp}
            index={idx}
            total={waypoints.length}
            isSelected={selectedWaypoint?.id === wp.id}
            onSelect={handleMarkerSelect}
          />
        ))}

        {draftPin && (
          <AdvancedMarker position={draftPin} zIndex={1200} title={draftPinLabel}>
            <div className="flex flex-col items-center">
              <div className="px-2.5 py-1 rounded-md bg-[#2563EB] text-white text-xs font-medium shadow-md flex items-center gap-1 whitespace-nowrap">
                <MapPin className="w-3 h-3" />
                <span>{draftPinLabel}</span>
              </div>
              <div className="w-2.5 h-2.5 rounded-full bg-[#2563EB] border-2 border-white shadow mt-1" />
            </div>
          </AdvancedMarker>
        )}

        {activeWp && activeAnchor && (
          <InfoWindow
            anchor={activeAnchor}
            pixelOffset={[0, -6]}
            onCloseClick={() => {
              setActiveWp(null);
              setActiveAnchor(null);
            }}
          >
            <div className="max-w-[240px] p-1 text-[#0F172A]">
              <p className="text-xs font-mono text-[#475569] mb-0.5">
                #{activeWp.orderIndex + 1} · {CATEGORY_LABELS[activeWp.category] || activeWp.category}
              </p>
              <h4 className="font-semibold text-sm leading-snug mb-1">
                {activeWp.name}
              </h4>
              <p className="text-[11px] font-mono text-[#475569] tabular-nums mb-1.5">
                {formatCoords(activeWp.lat, activeWp.lng)}
                {activeWp.elevationM !== null ? ` · ${formatElevation(activeWp.elevationM)}` : ''}
              </p>
              {activeWp.photos && activeWp.photos.length > 0 && (
                <button
                  type="button"
                  onClick={() => onPhotoClick?.(activeWp.photos[0], activeWp)}
                  className="block w-full mb-2 rounded-lg overflow-hidden cursor-pointer"
                >
                  <img
                    src={activeWp.photos[0]}
                    alt={activeWp.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-24 object-cover"
                  />
                </button>
              )}
              {activeWp.note && (
                <p className="text-xs text-[#334155] leading-relaxed line-clamp-3">
                  {activeWp.note}
                </p>
              )}
              <p className="text-[11px] text-[#475569] mt-1.5">
                {formatTimestampTime(activeWp.reachedAt)}
              </p>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {interactiveClick && (
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 sm:right-auto bg-white/95 backdrop-blur-sm border border-[#E2E8F0] px-3 py-1.5 rounded-lg text-xs text-[#0F172A] shadow-sm">
          Tap or click the map to pinpoint your location
        </div>
      )}
    </div>
  );
}
