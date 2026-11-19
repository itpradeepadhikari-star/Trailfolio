import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
import { Compass, MapPin, WifiOff } from 'lucide-react';
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

  useEffect(() => {
    if (!map) return;
    if (focusPoint) {
      map.panTo(focusPoint);
      if ((map.getZoom() ?? 10) < 12) {
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
  }, [map, points, focusPoint]);

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
      className={`relative w-full ${heightClassName} rounded-2xl overflow-hidden border border-[#C7D2FE] bg-gradient-to-br from-[#F8FAFC] via-[#EEF2FF] to-[#E0E7FF] flex flex-col justify-between p-4`}
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
          Offline route plot active. Interactive satellite &amp; terrain tiles resume automatically when internet is available.
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
    return (
      <OfflineRouteCanvas
        waypoints={props.waypoints}
        draftPin={props.draftPin}
        draftPinLabel={props.draftPinLabel}
        selectedWaypointId={props.selectedWaypointId}
        onSelectWaypoint={props.onSelectWaypoint}
        heightClassName={props.heightClassName}
        onPhotoClick={props.onPhotoClick}
        offlineReason="Offline Route Plot"
      />
    );
  }
  return <TrailMapInner {...props} />;
}

function TrailMapInner({
  waypoints,
  draftPin = null,
  draftPinLabel = 'New Pin',
  selectedWaypointId = null,
  onSelectWaypoint,
  interactiveClick = false,
  onMapClick,
  defaultCenter = DEFAULT_HIMALAYAN_CENTER,
  defaultZoom = 11,
  heightClassName = 'h-[460px]',
  onPhotoClick,
}: TrailMapProps) {
  const apiStatus = useApiLoadingStatus();
  const [activeWp, setActiveWp] = useState<Waypoint | null>(null);
  const [activeAnchor, setActiveAnchor] =
    useState<google.maps.marker.AdvancedMarkerElement | null>(null);

  const pathPoints: LatLngLiteral[] = waypoints.map((w) => ({
    lat: w.lat,
    lng: w.lng,
  }));

  const allBoundsPoints = draftPin ? [...pathPoints, draftPin] : pathPoints;

  const selectedWaypoint = selectedWaypointId
    ? waypoints.find((w) => w.id === selectedWaypointId) || null
    : activeWp;

  const focusPoint = draftPin
    ? draftPin
    : selectedWaypointId && selectedWaypoint
      ? { lat: selectedWaypoint.lat, lng: selectedWaypoint.lng }
      : null;

  const handleMarkerSelect = useCallback(
    (wp: Waypoint, marker: google.maps.marker.AdvancedMarkerElement) => {
      setActiveWp(wp);
      setActiveAnchor(marker);
      onSelectWaypoint?.(wp);
    },
    [onSelectWaypoint]
  );

  if (apiStatus === APILoadingStatus.FAILED || apiStatus === APILoadingStatus.AUTH_FAILURE) {
    return (
      <OfflineRouteCanvas
        waypoints={waypoints}
        draftPin={draftPin}
        draftPinLabel={draftPinLabel}
        selectedWaypointId={selectedWaypointId}
        onSelectWaypoint={onSelectWaypoint}
        heightClassName={heightClassName}
        onPhotoClick={onPhotoClick}
        offlineReason="Route Plot (Map Tiles Offline)"
      />
    );
  }

  const initialCenter =
    allBoundsPoints.length > 0 ? allBoundsPoints[0] : defaultCenter;

  return (
    <div
      className={`relative w-full ${heightClassName} rounded-2xl overflow-hidden border border-[#E2E8F0] bg-[#EEF1FA]`}
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
        style={{ width: '100%', height: '100%' }}
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
