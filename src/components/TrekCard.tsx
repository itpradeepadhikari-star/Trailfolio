import { Mountain } from 'lucide-react';
import { formatDistance, formatElevation, formatTimestamp } from '../lib/geo';
import type { Trek } from '../types/trail';

interface TrekCardProps {
  trek: Trek;
  onOpenTrek: (trek: Trek) => void;
  onOpenTrekker?: (handle: string) => void;
  featured?: boolean;
}

export function TrekCard({
  trek,
  onOpenTrek,
  onOpenTrekker,
  featured = false,
}: TrekCardProps) {
  const aspectClass = featured ? 'aspect-[16/10]' : 'aspect-[4/3]';

  return (
    <article className="group bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden flex flex-col hover:border-[#C7D2FE] trail-transition">
      <button
        type="button"
        onClick={() => onOpenTrek(trek)}
        className={`relative w-full ${aspectClass} bg-[#EEF1FA] overflow-hidden text-left cursor-pointer`}
      >
        {trek.coverPhotoDataUrl ? (
          <img
            src={trek.coverPhotoDataUrl}
            alt={trek.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover group-hover:scale-[1.02] trail-transition"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#EEF2FF] via-[#E0E7FF] to-[#DBEAFE] flex flex-col items-center justify-center p-6 text-center">
            <Mountain className="w-8 h-8 text-[#4F46E5]/80 mb-2" />
            <span className="text-xs font-mono text-[#475569] tabular-nums">
              {trek.startLocationName}
            </span>
          </div>
        )}
      </button>

      <div className="p-5 flex-1 flex flex-col justify-between gap-4">
        <div>
          <p className="text-xs text-[#475569] mb-1.5 truncate">
            <span>{trek.region}</span>
            <span aria-hidden="true"> · </span>
            <span>{trek.difficulty}</span>
            {trek.status === 'active' && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="text-[#2563EB] font-medium">In Progress</span>
              </>
            )}
            {!trek.isPublic && (
              <>
                <span aria-hidden="true"> · </span>
                <span>Private</span>
              </>
            )}
          </p>

          <button
            type="button"
            onClick={() => onOpenTrek(trek)}
            className="text-left cursor-pointer"
          >
            <h3 className="text-lg font-semibold text-[#0F172A] leading-snug group-hover:text-[#4F46E5] trail-transition line-clamp-2">
              {trek.title}
            </h3>
          </button>

          {trek.summary && (
            <p className="mt-2 text-sm text-[#475569] leading-relaxed line-clamp-2">
              {trek.summary}
            </p>
          )}
        </div>

        <div className="pt-3 border-t border-[#F1F5F9] flex items-center justify-between gap-3 text-xs text-[#475569]">
          <span className="font-mono tabular-nums truncate">
            {formatDistance(trek.distanceKm)} · {trek.waypointCount} pts · {formatElevation(trek.maxElevationM)}
          </span>
          {onOpenTrekker ? (
            <button
              type="button"
              onClick={() => onOpenTrekker(trek.ownerHandle)}
              className="font-medium text-[#0F172A] hover:text-[#4F46E5] hover:underline whitespace-nowrap shrink-0 cursor-pointer py-1"
            >
              @{trek.ownerHandle}
            </button>
          ) : (
            <span className="whitespace-nowrap shrink-0">
              {formatTimestamp(trek.completedAt || trek.startedAt)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
