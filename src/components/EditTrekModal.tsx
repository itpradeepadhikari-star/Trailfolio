import { useState } from 'react';
import { Camera, Trash2, Upload, X } from 'lucide-react';
import { DIFFICULTY_CONFIG, DIFFICULTY_LEVELS, normalizeDifficulty } from '../lib/difficulty';
import { compressImageToDataUrl } from '../lib/geo';
import { updateTrekDetails } from '../services/trailService';
import {
  BLUEPRINT_LIMITS,
  type Trek,
  type TrekDifficulty,
  type Waypoint,
} from '../types/trail';
import { CameraSnapModal } from './CameraSnapModal';

interface EditTrekModalProps {
  trek: Trek;
  waypoints: Waypoint[];
  onClose: () => void;
  onSaved?: () => void;
}

export function EditTrekModal({ trek, waypoints, onClose, onSaved }: EditTrekModalProps) {
  const [title, setTitle] = useState(trek.title);
  const [region, setRegion] = useState(trek.region);
  const [difficulty, setDifficulty] = useState<TrekDifficulty>(() => normalizeDifficulty(trek.difficulty));
  const [summary, setSummary] = useState(trek.summary || '');
  const [isPublic, setIsPublic] = useState(trek.isPublic);
  const [coverPhotoDataUrl, setCoverPhotoDataUrl] = useState(trek.coverPhotoDataUrl || '');
  const [showCamera, setShowCamera] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const waypointPhotos = Array.from(
    new Set(waypoints.flatMap((wp) => wp.photos || []).filter(Boolean))
  );

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setCoverPhotoDataUrl(dataUrl);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process cover image.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Enter a trip or route title.');
      return;
    }
    if (!region.trim()) {
      setError('Enter the region, park, city, or destination.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateTrekDetails({
        trek,
        waypoints,
        title: title.trim(),
        region: region.trim(),
        difficulty,
        summary: summary.trim(),
        isPublic,
        coverPhotoDataUrl,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save trip changes.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#090D16]/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-[#E2E8F0] rounded-t-3xl sm:rounded-2xl max-w-2xl w-full max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden">
        <div className="sm:hidden flex justify-center pt-2.5">
          <span className="w-10 h-1 rounded-full bg-[#CBD5E1]" aria-hidden="true" />
        </div>

        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#E2E8F0]">
          <div>
            <h2 className="text-lg font-semibold text-[#0F172A]">Edit Trip Details</h2>
            <p className="text-xs text-[#475569]">
              Update title, destination, difficulty, cover snap, notes, and visibility
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close edit trip dialog"
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl text-[#475569] hover:text-[#0F172A] hover:bg-[#EEF1FA] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 sm:p-6 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
                Trip or Route Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={BLUEPRINT_LIMITS.TREK_TITLE_MAX}
                placeholder="e.g., Annapurna Base Camp or Dolomites Traverse"
                className="w-full px-3.5 min-h-[44px] py-2.5 text-base sm:text-sm border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5]"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
                Region or Destination
              </label>
              <input
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                maxLength={BLUEPRINT_LIMITS.REGION_MAX}
                placeholder="e.g., Kaski, Nepal or Kyoto, Japan"
                className="w-full px-3.5 min-h-[44px] py-2.5 text-base sm:text-sm border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5]"
                required
              />
            </div>
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

          <div>
            <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
              Trip Summary &amp; Field Notes
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={BLUEPRINT_LIMITS.SUMMARY_MAX}
              rows={4}
              placeholder="Summarize highlights, trail or road conditions, gear tips, or favorite moments..."
              className="w-full px-3.5 py-2.5 text-base sm:text-sm border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5] resize-none"
            />
          </div>

          <div className="space-y-3 border-t border-[#E2E8F0] pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-[#0F172A]">Cover Snap</p>
                <p className="text-[11px] text-[#475569]">
                  Shown on portfolio cards and share previews
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  className="inline-flex items-center gap-1.5 px-3 min-h-[40px] py-1.5 text-xs font-medium text-[#0F172A] bg-[#F6F7FB] border border-[#E2E8F0] rounded-xl hover:bg-[#EEF2FF] hover:border-[#C7D2FE] cursor-pointer trail-transition"
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
                    onChange={(e) => void handleCoverUpload(e)}
                    className="hidden"
                  />
                </label>
                {coverPhotoDataUrl && (
                  <button
                    type="button"
                    onClick={() => setCoverPhotoDataUrl('')}
                    className="inline-flex items-center gap-1 px-3 min-h-[40px] py-1.5 text-xs font-medium text-red-700 bg-white border border-[#E2E8F0] rounded-xl hover:bg-red-50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </div>

            {coverPhotoDataUrl && (
              <div className="relative aspect-[16/9] max-h-48 w-full rounded-xl overflow-hidden border border-[#E2E8F0] bg-[#EEF1FA]">
                <img
                  src={coverPhotoDataUrl}
                  alt={title || trek.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {waypointPhotos.length > 0 && (
              <div>
                <p className="text-[11px] text-[#475569] mb-2">
                  Or pick an existing snap from your route stops:
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {waypointPhotos.map((src, idx) => {
                    const selected = coverPhotoDataUrl === src;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setCoverPhotoDataUrl(src)}
                        className={`relative w-20 h-16 shrink-0 rounded-xl overflow-hidden border-2 cursor-pointer trail-transition ${
                          selected ? 'border-[#4F46E5]' : 'border-[#E2E8F0] hover:border-[#C7D2FE]'
                        }`}
                      >
                        <img
                          src={src}
                          alt={`Route snap ${idx + 1}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#E2E8F0]">
            <div>
              <p className="text-sm font-medium text-[#0F172A]">Public Portfolio Visibility</p>
              <p className="text-xs text-[#475569]">
                Show this trip on your public portfolio link and explorer feed
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-[#EEF1FA] border border-[#E2E8F0] rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={`px-3 min-h-[34px] py-1 text-xs font-medium rounded-lg cursor-pointer trail-transition ${
                  isPublic ? 'bg-white text-[#4F46E5] shadow-xs' : 'text-[#475569]'
                }`}
              >
                Public
              </button>
              <button
                type="button"
                onClick={() => setIsPublic(false)}
                className={`px-3 min-h-[34px] py-1 text-xs font-medium rounded-lg cursor-pointer trail-transition ${
                  !isPublic ? 'bg-white text-[#4F46E5] shadow-xs' : 'text-[#475569]'
                }`}
              >
                Private
              </button>
            </div>
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
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {showCamera && (
        <CameraSnapModal
          onCapture={(dataUrl) => setCoverPhotoDataUrl(dataUrl)}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
