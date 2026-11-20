import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Pencil,
  Search,
  Shield,
  Trash2,
  User as UserIcon,
  UserCheck,
  X,
} from 'lucide-react';
import {
  formatCoords,
  formatDistance,
  formatElevation,
  formatTimestamp,
  formatTimestampTime,
  slugifyHandle,
} from '../lib/geo';
import {
  adminDeleteUserAndData,
  adminFetchTrekWaypoints,
  deleteTrekAndWaypoints,
  deleteWaypointFromActiveTrek,
  finishTrek,
  subscribeAllTreksForAdmin,
  subscribeAllUserControlsForAdmin,
  toggleTrekVisibility,
  updatePublicProfile,
  upsertUserControl,
} from '../services/trailService';
import {
  BLUEPRINT_LIMITS,
  SUPER_ADMIN_EMAIL,
  type PublicProfile,
  type Trek,
  type UserControl,
  type UserControlRole,
  type UserControlStatus,
  type Waypoint,
} from '../types/trail';
import { DifficultyBadge } from './DifficultyBadge';
import { EditTrekModal } from './EditTrekModal';
import { EditWaypointModal } from './EditWaypointModal';

interface AdminDashboardViewProps {
  adminUid: string;
  adminEmail: string;
  publicProfiles: PublicProfile[];
  onBack: () => void;
  onOpenTrek: (trek: Trek) => void;
  onOpenTrekker: (handle: string) => void;
}

type AdminSectionTab = 'users' | 'content';
type UserFilterMode = 'all' | 'active' | 'suspended' | 'moderator';
type ContentVisibilityFilter = 'all' | 'public' | 'private' | 'active' | 'completed';

