import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { calculatePathDistanceKm, generateSafeId, slugifyHandle } from '../lib/geo';
import { commitWithOfflineQueue, setSnapshotPendingWrites } from '../lib/syncState';
import {
  BLUEPRINT_LIMITS,
  type PublicProfile,
  type Trek,
  type TrekDifficulty,
  type UserControl,
  type UserControlRole,
  type UserControlStatus,
  type Waypoint,
  type WaypointCategory,
} from '../types/trail';

function getProfileCacheKey(uid: string): string {
  return `trailfolio_profile_cache_${uid}`;
}

function saveCachedProfile(profile: PublicProfile): void {
  try {
    localStorage.setItem(
      getProfileCacheKey(profile.uid),
      JSON.stringify({
        uid: profile.uid,
        displayName: profile.displayName,
        handle: profile.handle,
        bio: profile.bio,
        homeBase: profile.homeBase,
        avatarUrl: profile.avatarUrl,
        completedTreksCount: profile.completedTreksCount,
        totalDistanceKm: profile.totalDistanceKm,
      })
    );
  } catch {
    // Ignore localStorage quota errors
  }
}

function loadCachedProfile(uid: string): PublicProfile | null {
  try {
    const raw = localStorage.getItem(getProfileCacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PublicProfile>;
    if (!parsed.uid || !parsed.handle) return null;
    const now = Timestamp.now();
    return {
      uid: parsed.uid,
      displayName: parsed.displayName || 'Explorer',
      handle: parsed.handle,
      bio: parsed.bio || '',
      homeBase: parsed.homeBase || '',
      avatarUrl: parsed.avatarUrl || '',
      completedTreksCount: parsed.completedTreksCount || 0,
      totalDistanceKm: parsed.totalDistanceKm || 0,
      createdAt: now,
      updatedAt: now,
    };
  } catch {
    return null;
  }
}

function isOfflineUnavailableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes('client is offline') ||
    msg.includes('unavailable') ||
    msg.includes('network-request-failed')
  );
}

function clampString(value: string, max: number): string {
  return value.trim().slice(0, max);
}

