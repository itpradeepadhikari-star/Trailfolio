import { useCallback, useContext, useEffect, useState } from 'react';
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
import { Compass, MapPin } from 'lucide-react';
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

export function TrailMap(props: TrailMapProps) {
  const apiCtx = useContext(APIProviderContext);
  if (!apiCtx) {
    return (
      <div
        className={`${props.heightClassName || 'h-[420px] sm:h-[460px]'} w-full bg-[#EEF1FA] border border-[#E2E8F0] rounded-2xl flex flex-col items-center justify-center p-6 text-center`}
      >
        <Compass className="w-8 h-8 text-[#475569] mb-3" />
        <p className="text-sm font-medium text-[#0F172A] mb-1">
          Map view requires a Google Maps API key
        </p>
        <p className="text-xs text-[#475569] max-w-sm">
          {props.waypoints.length} waypoints logged with coordinates.
        </p>
      </div>
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
      <div
        className={`${heightClassName} w-full bg-[#EEF1FA] border border-[#E2E8F0] rounded-2xl flex flex-col items-center justify-center p-6 text-center`}
      >
        <Compass className="w-8 h-8 text-[#475569] mb-3" />
        <p className="text-sm font-medium text-[#0F172A] mb-1">
          Interactive map unavailable
        </p>
        <p className="text-xs text-[#475569] max-w-sm">
          Coordinates and route logs are still preserved ({waypoints.length} waypoints recorded).
        </p>
      </div>
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