export function AdminDashboardView({
  adminUid,
  adminEmail,
  publicProfiles,
  onBack,
  onOpenTrek,
  onOpenTrekker,
}: AdminDashboardViewProps) {
  const [allTreks, setAllTreks] = useState<Trek[]>([]);
  const [userControls, setUserControls] = useState<UserControl[]>([]);
  const [loadingAdminData, setLoadingAdminData] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [sectionTab, setSectionTab] = useState<AdminSectionTab>('users');

  // Users filters & modals
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState<UserFilterMode>('all');
  const [editingUser, setEditingUser] = useState<PublicProfile | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserHandle, setEditUserHandle] = useState('');
  const [editUserHomeBase, setEditUserHomeBase] = useState('');
  const [editUserBio, setEditUserBio] = useState('');
  const [savingUserEdit, setSavingUserEdit] = useState(false);

  const [moderatingUser, setModeratingUser] = useState<{
    profile: PublicProfile;
    nextStatus: UserControlStatus;
    role: UserControlRole;
    note: string;
  } | null>(null);
  const [savingModeration, setSavingModeration] = useState(false);

  const [confirmDeleteUser, setConfirmDeleteUser] = useState<PublicProfile | null>(null);
  const [deletingUserUid, setDeletingUserUid] = useState<string | null>(null);

  // Content filters & actions
  const [contentSearch, setContentSearch] = useState('');
  const [contentFilter, setContentFilter] = useState<ContentVisibilityFilter>('all');
  const [selectedOwnerUid, setSelectedOwnerUid] = useState<string | null>(null);
  const [busyTrekId, setBusyTrekId] = useState<string | null>(null);
  const [confirmDeleteTrekId, setConfirmDeleteTrekId] = useState<string | null>(null);

  const [expandedTrekId, setExpandedTrekId] = useState<string | null>(null);
  const [waypointsByTrek, setWaypointsByTrek] = useState<Record<string, Waypoint[]>>({});
  const [loadingWpsTrekId, setLoadingWpsTrekId] = useState<string | null>(null);
  const [editTrekState, setEditTrekState] = useState<{ trek: Trek; waypoints: Waypoint[] } | null>(
    null
  );
  const [editWaypointState, setEditWaypointState] = useState<{
    trek: Trek;
    waypoints: Waypoint[];
    waypoint: Waypoint;
  } | null>(null);

  useEffect(() => {
    let treksLoaded = false;
    let controlsLoaded = false;
    const markReady = () => {
      if (treksLoaded && controlsLoaded) {
        setLoadingAdminData(false);
      }
    };

    const unsubTreks = subscribeAllTreksForAdmin((items) => {
      setAllTreks(items);
      treksLoaded = true;
      markReady();
    });

    const unsubControls = subscribeAllUserControlsForAdmin((items) => {
      setUserControls(items);
      controlsLoaded = true;
      markReady();
    });

    return () => {
      unsubTreks();
      unsubControls();
    };
  }, []);

  const flashNotice = (msg: string) => {
    setActionSuccess(msg);
    setActionError(null);
    window.setTimeout(() => {
      setActionSuccess((curr) => (curr === msg ? null : curr));
    }, 3200);
  };

  const controlMap = useMemo(() => {
    const map = new Map<string, UserControl>();
    for (const c of userControls) {
      map.set(c.uid, c);
    }
    return map;
  }, [userControls]);

  const userRows = useMemo(() => {
    const treksByOwner = new Map<string, Trek[]>();
    for (const t of allTreks) {
      const list = treksByOwner.get(t.ownerId) || [];
      list.push(t);
      treksByOwner.set(t.ownerId, list);
    }

    return publicProfiles.map((profile) => {
      const ownerTreks = treksByOwner.get(profile.uid) || [];
      const control = controlMap.get(profile.uid);
      const status: UserControlStatus = control?.status === 'suspended' ? 'suspended' : 'active';
      const role: UserControlRole = control?.role === 'moderator' ? 'moderator' : 'user';
      const isSuperAdminAccount = profile.uid === adminUid;
      const publicCount = ownerTreks.filter((t) => t.isPublic).length;
      const privateCount = ownerTreks.filter((t) => !t.isPublic).length;
      const totalDistanceKm = ownerTreks.reduce((sum, t) => sum + (t.distanceKm || 0), 0);
      return {
        profile,
        control,
        status,
        role,
        isSuperAdminAccount,
        treksCount: ownerTreks.length,
        publicCount,
        privateCount,
        totalDistanceKm,
      };
    });
  }, [publicProfiles, allTreks, controlMap, adminUid]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase().replace(/^@+/, '');
    return userRows.filter((row) => {
      if (userFilter === 'active' && row.status !== 'active') return false;
      if (userFilter === 'suspended' && row.status !== 'suspended') return false;
      if (userFilter === 'moderator' && row.role !== 'moderator') return false;
      if (!q) return true;
      return (
        row.profile.displayName.toLowerCase().includes(q) ||
        row.profile.handle.toLowerCase().includes(q) ||
        row.profile.homeBase.toLowerCase().includes(q) ||
        row.profile.uid.toLowerCase().includes(q)
      );
    });
  }, [userRows, userSearch, userFilter]);

  const selectedOwnerProfile = useMemo(
    () => (selectedOwnerUid ? publicProfiles.find((p) => p.uid === selectedOwnerUid) || null : null),
    [selectedOwnerUid, publicProfiles]
  );

  const filteredTreks = useMemo(() => {
    const q = contentSearch.trim().toLowerCase();
    const handleQ = q.replace(/^@+/, '');
    return allTreks.filter((t) => {
      if (selectedOwnerUid && t.ownerId !== selectedOwnerUid) return false;
      if (contentFilter === 'public' && !t.isPublic) return false;
      if (contentFilter === 'private' && t.isPublic) return false;
      if (contentFilter === 'active' && t.status !== 'active') return false;
      if (contentFilter === 'completed' && t.status !== 'completed') return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.region.toLowerCase().includes(q) ||
        t.startLocationName.toLowerCase().includes(q) ||
        t.endLocationName.toLowerCase().includes(q) ||
        t.ownerName.toLowerCase().includes(q) ||
        (handleQ.length > 0 && t.ownerHandle.toLowerCase().includes(handleQ))
      );
    });
  }, [allTreks, selectedOwnerUid, contentFilter, contentSearch]);

  const platformStats = useMemo(() => {
    const suspendedUsers = userRows.filter((u) => u.status === 'suspended').length;
    const publicTrips = allTreks.filter((t) => t.isPublic).length;
    const privateTrips = allTreks.length - publicTrips;
    const totalStops = allTreks.reduce((sum, t) => sum + (t.waypointCount || 0), 0);
    const totalPhotos = allTreks.reduce((sum, t) => sum + (t.photoCount || 0), 0);
    return {
      totalUsers: publicProfiles.length,
      suspendedUsers,
      totalTrips: allTreks.length,
      publicTrips,
      privateTrips,
      totalStops,
      totalPhotos,
    };
  }, [userRows, allTreks, publicProfiles.length]);

  const openEditUserModal = (profile: PublicProfile) => {
    setEditingUser(profile);
    setEditUserName(profile.displayName);
    setEditUserHandle(profile.handle);
    setEditUserHomeBase(profile.homeBase);
    setEditUserBio(profile.bio);
    setActionError(null);
  };

  const handleSaveUserProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingUserEdit(true);
    setActionError(null);
    try {
      await updatePublicProfile(editingUser.uid, {
        displayName: editUserName.trim() || editingUser.displayName,
        handle: slugifyHandle(editUserHandle, editingUser.uid.slice(0, 4).toLowerCase()),
        homeBase: editUserHomeBase.trim(),
        bio: editUserBio.trim(),
        avatarUrl: editingUser.avatarUrl,
      });
      setEditingUser(null);
      flashNotice(`Updated profile for @${editUserHandle || editingUser.handle}.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to update user profile.');
    } finally {
      setSavingUserEdit(false);
    }
  };

  const handleApplyModeration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moderatingUser) return;
    setSavingModeration(true);
    setActionError(null);
    try {
      await upsertUserControl({
        targetUid: moderatingUser.profile.uid,
        status: moderatingUser.nextStatus,
        role: moderatingUser.role,
        moderationNote: moderatingUser.note.trim(),
        adminUid,
      });
      const verb = moderatingUser.nextStatus === 'suspended' ? 'Suspended' : 'Updated standing for';
      flashNotice(`${verb} @${moderatingUser.profile.handle}.`);
      setModeratingUser(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to save moderation update.');
    } finally {
      setSavingModeration(false);
    }
  };

  const handleQuickRoleChange = async (
    profile: PublicProfile,
    currentStatus: UserControlStatus,
    nextRole: UserControlRole,
    currentNote: string
  ) => {
    setActionError(null);
    try {
      await upsertUserControl({
        targetUid: profile.uid,
        status: currentStatus,
        role: nextRole,
        moderationNote: currentNote,
        adminUid,
      });
      flashNotice(`Set @${profile.handle} role to ${nextRole}.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to change user role.');
    }
  };

  const handleDeleteUserAndAllContent = async () => {
    if (!confirmDeleteUser) return;
    setDeletingUserUid(confirmDeleteUser.uid);
    setActionError(null);
    try {
      await adminDeleteUserAndData(confirmDeleteUser.uid);
      flashNotice(`Removed @${confirmDeleteUser.handle} and all associated trips.`);
      setConfirmDeleteUser(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to delete user data.');
    } finally {
      setDeletingUserUid(null);
    }
  };

  const ensureWaypointsLoaded = async (trekId: string): Promise<Waypoint[]> => {
    if (waypointsByTrek[trekId]) {
      return waypointsByTrek[trekId];
    }
    setLoadingWpsTrekId(trekId);
    try {
      const wps = await adminFetchTrekWaypoints(trekId);
      setWaypointsByTrek((prev) => ({ ...prev, [trekId]: wps }));
      return wps;
    } finally {
      setLoadingWpsTrekId(null);
    }
  };

  const handleToggleStopsDrawer = async (trekId: string) => {
    if (expandedTrekId === trekId) {
      setExpandedTrekId(null);
      return;
    }
    setExpandedTrekId(trekId);
    setActionError(null);
    try {
      await ensureWaypointsLoaded(trekId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to load trip stops.');
    }
  };

  const handleOpenEditTrek = async (trek: Trek) => {
    setBusyTrekId(trek.id);
    setActionError(null);
    try {
      const wps = await ensureWaypointsLoaded(trek.id);
      setEditTrekState({ trek, waypoints: wps });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to load trip stops for editing.');
    } finally {
      setBusyTrekId(null);
    }
  };

  const handleToggleTrekVisibility = async (trek: Trek) => {
    setBusyTrekId(trek.id);
    setActionError(null);
    try {
      const wps = await ensureWaypointsLoaded(trek.id);
      await toggleTrekVisibility(trek, wps, !trek.isPublic);
      flashNotice(
        `Trip "${trek.title}" is now ${!trek.isPublic ? 'Public' : 'Private'}.`
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to update trip visibility.');
    } finally {
      setBusyTrekId(null);
    }
  };

  const handleForceCompleteTrek = async (trek: Trek) => {
    if (trek.status === 'completed') return;
    setBusyTrekId(trek.id);
    setActionError(null);
    try {
      const wps = await ensureWaypointsLoaded(trek.id);
      await finishTrek({
        trek,
        waypoints: wps,
        summary: trek.summary || '',
        isPublic: trek.isPublic,
      });
      flashNotice(`Marked "${trek.title}" as completed.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to complete trip.');
    } finally {
      setBusyTrekId(null);
    }
  };

  const handleDeleteTrek = async (trek: Trek) => {
    setBusyTrekId(trek.id);
    setActionError(null);
    try {
      await deleteTrekAndWaypoints(trek.id, trek.ownerId);
      setConfirmDeleteTrekId(null);
      if (expandedTrekId === trek.id) {
        setExpandedTrekId(null);
      }
      flashNotice(`Deleted trip "${trek.title}".`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to delete trip.');
    } finally {
      setBusyTrekId(null);
    }
  };

  const handleDeleteWaypoint = async (trek: Trek, waypointId: string) => {
    const wps = waypointsByTrek[trek.id] || [];
    setActionError(null);
    try {
      await deleteWaypointFromActiveTrek(trek, wps, waypointId);
      const updated = await adminFetchTrekWaypoints(trek.id);
      setWaypointsByTrek((prev) => ({ ...prev, [trek.id]: updated }));
      flashNotice('Removed waypoint from trip.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to remove waypoint.');
    }
  };

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
      {/* SaaS Console Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#E2E8F0]">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-[#475569]">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 hover:text-[#0F172A] cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>TripFolio</span>
            </button>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-[#4F46E5]">Super Admin Console</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#0F172A]">
            User &amp; Content Control
          </h1>
          <p className="text-xs text-[#475569]">
            Signed in as Super Admin <span className="font-mono text-[#0F172A]">{adminEmail || SUPER_ADMIN_EMAIL}</span>
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#EEF1FA] border border-[#E2E8F0] rounded-xl self-start md:self-auto">
          <button
            type="button"
            onClick={() => setSectionTab('users')}
            className={`px-4 min-h-[38px] py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer trail-transition ${
              sectionTab === 'users'
                ? 'bg-white text-[#4F46E5] shadow-xs'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Users ({platformStats.totalUsers})
          </button>
          <button
            type="button"
            onClick={() => setSectionTab('content')}
            className={`px-4 min-h-[38px] py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer trail-transition ${
              sectionTab === 'content'
                ? 'bg-white text-[#4F46E5] shadow-xs'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Trips &amp; Content ({platformStats.totalTrips})
          </button>
        </div>
      </div>

      {/* 4-Column Platform Metric Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-5 py-5 border-b border-[#E2E8F0]">
        <div>
          <p className="text-xs text-[#475569] mb-1">Registered Explorers</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#0F172A]">
            {platformStats.totalUsers}
          </p>
          <p className="text-[11px] text-[#475569] mt-0.5 font-mono tabular-nums">
            {platformStats.suspendedUsers} suspended
          </p>
        </div>
        <div>
          <p className="text-xs text-[#475569] mb-1">Total Trips Stored</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#4F46E5]">
            {platformStats.totalTrips}
          </p>
          <p className="text-[11px] text-[#475569] mt-0.5 font-mono tabular-nums">
            {platformStats.publicTrips} public · {platformStats.privateTrips} private
          </p>
        </div>
        <div>
          <p className="text-xs text-[#475569] mb-1">Recorded Stops</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#0F172A]">
            {platformStats.totalStops}
          </p>
          <p className="text-[11px] text-[#475569] mt-0.5">Across all trips</p>
        </div>
        <div>
          <p className="text-xs text-[#475569] mb-1">Captured Trip Snaps</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#2563EB]">
            {platformStats.totalPhotos}
          </p>
          <p className="text-[11px] text-[#475569] mt-0.5">Compressed images</p>
        </div>
      </section>

      {actionError && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between gap-3">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-700 hover:text-red-900 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between gap-3">
          <span>{actionSuccess}</span>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {sectionTab === 'users' ? (
        <section className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-[#475569] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search user name, @handle, or UID..."
                aria-label="Search registered users"
                className="pl-10 pr-3.5 min-h-[44px] py-2 text-base sm:text-xs bg-white border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5] w-full"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#EEF1FA] border border-[#E2E8F0] rounded-xl overflow-x-auto no-scrollbar max-w-full">
              {(
                [
                  { id: 'all', label: 'All Users' },
                  { id: 'active', label: 'Active' },
                  { id: 'suspended', label: 'Suspended' },
                  { id: 'moderator', label: 'Moderators' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setUserFilter(item.id)}
                  className={`px-3 min-h-[36px] py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer trail-transition ${
                    userFilter === item.id
                      ? 'bg-white text-[#4F46E5] shadow-xs'
                      : 'text-[#475569] hover:text-[#0F172A]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {loadingAdminData ? (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-3">
              {[1, 2, 3].map((row) => (
                <div key={row} className="h-11 rounded-lg bg-[#F6F7FB] animate-pulse" />
              ))}
            </div>
          ) : filteredUsers.length > 0 ? (
            <>
              {/* Desktop Users Table */}
              <div className="hidden lg:block bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#F6F7FB] border-b border-[#E2E8F0] text-xs font-medium text-[#475569]">
                        <th className="py-3 pl-5 pr-3">Explorer</th>
                        <th className="py-3 px-3">Standing &amp; Role</th>
                        <th className="py-3 px-3 text-right">Trips</th>
                        <th className="py-3 px-3 text-right">Distance</th>
                        <th className="py-3 pl-3 pr-5 text-right">Controls</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {filteredUsers.map((row) => (
                        <tr key={row.profile.uid} className="hover:bg-[#F6F7FB]/70 trail-transition">
                          <td className="py-3.5 pl-5 pr-3 align-middle">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#EEF1FA] border border-[#E2E8F0] shrink-0 flex items-center justify-center">
                                {row.profile.avatarUrl ? (
                                  <img
                                    src={row.profile.avatarUrl}
                                    alt={row.profile.displayName}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <UserIcon className="w-4 h-4 text-[#4F46E5]" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() => onOpenTrekker(row.profile.handle)}
                                  className="text-sm font-semibold text-[#0F172A] hover:text-[#4F46E5] hover:underline truncate block cursor-pointer"
                                >
                                  {row.profile.displayName}
                                </button>
                                <p className="text-xs text-[#475569] truncate">
                                  @{row.profile.handle}
                                  {row.profile.homeBase ? ` · ${row.profile.homeBase}` : ''}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-3 align-middle">
                            <div className="text-xs space-y-0.5">
                              <p>
                                <span
                                  className={
                                    row.status === 'suspended'
                                      ? 'font-semibold text-red-700'
                                      : 'font-medium text-emerald-700'
                                  }
                                >
                                  {row.status === 'suspended' ? 'Suspended' : 'Active'}
                                </span>
                                <span aria-hidden="true"> · </span>
                                <span className="text-[#475569] capitalize">
                                  {row.isSuperAdminAccount ? 'Super Admin' : row.role}
                                </span>
                              </p>
                              {row.control?.moderationNote && (
                                <p className="text-[11px] text-[#475569] truncate max-w-[220px]">
                                  Note: {row.control.moderationNote}
                                </p>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-3 align-middle text-right font-mono tabular-nums text-xs text-[#0F172A]">
                            <span className="font-semibold text-sm">{row.treksCount}</span>
                            <span className="block text-[11px] text-[#475569]">
                              {row.publicCount} pub · {row.privateCount} priv
                            </span>
                          </td>

                          <td className="py-3.5 px-3 align-middle text-right font-mono tabular-nums text-xs text-[#0F172A]">
                            {formatDistance(row.totalDistanceKm)}
                          </td>

                          <td className="py-3.5 pl-3 pr-5 align-middle text-right">
                            <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedOwnerUid(row.profile.uid);
                                  setSectionTab('content');
                                }}
                                className="px-2.5 min-h-[34px] py-1 text-xs font-medium text-[#0F172A] bg-white border border-[#E2E8F0] rounded-lg hover:border-[#4F46E5] hover:text-[#4F46E5] whitespace-nowrap cursor-pointer"
                              >
                                View Trips
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditUserModal(row.profile)}
                                className="px-2.5 min-h-[34px] py-1 text-xs font-medium text-[#0F172A] bg-white border border-[#E2E8F0] rounded-lg hover:border-[#4F46E5] hover:text-[#4F46E5] whitespace-nowrap cursor-pointer"
                              >
                                Edit Profile
                              </button>
                              {!row.isSuperAdminAccount && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleQuickRoleChange(
                                        row.profile,
                                        row.status,
                                        row.role === 'moderator' ? 'user' : 'moderator',
                                        row.control?.moderationNote || ''
                                      )
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 min-h-[34px] py-1 text-xs font-medium text-[#4F46E5] bg-[#EEF2FF] border border-[#C7D2FE] rounded-lg hover:bg-[#E0E7FF] whitespace-nowrap cursor-pointer"
                                  >
                                    <Shield className="w-3 h-3" />
                                    <span>{row.role === 'moderator' ? 'Set User' : 'Make Mod'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setModeratingUser({
                                        profile: row.profile,
                                        nextStatus:
                                          row.status === 'suspended' ? 'active' : 'suspended',
                                        role: row.role,
                                        note: row.control?.moderationNote || '',
                                      })
                                    }
                                    className={`inline-flex items-center gap-1 px-2.5 min-h-[34px] py-1 text-xs font-medium rounded-lg border whitespace-nowrap cursor-pointer ${
                                      row.status === 'suspended'
                                        ? 'text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                                        : 'text-amber-800 bg-amber-50 border-amber-200 hover:bg-amber-100'
                                    }`}
                                  >
                                    {row.status === 'suspended' ? (
                                      <>
                                        <UserCheck className="w-3 h-3" />
                                        <span>Reactivate</span>
                                      </>
                                    ) : (
                                      <>
                                        <Ban className="w-3 h-3" />
                                        <span>Suspend</span>
                                      </>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteUser(row.profile)}
                                    className="inline-flex items-center gap-1 px-2.5 min-h-[34px] py-1 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 whitespace-nowrap cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Delete</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Users List */}
              <div className="lg:hidden space-y-3">
                {filteredUsers.map((row) => (
                  <div
                    key={row.profile.uid}
                    className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#0F172A] truncate">
                          {row.profile.displayName}
                        </p>
                        <p className="text-xs text-[#475569] truncate">
                          @{row.profile.handle} ·{' '}
                          <span
                            className={
                              row.status === 'suspended' ? 'text-red-700 font-medium' : 'text-emerald-700'
                            }
                          >
                            {row.status === 'suspended' ? 'Suspended' : 'Active'}
                          </span>{' '}
                          · {row.isSuperAdminAccount ? 'Super Admin' : row.role}
                        </p>
                      </div>
                      <span className="text-xs font-mono tabular-nums text-[#0F172A] shrink-0">
                        {row.treksCount} trips
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedOwnerUid(row.profile.uid);
                          setSectionTab('content');
                        }}
                        className="px-3 min-h-[38px] text-xs font-medium text-[#0F172A] bg-[#F6F7FB] border border-[#E2E8F0] rounded-lg cursor-pointer"
                      >
                        Trips ({row.treksCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditUserModal(row.profile)}
                        className="px-3 min-h-[38px] text-xs font-medium text-[#0F172A] bg-[#F6F7FB] border border-[#E2E8F0] rounded-lg cursor-pointer"
                      >
                        Edit Profile
                      </button>
                      {!row.isSuperAdminAccount && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setModeratingUser({
                                profile: row.profile,
                                nextStatus: row.status === 'suspended' ? 'active' : 'suspended',
                                role: row.role,
                                note: row.control?.moderationNote || '',
                              })
                            }
                            className="px-3 min-h-[38px] text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer"
                          >
                            {row.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteUser(row.profile)}
                            className="px-3 min-h-[38px] text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg cursor-pointer"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-10 text-center space-y-2">
              <p className="text-sm font-medium text-[#0F172A]">No explorers match this filter</p>
              <p className="text-xs text-[#475569]">
                Clear your search or filter to view all registered users.
              </p>
            </div>
          )}
        </section>
      ) : (
        <section className="space-y-4">
          {selectedOwnerProfile && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[#EEF2FF] border border-[#C7D2FE] text-xs">
              <span>
                Filtering content created by{' '}
                <strong className="text-[#0F172A]">
                  {selectedOwnerProfile.displayName} (@{selectedOwnerProfile.handle})
                </strong>
              </span>
              <button
                type="button"
                onClick={() => setSelectedOwnerUid(null)}
                className="font-medium text-[#4F46E5] hover:underline cursor-pointer"
              >
                Show All Users&apos; Content
              </button>
            </div>
          )}

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-[#475569] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={contentSearch}
                onChange={(e) => setContentSearch(e.target.value)}
                placeholder="Search trip title, region, stop, or @handle..."
                aria-label="Search all trips and content"
                className="pl-10 pr-3.5 min-h-[44px] py-2 text-base sm:text-xs bg-white border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5] w-full"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#EEF1FA] border border-[#E2E8F0] rounded-xl overflow-x-auto no-scrollbar max-w-full">
              {(
                [
                  { id: 'all', label: 'All Trips' },
                  { id: 'public', label: 'Public' },
                  { id: 'private', label: 'Private' },
                  { id: 'active', label: 'Active' },
                  { id: 'completed', label: 'Completed' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setContentFilter(item.id)}
                  className={`px-3 min-h-[36px] py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer trail-transition ${
                    contentFilter === item.id
                      ? 'bg-white text-[#4F46E5] shadow-xs'
                      : 'text-[#475569] hover:text-[#0F172A]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {filteredTreks.length > 0 ? (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl divide-y divide-[#E2E8F0] overflow-hidden shadow-xs">
              {filteredTreks.map((trek) => {
                const isExpanded = expandedTrekId === trek.id;
                const isBusy = busyTrekId === trek.id;
                const isLoadingWps = loadingWpsTrekId === trek.id;
                const stops = waypointsByTrek[trek.id] || [];

                return (
                  <div key={trek.id} className="p-4 sm:p-5 space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#475569]">
                          <DifficultyBadge difficulty={trek.difficulty} size="sm" />
                          <span>{trek.region}</span>
                          <span aria-hidden="true">·</span>
                          <span className={trek.isPublic ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
                            {trek.isPublic ? 'Public' : 'Private'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="capitalize">{trek.status}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatTimestamp(trek.updatedAt || trek.startedAt)}</span>
                        </div>

                        <h2 className="text-base font-semibold text-[#0F172A]">{trek.title}</h2>

                        <p className="text-xs text-[#475569]">
                          By{' '}
                          <button
                            type="button"
                            onClick={() => onOpenTrekker(trek.ownerHandle)}
                            className="font-medium text-[#0F172A] hover:text-[#4F46E5] hover:underline cursor-pointer"
                          >
                            {trek.ownerName} (@{trek.ownerHandle})
                          </button>
                          <span aria-hidden="true"> · </span>
                          <span className="font-mono tabular-nums">
                            {formatDistance(trek.distanceKm)} · {trek.waypointCount} stops ·{' '}
                            {trek.photoCount} snaps · {formatElevation(trek.maxElevationM)}
                          </span>
                        </p>

                        {trek.summary && (
                          <p className="text-xs text-[#334155] leading-relaxed max-w-3xl line-clamp-2">
                            {trek.summary}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onOpenTrek(trek)}
                          className="inline-flex items-center gap-1 px-3 min-h-[36px] py-1.5 text-xs font-medium text-[#4F46E5] bg-[#EEF2FF] border border-[#C7D2FE] rounded-lg hover:bg-[#E0E7FF] whitespace-nowrap cursor-pointer"
                        >
                          <span>Inspect</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleOpenEditTrek(trek)}
                          className="inline-flex items-center gap-1 px-3 min-h-[36px] py-1.5 text-xs font-medium text-[#0F172A] bg-white border border-[#E2E8F0] rounded-lg hover:border-[#4F46E5] disabled:opacity-50 whitespace-nowrap cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5 text-[#4F46E5]" />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleToggleTrekVisibility(trek)}
                          className="inline-flex items-center gap-1 px-3 min-h-[36px] py-1.5 text-xs font-medium text-[#0F172A] bg-white border border-[#E2E8F0] rounded-lg hover:border-[#4F46E5] disabled:opacity-50 whitespace-nowrap cursor-pointer"
                        >
                          {trek.isPublic ? (
                            <>
                              <EyeOff className="w-3.5 h-3.5 text-amber-600" />
                              <span>Make Private</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Make Public</span>
                            </>
                          )}
                        </button>

                        {trek.status === 'active' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleForceCompleteTrek(trek)}
                            className="inline-flex items-center gap-1 px-3 min-h-[36px] py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Complete</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => void handleToggleStopsDrawer(trek.id)}
                          className="inline-flex items-center gap-1 px-3 min-h-[36px] py-1.5 text-xs font-medium text-[#0F172A] bg-[#F6F7FB] border border-[#E2E8F0] rounded-lg hover:border-[#C7D2FE] whitespace-nowrap cursor-pointer"
                        >
                          <span>Stops ({trek.waypointCount})</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {confirmDeleteTrekId !== trek.id ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmDeleteTrekId(trek.id)}
                            className="inline-flex items-center gap-1 px-3 min-h-[36px] py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleDeleteTrek(trek)}
                              className="px-3 min-h-[36px] py-1.5 text-xs font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg cursor-pointer"
                            >
                              {isBusy ? 'Deleting...' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTrekId(null)}
                              className="px-2 min-h-[36px] text-xs text-[#475569] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="pt-3 border-t border-[#E2E8F0] space-y-2.5">
                        {isLoadingWps ? (
                          <p className="text-xs text-[#475569]">Loading stops...</p>
                        ) : stops.length > 0 ? (
                          <div className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl bg-[#F6F7FB]">
                            {stops.map((wp, idx) => (
                              <div
                                key={wp.id}
                                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                              >
                                <div className="space-y-0.5 min-w-0">
                                  <p className="text-xs font-mono tabular-nums text-[#475569] capitalize">
                                    <span className="font-semibold text-[#4F46E5]">
                                      #{idx + 1}
                                    </span>{' '}
                                    · {wp.category}
                                    {wp.elevationM !== null ? ` · ${formatElevation(wp.elevationM)}` : ''}
                                    {' · '}
                                    {formatCoords(wp.lat, wp.lng)}
                                    {' · '}
                                    {formatTimestampTime(wp.reachedAt)}
                                  </p>
                                  <p className="text-sm font-semibold text-[#0F172A]">{wp.name}</p>
                                  {wp.note && (
                                    <p className="text-xs text-[#334155] line-clamp-2">{wp.note}</p>
                                  )}
                                  {wp.photos?.length > 0 && (
                                    <p className="text-[11px] font-mono text-[#475569]">
                                      {wp.photos.length} attached snap{wp.photos.length === 1 ? '' : 's'}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditWaypointState({ trek, waypoints: stops, waypoint: wp })
                                    }
                                    className="px-2.5 min-h-[34px] text-xs font-medium text-[#4F46E5] bg-white border border-[#E2E8F0] rounded-lg hover:border-[#4F46E5] cursor-pointer"
                                  >
                                    Edit Stop
                                  </button>
                                  {stops.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteWaypoint(trek, wp.id)}
                                      className="px-2.5 min-h-[34px] text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 cursor-pointer"
                                    >
                                      Remove
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-[#475569]">No stops logged for this trip.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-10 text-center space-y-2">
              <p className="text-sm font-medium text-[#0F172A]">No trips match these filters</p>
              <p className="text-xs text-[#475569]">
                Adjust the visibility filter, user selection, or search query.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Edit User Profile Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-[#090D16]/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={(e) => void handleSaveUserProfile(e)}
            className="bg-white border border-[#E2E8F0] rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#0F172A]">
                Edit Explorer Profile
              </h2>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                aria-label="Close modal"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#475569] hover:text-[#0F172A] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#0F172A] mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={editUserName}
                  onChange={(e) => setEditUserName(e.target.value)}
                  maxLength={BLUEPRINT_LIMITS.DISPLAY_NAME_MAX}
                  required
                  className="w-full px-3 min-h-[42px] text-sm border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#0F172A] mb-1">
                  Handle
                </label>
                <input
                  type="text"
                  value={editUserHandle}
                  onChange={(e) =>
                    setEditUserHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))
                  }
                  minLength={BLUEPRINT_LIMITS.HANDLE_MIN}
                  maxLength={BLUEPRINT_LIMITS.HANDLE_MAX}
                  required
                  className="w-full px-3 min-h-[42px] text-sm font-mono border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#0F172A] mb-1">Home Base</label>
              <input
                type="text"
                value={editUserHomeBase}
                onChange={(e) => setEditUserHomeBase(e.target.value)}
                maxLength={BLUEPRINT_LIMITS.HOME_BASE_MAX}
                className="w-full px-3 min-h-[42px] text-sm border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#0F172A] mb-1">Bio</label>
              <textarea
                value={editUserBio}
                onChange={(e) => setEditUserBio(e.target.value)}
                maxLength={BLUEPRINT_LIMITS.BIO_MAX}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5] resize-none"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-4 min-h-[40px] text-xs font-medium text-[#475569] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingUserEdit}
                className="px-4 min-h-[40px] text-xs font-medium text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-xl disabled:opacity-50 cursor-pointer"
              >
                {savingUserEdit ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Suspend / Reactivate User Modal */}
      {moderatingUser && (
        <div className="fixed inset-0 z-50 bg-[#090D16]/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={(e) => void handleApplyModeration(e)}
            className="bg-white border border-[#E2E8F0] rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#0F172A]">
                {moderatingUser.nextStatus === 'suspended'
                  ? `Suspend @${moderatingUser.profile.handle}`
                  : `Reactivate @${moderatingUser.profile.handle}`}
              </h2>
              <button
                type="button"
                onClick={() => setModeratingUser(null)}
                aria-label="Close modal"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#475569] hover:text-[#0F172A] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#475569] leading-relaxed">
              {moderatingUser.nextStatus === 'suspended'
                ? 'Suspended users are blocked by Firestore security rules from creating or editing trips and stops until reactivated.'
                : 'Reactivating restores normal trip logging and editing permissions for this explorer.'}
            </p>

            <div>
              <label className="block text-xs font-medium text-[#0F172A] mb-1">
                Moderation Note (shown to user if suspended)
              </label>
              <textarea
                value={moderatingUser.note}
                onChange={(e) =>
                  setModeratingUser({ ...moderatingUser, note: e.target.value })
                }
                maxLength={300}
                rows={3}
                placeholder="Optional reason or policy reference..."
                className="w-full px-3 py-2 text-sm border border-[#E2E8F0] rounded-xl focus:outline-none focus:border-[#4F46E5] resize-none"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setModeratingUser(null)}
                className="px-4 min-h-[40px] text-xs font-medium text-[#475569] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingModeration}
                className={`px-4 min-h-[40px] text-xs font-medium text-white rounded-xl disabled:opacity-50 cursor-pointer ${
                  moderatingUser.nextStatus === 'suspended'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {savingModeration
                  ? 'Saving...'
                  : moderatingUser.nextStatus === 'suspended'
                    ? 'Confirm Suspension'
                    : 'Confirm Reactivation'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirm Delete User Modal */}
      {confirmDeleteUser && (
        <div className="fixed inset-0 z-50 bg-[#090D16]/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl">
            <h2 className="text-lg font-semibold text-[#0F172A]">
              Delete @{confirmDeleteUser.handle}?
            </h2>
            <p className="text-xs text-[#475569] leading-relaxed">
              This permanently removes <strong className="text-[#0F172A]">{confirmDeleteUser.displayName}</strong>&apos;s
              public profile, moderation record, and all recorded trips, waypoints, and snaps from
              Firestore.
            </p>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                disabled={Boolean(deletingUserUid)}
                onClick={() => setConfirmDeleteUser(null)}
                className="px-4 min-h-[40px] text-xs font-medium text-[#475569] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(deletingUserUid)}
                onClick={() => void handleDeleteUserAndAllContent()}
                className="px-4 min-h-[40px] text-xs font-medium text-white bg-red-700 hover:bg-red-800 rounded-xl disabled:opacity-50 cursor-pointer"
              >
                {deletingUserUid ? 'Deleting...' : 'Delete User & Content'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editTrekState && (
        <EditTrekModal
          trek={editTrekState.trek}
          waypoints={editTrekState.waypoints}
          onClose={() => setEditTrekState(null)}
          onSaved={() => flashNotice(`Updated trip "${editTrekState.trek.title}".`)}
        />
      )}

      {editWaypointState && (
        <EditWaypointModal
          trek={editWaypointState.trek}
          waypoints={editWaypointState.waypoints}
          waypoint={editWaypointState.waypoint}
          onClose={() => setEditWaypointState(null)}
          onSaved={() => {
            void adminFetchTrekWaypoints(editWaypointState.trek.id).then((updated) => {
              setWaypointsByTrek((prev) => ({
                ...prev,
                [editWaypointState.trek.id]: updated,
              }));
            });
            flashNotice('Updated waypoint details.');
          }}
        />
      )}
    </div>
  );
}
