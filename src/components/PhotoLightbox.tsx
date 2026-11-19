import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { formatCoords, formatElevation, formatTimestampTime } from '../lib/geo';
import type { Waypoint } from '../types/trail';

export interface LightboxItem {
  photoUrl: string;
  waypoint: Waypoint;
}

interface PhotoLightboxProps {
  items: LightboxItem[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  onClose: () => void;
}

export function PhotoLightbox({
  items,
  currentIndex,
  onNavigate,
  onClose,
}: PhotoLightboxProps) {
  const current = items[currentIndex];

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && currentIndex > 0) onNavigate(currentIndex - 1);
      if (e.key === 'ArrowRight' && currentIndex < items.length - 1) onNavigate(currentIndex + 1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentIndex, items.length, onClose, onNavigate]);

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#090D16]/95 backdrop-blur-sm flex flex-col justify-between p-4 md:p-8"
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between text-white/90"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <p className="text-xs font-mono text-white/60 tabular-nums">
            Photo {currentIndex + 1} of {items.length} · Waypoint #{current.waypoint.orderIndex + 1}
          </p>
          <h3 className="text-lg font-medium truncate">{current.waypoint.name}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close lightbox"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer trail-transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div
        className="relative flex-1 flex items-center justify-center my-4 min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        {currentIndex > 0 && (
          <button
            type="button"
            onClick={() => onNavigate(currentIndex - 1)}
            aria-label="Previous photo"
            className="absolute left-2 md:left-4 z-10 p-3 rounded-full bg-black/50 hover:bg-black/80 text-white cursor-pointer trail-transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <img
          src={current.photoUrl}
          alt={current.waypoint.name}
          referrerPolicy="no-referrer"
          className="max-h-full max-w-full object-contain rounded-xl shadow-2xl"
        />

        {currentIndex < items.length - 1 && (
          <button
            type="button"
            onClick={() => onNavigate(currentIndex + 1)}
            aria-label="Next photo"
            className="absolute right-2 md:right-4 z-10 p-3 rounded-full bg-black/50 hover:bg-black/80 text-white cursor-pointer trail-transition"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      <div
        className="max-w-3xl mx-auto w-full text-white/85 flex flex-col md:flex-row md:items-end justify-between gap-3 pt-2 border-t border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm leading-relaxed text-white/80">
          {current.waypoint.note || 'Captured along the route.'}
        </p>
        <p className="text-xs font-mono text-white/60 tabular-nums shrink-0">
          {formatCoords(current.waypoint.lat, current.waypoint.lng)}
          {current.waypoint.elevationM !== null ? ` · ${formatElevation(current.waypoint.elevationM)}` : ''}
          {' · '}
          {formatTimestampTime(current.waypoint.reachedAt)}
        </p>
      </div>
    </div>
  );
}
