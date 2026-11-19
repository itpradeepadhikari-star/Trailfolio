import { useMemo, useState } from 'react';
import { ArrowLeft, Check, MapPin, Share2, User as UserIcon } from 'lucide-react';
import { formatDistance } from '../lib/geo';
import type { PublicProfile, Trek } from '../types/trail';
import { TrekCard } from './TrekCard';

interface PublicPortfolioViewProps {
  profile: PublicProfile;
  treks: Trek[];
  onBack: () => void;
  backLabel?: string;
  onOpenTrek: (trek: Trek) => void;
}

export function PublicPortfolioView({
  profile,
  treks,
  onBack,
  backLabel = 'Back to Explore',
  onOpenTrek,
}: PublicPortfolioViewProps) {
  const [copied, setCopied] = useState(false);

  const publicTreks = useMemo(
    () => treks.filter((t) => t.ownerId === profile.uid && t.isPublic),
    [treks, profile.uid]
  );

  const totalPhotos = useMemo(
    () => publicTreks.reduce((sum, t) => sum + (t.photoCount || 0), 0),
    [publicTreks]
  );

  const totalDistance = useMemo(
    () => publicTreks.reduce((sum, t) => sum + (t.distanceKm || 0), 0),
    [publicTreks]
  );

  const handleCopyUrl = async () => {
    const url = `${window.location.origin}${window.location.pathname}?trekker=${encodeURIComponent(profile.handle)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8 sm:space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[40px] inline-flex items-center gap-2 text-sm font-medium text-[#475569] hover:text-[#0F172A] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{backLabel}</span>
        </button>

        <button
          type="button"
          onClick={() => void handleCopyUrl()}
          className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-[#0F172A] bg-white border border-[#E2E8F0] rounded-lg hover:bg-[#F6F7FB] hover:border-[#C7D2FE] whitespace-nowrap shrink-0 cursor-pointer trail-transition"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-[#4F46E5]" /> : <Share2 className="w-3.5 h-3.5 text-[#4F46E5]" />}
          <span>{copied ? 'Portfolio Link Copied' : 'Share Portfolio'}</span>
        </button>
      </div>

      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 sm:gap-8">
        <div className="flex items-start gap-4 sm:gap-5">
          <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden bg-[#EEF1FA] border border-[#E2E8F0] shrink-0 flex items-center justify-center">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.displayName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <UserIcon className="w-8 h-8 text-[#4F46E5]" />
            )}
          </div>

          <div className="space-y-1.5 min-w-0">
            <p className="text-xs font-mono text-[#475569]">
              @{profile.handle}
              {profile.homeBase ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3 inline text-[#4F46E5]" />
                    {profile.homeBase}
                  </span>
                </>
              ) : null}
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-[#0F172A]">
              {profile.displayName}
            </h1>
            {profile.bio && (
              <p className="text-sm text-[#475569] max-w-xl leading-relaxed">
                {profile.bio}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 sm:gap-6 pt-4 md:pt-0 border-t md:border-t-0 md:border-l border-[#E2E8F0] md:pl-8 shrink-0">
          <div>
            <p className="text-xs text-[#475569]">Public Trips</p>
            <p className="text-xl font-semibold font-mono tabular-nums text-[#0F172A]">
              {publicTreks.length}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#475569]">Distance</p>
            <p className="text-xl font-semibold font-mono tabular-nums text-[#0F172A]">
              {formatDistance(totalDistance)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#475569]">Snaps</p>
            <p className="text-xl font-semibold font-mono tabular-nums text-[#0F172A]">
              {totalPhotos}
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight text-[#0F172A]">
          Trip &amp; Trail Archive
        </h2>

        {publicTreks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {publicTreks.map((trek) => (
              <TrekCard key={trek.id} trek={trek} onOpenTrek={onOpenTrek} />
            ))}
          </div>
        ) : (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 sm:p-10 text-center">
            <p className="text-sm text-[#475569]">
              {profile.displayName} has not published any public trips yet.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
