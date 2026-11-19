import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ExternalLink,
  LogOut,
  Plus,
  Share2,
  Upload,
  User as UserIcon,
} from 'lucide-react';
import { compressImageToDataUrl, formatDistance } from '../lib/geo';
import { updatePublicProfile } from '../services/trailService';
import { BLUEPRINT_LIMITS, type PublicProfile, type Trek } from '../types/trail';
import { TrekCard } from './TrekCard';

interface ProfileViewProps {
  profile: PublicProfile;
  myTreks: Trek[];
  initialTab?: 'portfolio' | 'settings';
  onStartTrek: () => void;
  onOpenTrek: (trek: Trek) => void;
  onResumeActive: (trekId: string) => void;
  onPreviewPublic: (handle: string) => void;
  onProfileUpdated: (updated: PublicProfile) => void;
  onSignOut: () => void;
}

export function ProfileView({
  profile,
  myTreks,
  initialTab = 'portfolio',
  onStartTrek,
  onOpenTrek,
  onResumeActive,
  onPreviewPublic,
  onProfileUpdated,
  onSignOut,
}: ProfileViewProps) {
  const [tab, setTab] = useState<'portfolio' | 'settings'>(initialTab);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'private'>('all');

  const [displayName, setDisplayName] = useState(profile.displayName);
  const [handle, setHandle] = useState(profile.handle);
  const [homeBase, setHomeBase] = useState(profile.homeBase);
  const [bio, setBio] = useState(profile.bio);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setDisplayName(profile.displayName);
    setHandle(profile.handle);
    setHomeBase(profile.homeBase);
    setBio(profile.bio);
    setAvatarUrl(profile.avatarUrl);
  }, [profile.uid, profile.displayName, profile.handle, profile.homeBase, profile.bio, profile.avatarUrl]);

  const activeTreks = useMemo(() => myTreks.filter((t) => t.status === 'active'), [myTreks]);
  const completedTreks = useMemo(
    () => myTreks.filter((t) => t.status === 'completed'),
    [myTreks]
  );

  const filteredTreks = useMemo(() => {
    if (filter === 'active') return activeTreks;
    if (filter === 'completed') return completedTreks;
    if (filter === 'private') return myTreks.filter((t) => !t.isPublic);
    return myTreks;
  }, [filter, myTreks, activeTreks, completedTreks]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file, 160000);
      setAvatarUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process avatar image.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedNotice(false);
    try {
      await updatePublicProfile(profile.uid, {
        displayName,
        handle,
        bio,
        homeBase,
        avatarUrl,
      });
      onProfileUpdated({
        ...profile,
        displayName: displayName.trim() || profile.displayName,
        handle: handle.trim().toLowerCase() || profile.handle,
        bio: bio.trim(),
        homeBase: homeBase.trim(),
        avatarUrl,
      });
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyPortfolioLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?trekker=${encodeURIComponent(profile.handle)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8 sm:space-y-10">
      {/* Header Summary Card */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 md:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shadow-xs">
        <div className="flex items-start gap-4 sm:gap-5">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-[#EEF1FA] border border-[#E2E8F0] shrink-0 flex items-center justify-center">
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

          <div className="space-y-1 min-w-0">
            <p className="text-xs font-mono text-[#4F46E5] truncate">
              @{profile.handle}
              {profile.homeBase ? ` · ${profile.homeBase}` : ''}
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-[#0F172A]">
              {profile.displayName}
            </h1>
            <p className="text-sm text-[#475569] max-w-xl leading-relaxed">{profile.bio}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={() => void handleCopyPortfolioLink()}
            className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] py-2 text-xs font-medium text-[#0F172A] bg-[#F6F7FB] border border-[#E2E8F0] rounded-xl hover:bg-[#EEF2FF] hover:border-[#C7D2FE] whitespace-nowrap shrink-0 cursor-pointer trail-transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#4F46E5]" /> : <Share2 className="w-3.5 h-3.5 text-[#4F46E5]" />}
            <span>{copied ? 'Link Copied' : 'Copy Public Link'}</span>
          </button>

          <button
            type="button"
            onClick={() => onPreviewPublic(profile.handle)}
            className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] py-2 text-xs font-medium text-[#0F172A] bg-[#F6F7FB] border border-[#E2E8F0] rounded-xl hover:bg-[#EEF2FF] hover:border-[#C7D2FE] whitespace-nowrap shrink-0 cursor-pointer trail-transition"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[#2563EB]" />
            <span>Public View</span>
          </button>

          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] py-2 text-xs font-medium text-[#475569] bg-white border border-[#E2E8F0] rounded-xl hover:text-[#0F172A] hover:border-[#CBD5E1] whitespace-nowrap shrink-0 cursor-pointer trail-transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </section>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4">
        <div className="flex items-center gap-1 p-1 bg-[#EEF1FA] border border-[#E2E8F0] rounded-xl overflow-x-auto no-scrollbar max-w-full">
          <button
            type="button"
            onClick={() => setTab('portfolio')}
            className={`px-4 min-h-[36px] py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer trail-transition ${
              tab === 'portfolio' ? 'bg-white text-[#4F46E5] shadow-xs' : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            My Trips ({myTreks.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('settings')}
            className={`px-4 min-h-[36px] py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer trail-transition ${
              tab === 'settings' ? 'bg-white text-[#4F46E5] shadow-xs' : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Profile Details
          </button>
        </div>

        <div className="flex items-center gap-5 sm:gap-6 text-xs font-mono tabular-nums text-[#475569]">
          <span>{completedTreks.length} completed</span>
          <span>{activeTreks.length} active</span>
          <span>
            {formatDistance(myTreks.reduce((s, t) => s + (t.distanceKm || 0), 0))} total
          </span>
        </div>
      </div>

      {tab === 'portfolio' ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-1 p-1 bg-[#EEF1FA] border border-[#E2E8F0] rounded-xl overflow-x-auto no-scrollbar max-w-full">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'active', label: `Active (${activeTreks.length})` },
                  { id: 'completed', label: `Completed (${completedTreks.length})` },
                  { id: 'private', label: 'Private' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`px-3 min-h-[36px] py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer trail-transition ${
                    filter === item.id ? 'bg-white text-[#4F46E5] shadow-xs' : 'text-[#475569] hover:text-[#0F172A]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onStartTrek}
              className="inline-flex items-center gap-1.5 px-4 min-h-[44px] py-2 text-xs font-medium text-white bg-gradient-to-r from-[#5B21B6] via-[#4F46E5] to-[#2563EB] hover:from-[#4C1D95] hover:via-[#4338CA] hover:to-[#1D4ED8] rounded-xl shadow-sm shadow-indigo-500/15 whitespace-nowrap shrink-0 cursor-pointer trail-transition"
            >
              <Plus className="w-4 h-4" />
              <span>New Trip</span>
            </button>
          </div>

          {filteredTreks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTreks.map((trek) => (
                <TrekCard
                  key={trek.id}
                  trek={trek}
                  onOpenTrek={(selected) => {
                    if (selected.status === 'active') {
                      onResumeActive(selected.id);
                    } else {
                      onOpenTrek(selected);
                    }
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-10 text-center">
              <p className="text-sm text-[#475569] mb-4">
                No trips logged in this view yet.
              </p>
              <button
                type="button"
                onClick={onStartTrek}
                className="px-5 min-h-[44px] py-2.5 text-sm font-medium text-white bg-gradient-to-r from-[#5B21B6] via-[#4F46E5] to-[#2563EB] hover:from-[#4C1D95] hover:via-[#4338CA] hover:to-[#1D4ED8] rounded-xl shadow-sm shadow-indigo-500/15 cursor-pointer trail-transition"
              >
                Start a Trip
              </button>
            </div>
          )}
        </div>
      ) : (
        <form
          onSubmit={(e) => void handleSaveProfile(e)}
          className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 md:p-8 max-w-2xl space-y-5 shadow-xs"
        >
          <h2 className="text-lg font-semibold text-[#0F172A]">Public Portfolio Settings</h2>

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#EEF1FA] border border-[#E2E8F0] flex items-center justify-center shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserIcon className="w-6 h-6 text-[#4F46E5]" />
              )}
            </div>
            <label className="inline-flex items-center gap-2 px-3.5 min-h-[40px] py-2 text-xs font-medium text-[#0F172A] bg-[#F6F7FB] border border-[#E2E8F0] rounded-xl hover:bg-[#EEF2FF] hover:border-[#C7D2FE] cursor-pointer trail-transition">
              <Upload className="w-3.5 h-3.5 text-[#4F46E5]" />
              <span>Upload Avatar</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => void handleAvatarUpload(e)}
                className="hidden"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={BLUEPRINT_LIMITS.DISPLAY_NAME_MAX}
                required
                className="w-full px-3.5 min-h-[44px] py-2.5 text-base sm:text-sm border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
                Portfolio Handle
              </label>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                minLength={BLUEPRINT_LIMITS.HANDLE_MIN}
                maxLength={BLUEPRINT_LIMITS.HANDLE_MAX}
                required
                className="w-full px-3.5 min-h-[44px] py-2.5 text-base sm:text-sm font-mono border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#0F172A] mb-1.5">
              Home Base / Region
            </label>
            <input
              type="text"
              value={homeBase}
              onChange={(e) => setHomeBase(e.target.value)}
              maxLength={BLUEPRINT_LIMITS.HOME_BASE_MAX}
              placeholder="e.g., Pokhara, Nepal or Chamonix, France"
              className="w-full px-3.5 min-h-[44px] py-2.5 text-base sm:text-sm border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#0F172A] mb-1.5">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={BLUEPRINT_LIMITS.BIO_MAX}
              rows={3}
              className="w-full px-3.5 py-2.5 text-base sm:text-sm border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5] resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="px-5 min-h-[44px] py-2.5 text-sm font-medium text-white bg-gradient-to-r from-[#5B21B6] via-[#4F46E5] to-[#2563EB] hover:from-[#4C1D95] hover:via-[#4338CA] hover:to-[#1D4ED8] rounded-xl shadow-sm shadow-indigo-500/15 disabled:opacity-50 cursor-pointer trail-transition"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            {savedNotice && (
              <span className="text-xs text-[#4F46E5] font-medium">Profile saved.</span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