export async function ensurePublicProfile(user: User): Promise<PublicProfile> {
  const path = `publicProfiles/${user.uid}`;
  const ref = doc(db, 'publicProfiles', user.uid);
  const cachedFallback = loadCachedProfile(user.uid);

  const fallbackDisplayName = clampString(
    user.displayName || user.email?.split('@')[0] || 'Explorer',
    BLUEPRINT_LIMITS.DISPLAY_NAME_MAX
  );
  const fallbackHandle = slugifyHandle(
    user.displayName || user.email?.split('@')[0] || 'explorer',
    user.uid.slice(0, 5).toLowerCase()
  );
  const fallbackAvatarUrl =
    user.photoURL && user.photoURL.length <= BLUEPRINT_LIMITS.PHOTO_MAX_CHARS
      ? user.photoURL
      : '';

  const buildLocalFallback = (): PublicProfile => {
    const now = Timestamp.now();
    return (
      cachedFallback || {
        uid: user.uid,
        displayName: fallbackDisplayName,
        handle: fallbackHandle,
        bio: 'Documenting trails, mountain passes, viewpoints, and travel routes.',
        homeBase: '',
        avatarUrl: fallbackAvatarUrl,
        completedTreksCount: 0,
        totalDistanceKm: 0,
        createdAt: now,
        updatedAt: now,
      }
    );
  };

  // If currently offline, return cached IndexedDB / localStorage profile immediately
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    try {
      const localSnap = await getDocFromCache(ref);
      if (localSnap.exists()) {
        const prof = localSnap.data() as PublicProfile;
        saveCachedProfile(prof);
        return prof;
      }
    } catch {
      // Fall through to localStorage fallback
    }
    return buildLocalFallback();
  }

  let existingSnap;
  try {
    existingSnap = await getDoc(ref);
  } catch (error) {
    if (isOfflineUnavailableError(error)) {
      return buildLocalFallback();
    }
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (existingSnap.exists()) {
    const prof = existingSnap.data() as PublicProfile;
    saveCachedProfile(prof);
    return prof;
  }

  const payload = {
    uid: user.uid,
    displayName: fallbackDisplayName,
    handle: fallbackHandle,
    bio: 'Documenting trails, mountain passes, viewpoints, and travel routes.',
    homeBase: '',
    avatarUrl: fallbackAvatarUrl,
    completedTreksCount: 0,
    totalDistanceKm: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await commitWithOfflineQueue(setDoc(ref, payload), (error) =>
      handleFirestoreError(error, OperationType.CREATE, path)
    );
    const now = Timestamp.now();
    const localProf: PublicProfile = {
      uid: user.uid,
      displayName: fallbackDisplayName,
      handle: fallbackHandle,
      bio: payload.bio,
      homeBase: '',
      avatarUrl: fallbackAvatarUrl,
      completedTreksCount: 0,
      totalDistanceKm: 0,
      createdAt: now,
      updatedAt: now,
    };
    saveCachedProfile(localProf);
    return localProf;
  } catch (error) {
    if (isOfflineUnavailableError(error)) {
      return buildLocalFallback();
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updatePublicProfile(
  uid: string,
  updates: {
    displayName: string;
    handle: string;
    bio: string;
    homeBase: string;
    avatarUrl: string;
  }
): Promise<void> {
  const path = `publicProfiles/${uid}`;
  const ref = doc(db, 'publicProfiles', uid);
  const cleanHandle = slugifyHandle(updates.handle, uid.slice(0, 4).toLowerCase());
  const cleanDisplayName = clampString(
    updates.displayName || 'Explorer',
    BLUEPRINT_LIMITS.DISPLAY_NAME_MAX
  );
  const cleanBio = clampString(updates.bio, BLUEPRINT_LIMITS.BIO_MAX);
  const cleanHomeBase = clampString(updates.homeBase, BLUEPRINT_LIMITS.HOME_BASE_MAX);
  const cleanAvatar = updates.avatarUrl.slice(0, BLUEPRINT_LIMITS.PHOTO_MAX_CHARS);

  const existing = loadCachedProfile(uid);
  if (existing) {
    saveCachedProfile({
      ...existing,
      displayName: cleanDisplayName,
      handle: cleanHandle,
      bio: cleanBio,
      homeBase: cleanHomeBase,
      avatarUrl: cleanAvatar,
    });
  }

  await commitWithOfflineQueue(
    updateDoc(ref, {
      displayName: cleanDisplayName,
      handle: cleanHandle,
      bio: cleanBio,
      homeBase: cleanHomeBase,
      avatarUrl: cleanAvatar,
      updatedAt: serverTimestamp(),
    }),
    (error) => handleFirestoreError(error, OperationType.UPDATE, path)
  );
}

export async function getPublicProfileByHandle(handle: string): Promise<PublicProfile | null> {
  const path = 'publicProfiles';
  try {
    const q = query(collection(db, path), where('handle', '==', handle.toLowerCase()));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs[0].data() as PublicProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function getPublicProfileByUid(uid: string): Promise<PublicProfile | null> {
  const path = `publicProfiles/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'publicProfiles', uid));
    return snap.exists() ? (snap.data() as PublicProfile) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export function subscribePublicProfiles(
  onData: (profiles: PublicProfile[]) => void
): Unsubscribe {
  const path = 'publicProfiles';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as PublicProfile)
        .sort((a, b) => (b.completedTreksCount || 0) - (a.completedTreksCount || 0));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribePublicTreks(onData: (treks: Trek[]) => void): Unsubscribe {
  const path = 'treks';
  const q = query(collection(db, path), where('isPublic', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as Trek)
        .sort((a, b) => {
          const aTime = a.updatedAt?.toMillis?.() ?? 0;
          const bTime = b.updatedAt?.toMillis?.() ?? 0;
          return bTime - aTime;
        });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeMyTreks(
  uid: string,
  onData: (treks: Trek[]) => void
): Unsubscribe {
  const path = 'treks';
  const q = query(collection(db, path), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      const hasPending = snap.docs.some((d) => d.metadata.hasPendingWrites);
      setSnapshotPendingWrites(hasPending);
      const items = snap.docs
        .map((d) => d.data() as Trek)
        .sort((a, b) => {
          const aTime = a.updatedAt?.toMillis?.() ?? Date.now();
          const bTime = b.updatedAt?.toMillis?.() ?? Date.now();
          return bTime - aTime;
        });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeTrekWaypoints(
  trekId: string,
  isOwnerViewing: boolean,
  ownerUid: string | null,
  onData: (waypoints: Waypoint[]) => void,
  isSuperAdminViewing = false
): Unsubscribe {
  const path = `treks/${trekId}/waypoints`;
  const q = isSuperAdminViewing
    ? collection(db, 'treks', trekId, 'waypoints')
    : isOwnerViewing && ownerUid
      ? query(collection(db, 'treks', trekId, 'waypoints'), where('ownerId', '==', ownerUid))
      : query(collection(db, 'treks', trekId, 'waypoints'), where('trekIsPublic', '==', true));

  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      const hasPending = snap.docs.some((d) => d.metadata.hasPendingWrites);
      if (hasPending) {
        setSnapshotPendingWrites(true);
      }
      const items = snap.docs
        .map((d) => d.data() as Waypoint)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function fetchPublicTrekWaypoints(trekId: string): Promise<Waypoint[]> {
  const path = `treks/${trekId}/waypoints`;
  try {
    const q = query(collection(db, 'treks', trekId, 'waypoints'), where('trekIsPublic', '==', true));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as Waypoint)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function adminFetchTrekWaypoints(trekId: string): Promise<Waypoint[]> {
  const path = `treks/${trekId}/waypoints`;
  try {
    const snap = await getDocs(collection(db, 'treks', trekId, 'waypoints'));
    return snap.docs
      .map((d) => d.data() as Waypoint)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export function subscribeAllTreksForAdmin(onData: (treks: Trek[]) => void): Unsubscribe {
  const path = 'treks';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as Trek)
        .sort((a, b) => {
          const aTime = a.updatedAt?.toMillis?.() ?? 0;
          const bTime = b.updatedAt?.toMillis?.() ?? 0;
          return bTime - aTime;
        });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAllUserControlsForAdmin(
  onData: (controls: UserControl[]) => void
): Unsubscribe {
  const path = 'userControls';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const items = snap.docs.map((d) => d.data() as UserControl);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeMyUserControl(
  uid: string,
  onData: (control: UserControl | null) => void
): Unsubscribe {
  const path = `userControls/${uid}`;
  return onSnapshot(
    doc(db, 'userControls', uid),
    (snap) => {
      onData(snap.exists() ? (snap.data() as UserControl) : null);
    },
    (error) => {
      if (isOfflineUnavailableError(error)) {
        return;
      }
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function upsertUserControl(params: {
  targetUid: string;
  status: UserControlStatus;
  role: UserControlRole;
  moderationNote: string;
  adminUid: string;
}): Promise<void> {
  const path = `userControls/${params.targetUid}`;
  const ref = doc(db, 'userControls', params.targetUid);
  const cleanNote = clampString(params.moderationNote, 300);

  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await updateDoc(ref, {
        status: params.status,
        role: params.role,
        moderationNote: cleanNote,
        updatedBy: params.adminUid,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        uid: params.targetUid,
        status: params.status,
        role: params.role,
        moderationNote: cleanNote,
        updatedBy: params.adminUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function startTrek(params: {
  profile: PublicProfile;
  title: string;
  region: string;
  difficulty: TrekDifficulty;
  isPublic: boolean;
  startLocationName: string;
  startLat: number;
  startLng: number;
  elevationM: number | null;
  note: string;
  photos: string[];
}): Promise<string> {
  const trekId = generateSafeId('trek');
  const wpId = generateSafeId('wp');
  const path = `treks/${trekId}`;

  const sanitizedPhotos = params.photos
    .slice(0, BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX)
    .map((p) => p.slice(0, BLUEPRINT_LIMITS.PHOTO_MAX_CHARS));
  const coverPhotoDataUrl = sanitizedPhotos[0] || '';
  const initialElev = params.elevationM !== null && Number.isFinite(params.elevationM) ? params.elevationM : 0;

  try {
    const batch = writeBatch(db);
    const trekRef = doc(db, 'treks', trekId);
    const wpRef = doc(db, 'treks', trekId, 'waypoints', wpId);

    batch.set(trekRef, {
      id: trekId,
      ownerId: params.profile.uid,
      ownerName: clampString(params.profile.displayName, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
      ownerHandle: params.profile.handle,
      title: clampString(params.title, BLUEPRINT_LIMITS.TREK_TITLE_MAX),
      region: clampString(params.region, BLUEPRINT_LIMITS.REGION_MAX),
      summary: '',
      difficulty: params.difficulty,
      status: 'active',
      isPublic: params.isPublic,
      startLocationName: clampString(params.startLocationName, BLUEPRINT_LIMITS.LOCATION_NAME_MAX),
      startLat: params.startLat,
      startLng: params.startLng,
      endLocationName: clampString(params.startLocationName, BLUEPRINT_LIMITS.LOCATION_NAME_MAX),
      endLat: params.startLat,
      endLng: params.startLng,
      distanceKm: 0,
      maxElevationM: initialElev,
      waypointCount: 1,
      photoCount: sanitizedPhotos.length,
      coverPhotoDataUrl,
      startedAt: serverTimestamp(),
      completedAt: null,
      updatedAt: serverTimestamp(),
    });

    batch.set(wpRef, {
      id: wpId,
      trekId,
      ownerId: params.profile.uid,
      trekIsPublic: params.isPublic,
      orderIndex: 0,
      name: clampString(params.startLocationName, BLUEPRINT_LIMITS.WAYPOINT_NAME_MAX),
      category: 'trailhead' as WaypointCategory,
      lat: params.startLat,
      lng: params.startLng,
      elevationM: params.elevationM !== null && Number.isFinite(params.elevationM) ? params.elevationM : null,
      note: clampString(params.note, BLUEPRINT_LIMITS.NOTE_MAX),
      photos: sanitizedPhotos,
      reachedAt: serverTimestamp(),
    });

    await commitWithOfflineQueue(batch.commit(), (error) =>
      handleFirestoreError(error, OperationType.CREATE, path)
    );
    return trekId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function addWaypointToTrek(params: {
  trek: Trek;
  existingWaypoints: Waypoint[];
  name: string;
  category: WaypointCategory;
  lat: number;
  lng: number;
  elevationM: number | null;
  note: string;
  photos: string[];
}): Promise<void> {
  const wpId = generateSafeId('wp');
  const path = `treks/${params.trek.id}/waypoints/${wpId}`;

  const sanitizedPhotos = params.photos
    .slice(0, BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX)
    .map((p) => p.slice(0, BLUEPRINT_LIMITS.PHOTO_MAX_CHARS));

  const nextOrderIndex =
    params.existingWaypoints.length > 0
      ? Math.max(...params.existingWaypoints.map((w) => w.orderIndex)) + 1
      : 0;

  const allPoints = [
    ...params.existingWaypoints.map((w) => ({ lat: w.lat, lng: w.lng })),
    { lat: params.lat, lng: params.lng },
  ];
  const distanceKm = calculatePathDistanceKm(allPoints);
  const currentMaxElev = params.trek.maxElevationM || 0;
  const maxElevationM =
    params.elevationM !== null && Number.isFinite(params.elevationM)
      ? Math.max(currentMaxElev, params.elevationM)
      : currentMaxElev;
  const photoCount =
    params.existingWaypoints.reduce((acc, w) => acc + (w.photos?.length || 0), 0) +
    sanitizedPhotos.length;
  const coverPhotoDataUrl = params.trek.coverPhotoDataUrl || sanitizedPhotos[0] || '';

  try {
    const batch = writeBatch(db);
    const wpRef = doc(db, 'treks', params.trek.id, 'waypoints', wpId);
    const trekRef = doc(db, 'treks', params.trek.id);

    batch.set(wpRef, {
      id: wpId,
      trekId: params.trek.id,
      ownerId: params.trek.ownerId,
      trekIsPublic: params.trek.isPublic,
      orderIndex: nextOrderIndex,
      name: clampString(params.name, BLUEPRINT_LIMITS.WAYPOINT_NAME_MAX),
      category: params.category,
      lat: params.lat,
      lng: params.lng,
      elevationM: params.elevationM !== null && Number.isFinite(params.elevationM) ? params.elevationM : null,
      note: clampString(params.note, BLUEPRINT_LIMITS.NOTE_MAX),
      photos: sanitizedPhotos,
      reachedAt: serverTimestamp(),
    });

    batch.update(trekRef, {
      endLocationName: clampString(params.name, BLUEPRINT_LIMITS.LOCATION_NAME_MAX),
      endLat: params.lat,
      endLng: params.lng,
      distanceKm,
      maxElevationM,
      waypointCount: params.existingWaypoints.length + 1,
      photoCount,
      coverPhotoDataUrl,
      updatedAt: serverTimestamp(),
    });

    await commitWithOfflineQueue(batch.commit(), (error) =>
      handleFirestoreError(error, OperationType.WRITE, path)
    );
    if (params.trek.status === 'completed') {
      await recalculateOwnerStats(params.trek.ownerId);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateWaypointDetails(params: {
  trek: Trek;
  existingWaypoints: Waypoint[];
  waypoint: Waypoint;
  name: string;
  category: WaypointCategory;
  lat: number;
  lng: number;
  elevationM: number | null;
  note: string;
  photos: string[];
}): Promise<void> {
  const path = `treks/${params.trek.id}/waypoints/${params.waypoint.id}`;
  const cleanName =
    clampString(params.name, BLUEPRINT_LIMITS.WAYPOINT_NAME_MAX) ||
    params.waypoint.name ||
    'Waypoint';
  const cleanNote = clampString(params.note, BLUEPRINT_LIMITS.NOTE_MAX);
  const cleanElev =
    params.elevationM !== null && Number.isFinite(params.elevationM) ? params.elevationM : null;
  const sanitizedPhotos = params.photos
    .slice(0, BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX)
    .map((p) => p.slice(0, BLUEPRINT_LIMITS.PHOTO_MAX_CHARS));

  const updatedList = params.existingWaypoints
    .map((w) =>
      w.id === params.waypoint.id
        ? {
            ...w,
            name: cleanName,
            category: params.category,
            lat: params.lat,
            lng: params.lng,
            elevationM: cleanElev,
            note: cleanNote,
            photos: sanitizedPhotos,
          }
        : w
    )
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const first = updatedList[0];
  const last = updatedList[updatedList.length - 1];
  const startLocationName = clampString(
    first ? first.name : params.trek.startLocationName,
    BLUEPRINT_LIMITS.LOCATION_NAME_MAX
  );
  const startLat = first ? first.lat : params.trek.startLat;
  const startLng = first ? first.lng : params.trek.startLng;
  const endLocationName = clampString(
    last ? last.name : startLocationName,
    BLUEPRINT_LIMITS.LOCATION_NAME_MAX
  );
  const endLat = last ? last.lat : startLat;
  const endLng = last ? last.lng : startLng;

  const distanceKm = calculatePathDistanceKm(updatedList.map((w) => ({ lat: w.lat, lng: w.lng })));
  const photoCount = updatedList.reduce((acc, w) => acc + (w.photos?.length || 0), 0);
  const maxElevationM = updatedList.reduce((max, w) => {
    if (w.elevationM !== null && Number.isFinite(w.elevationM)) {
      return Math.max(max, w.elevationM);
    }
    return max;
  }, 0);

  const prevWpHadCover =
    Boolean(params.trek.coverPhotoDataUrl) &&
    (params.waypoint.photos || []).includes(params.trek.coverPhotoDataUrl);
  const newWpHasCover =
    Boolean(params.trek.coverPhotoDataUrl) && sanitizedPhotos.includes(params.trek.coverPhotoDataUrl);
  const firstAvailablePhoto =
    updatedList.find((w) => w.photos && w.photos.length > 0)?.photos[0] || '';
  let coverPhotoDataUrl = params.trek.coverPhotoDataUrl || '';
  if (!coverPhotoDataUrl || (prevWpHadCover && !newWpHasCover)) {
    coverPhotoDataUrl = firstAvailablePhoto;
  }

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'treks', params.trek.id, 'waypoints', params.waypoint.id), {
      name: cleanName,
      category: params.category,
      lat: params.lat,
      lng: params.lng,
      elevationM: cleanElev,
      note: cleanNote,
      photos: sanitizedPhotos,
    });
    batch.update(doc(db, 'treks', params.trek.id), {
      startLocationName,
      startLat,
      startLng,
      endLocationName,
      endLat,
      endLng,
      distanceKm,
      maxElevationM,
      photoCount,
      coverPhotoDataUrl: coverPhotoDataUrl.slice(0, BLUEPRINT_LIMITS.PHOTO_MAX_CHARS),
      updatedAt: serverTimestamp(),
    });
    await commitWithOfflineQueue(batch.commit(), (error) =>
      handleFirestoreError(error, OperationType.UPDATE, path)
    );
    if (params.trek.status === 'completed') {
      await recalculateOwnerStats(params.trek.ownerId);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateTrekDetails(params: {
  trek: Trek;
  waypoints: Waypoint[];
  title: string;
  region: string;
  difficulty: TrekDifficulty;
  summary: string;
  isPublic: boolean;
  coverPhotoDataUrl: string;
}): Promise<void> {
  const path = `treks/${params.trek.id}`;
  const cleanTitle = clampString(params.title, BLUEPRINT_LIMITS.TREK_TITLE_MAX) || params.trek.title;
  const cleanRegion = clampString(params.region, BLUEPRINT_LIMITS.REGION_MAX) || params.trek.region;
  const cleanSummary = clampString(params.summary, BLUEPRINT_LIMITS.SUMMARY_MAX);
  const cleanCover = params.coverPhotoDataUrl.slice(0, BLUEPRINT_LIMITS.PHOTO_MAX_CHARS);

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'treks', params.trek.id), {
      title: cleanTitle,
      region: cleanRegion,
      difficulty: params.difficulty,
      summary: cleanSummary,
      isPublic: params.isPublic,
      coverPhotoDataUrl: cleanCover,
      updatedAt: serverTimestamp(),
    });

    if (params.isPublic !== params.trek.isPublic) {
      for (const wp of params.waypoints) {
        batch.update(doc(db, 'treks', params.trek.id, 'waypoints', wp.id), {
          trekIsPublic: params.isPublic,
        });
      }
    }

    await commitWithOfflineQueue(batch.commit(), (error) =>
      handleFirestoreError(error, OperationType.UPDATE, path)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateTrekDifficulty(
  trekId: string,
  difficulty: TrekDifficulty
): Promise<void> {
  const path = `treks/${trekId}`;
  try {
    await commitWithOfflineQueue(
      updateDoc(doc(db, 'treks', trekId), {
        difficulty,
        updatedAt: serverTimestamp(),
      }),
      (error) => handleFirestoreError(error, OperationType.UPDATE, path)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function recalculateOwnerStats(uid: string): Promise<void> {
  const path = `publicProfiles/${uid}`;
  try {
    const q = query(collection(db, 'treks'), where('ownerId', '==', uid));
    const snap = await getDocs(q);
    const completed = snap.docs
      .map((d) => d.data() as Trek)
      .filter((t) => t.status === 'completed');

    const completedTreksCount = completed.length;
    const totalDistanceKm =
      Math.round(completed.reduce((sum, t) => sum + (t.distanceKm || 0), 0) * 100) / 100;

    await commitWithOfflineQueue(
      updateDoc(doc(db, 'publicProfiles', uid), {
        completedTreksCount,
        totalDistanceKm,
        updatedAt: serverTimestamp(),
      }),
      (error) => handleFirestoreError(error, OperationType.UPDATE, path)
    );
  } catch (error) {
    if (isOfflineUnavailableError(error)) {
      return;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function finishTrek(params: {
  trek: Trek;
  waypoints: Waypoint[];
  summary: string;
  isPublic: boolean;
  coverPhotoDataUrl?: string;
}): Promise<void> {
  const path = `treks/${params.trek.id}`;
  const cover =
    params.coverPhotoDataUrl !== undefined
      ? params.coverPhotoDataUrl.slice(0, BLUEPRINT_LIMITS.PHOTO_MAX_CHARS)
      : params.trek.coverPhotoDataUrl;

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'treks', params.trek.id), {
      status: 'completed',
      summary: clampString(params.summary, BLUEPRINT_LIMITS.SUMMARY_MAX),
      isPublic: params.isPublic,
      coverPhotoDataUrl: cover,
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (params.isPublic !== params.trek.isPublic) {
      for (const wp of params.waypoints) {
        batch.update(doc(db, 'treks', params.trek.id, 'waypoints', wp.id), {
          trekIsPublic: params.isPublic,
        });
      }
    }

    await commitWithOfflineQueue(batch.commit(), (error) =>
      handleFirestoreError(error, OperationType.UPDATE, path)
    );
    await recalculateOwnerStats(params.trek.ownerId);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleTrekVisibility(
  trek: Trek,
  waypoints: Waypoint[],
  nextIsPublic: boolean
): Promise<void> {
  const path = `treks/${trek.id}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'treks', trek.id), {
      isPublic: nextIsPublic,
      updatedAt: serverTimestamp(),
    });
    for (const wp of waypoints) {
      batch.update(doc(db, 'treks', trek.id, 'waypoints', wp.id), {
        trekIsPublic: nextIsPublic,
      });
    }
    await commitWithOfflineQueue(batch.commit(), (error) =>
      handleFirestoreError(error, OperationType.UPDATE, path)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTrekAndWaypoints(
  trekId: string,
  ownerUid: string
): Promise<void> {
  const path = `treks/${trekId}`;
  try {
    const wpSnap = await getDocs(
      query(collection(db, 'treks', trekId, 'waypoints'), where('ownerId', '==', ownerUid))
    );
    const batch = writeBatch(db);
    wpSnap.docs.forEach((wpDoc) => {
      batch.delete(wpDoc.ref);
    });
    batch.delete(doc(db, 'treks', trekId));
    await commitWithOfflineQueue(batch.commit(), (error) =>
      handleFirestoreError(error, OperationType.DELETE, path)
    );
    await recalculateOwnerStats(ownerUid);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fetchTrekById(trekId: string): Promise<Trek | null> {
  const path = `treks/${trekId}`;
  try {
    const snap = await getDoc(doc(db, 'treks', trekId));
    return snap.exists() ? (snap.data() as Trek) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function deleteWaypointFromActiveTrek(
  trek: Trek,
  waypoints: Waypoint[],
  waypointId: string
): Promise<void> {
  const path = `treks/${trek.id}/waypoints/${waypointId}`;
  const deletedWp = waypoints.find((w) => w.id === waypointId);
  const remaining = waypoints
    .filter((w) => w.id !== waypointId)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const first = remaining[0];
  const last = remaining[remaining.length - 1];
  const distanceKm = calculatePathDistanceKm(remaining.map((w) => ({ lat: w.lat, lng: w.lng })));
  const maxElevationM = remaining.reduce(
    (max, w) => (w.elevationM !== null && Number.isFinite(w.elevationM) ? Math.max(max, w.elevationM) : max),
    0
  );
  const photoCount = remaining.reduce((acc, w) => acc + (w.photos?.length || 0), 0);
  const deletedHadCover =
    Boolean(trek.coverPhotoDataUrl) && (deletedWp?.photos || []).includes(trek.coverPhotoDataUrl);
  const fallbackCover = remaining.find((w) => w.photos?.length > 0)?.photos[0] || '';
  const coverPhotoDataUrl =
    !trek.coverPhotoDataUrl || deletedHadCover ? fallbackCover : trek.coverPhotoDataUrl;

  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'treks', trek.id, 'waypoints', waypointId));
    batch.update(doc(db, 'treks', trek.id), {
      startLocationName: first ? first.name : trek.startLocationName,
      startLat: first ? first.lat : trek.startLat,
      startLng: first ? first.lng : trek.startLng,
      endLocationName: last ? last.name : trek.startLocationName,
      endLat: last ? last.lat : trek.startLat,
      endLng: last ? last.lng : trek.startLng,
      distanceKm,
      maxElevationM,
      waypointCount: remaining.length,
      photoCount,
      coverPhotoDataUrl,
      updatedAt: serverTimestamp(),
    });
    await commitWithOfflineQueue(batch.commit(), (error) =>
      handleFirestoreError(error, OperationType.DELETE, path)
    );
    if (trek.status === 'completed') {
      await recalculateOwnerStats(trek.ownerId);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteAllUserData(ownerUid: string): Promise<void> {
  const profilePath = `publicProfiles/${ownerUid}`;
  try {
    const trekSnap = await getDocs(
      query(collection(db, 'treks'), where('ownerId', '==', ownerUid))
    );

    for (const trekDoc of trekSnap.docs) {
      const trekId = trekDoc.id;
      const wpSnap = await getDocs(
        query(collection(db, 'treks', trekId, 'waypoints'), where('ownerId', '==', ownerUid))
      );
      const batch = writeBatch(db);
      wpSnap.docs.forEach((wpDoc) => {
        batch.delete(wpDoc.ref);
      });
      batch.delete(trekDoc.ref);
      await batch.commit();
    }

    await deleteDoc(doc(db, 'publicProfiles', ownerUid));
    try {
      localStorage.removeItem(getProfileCacheKey(ownerUid));
    } catch {
      // Ignore storage removal errors
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, profilePath);
  }
}

export async function adminDeleteUserAndData(targetUid: string): Promise<void> {
  await deleteAllUserData(targetUid);
  const controlRef = doc(db, 'userControls', targetUid);
  try {
    const controlSnap = await getDoc(controlRef);
    if (controlSnap.exists()) {
      await deleteDoc(controlRef);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `userControls/${targetUid}`);
  }
}
