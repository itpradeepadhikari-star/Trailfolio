import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { calculatePathDistanceKm, generateSafeId, slugifyHandle } from '../lib/geo';
import {
  BLUEPRINT_LIMITS,
  type PublicProfile,
  type Trek,
  type TrekDifficulty,
  type Waypoint,
  type WaypointCategory,
} from '../types/trail';

function clampString(value: string, max: number): string {
  return value.trim().slice(0, max);
}

export async function ensurePublicProfile(user: User): Promise<PublicProfile> {
  const path = `publicProfiles/${user.uid}`;
  const ref = doc(db, 'publicProfiles', user.uid);

  let existingSnap;
  try {
    existingSnap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (existingSnap.exists()) {
    return existingSnap.data() as PublicProfile;
  }

  const displayName = clampString(
    user.displayName || user.email?.split('@')[0] || 'Explorer',
    BLUEPRINT_LIMITS.DISPLAY_NAME_MAX
  );
  const handle = slugifyHandle(
    user.displayName || user.email?.split('@')[0] || 'explorer',
    user.uid.slice(0, 5).toLowerCase()
  );
  const avatarUrl =
    user.photoURL && user.photoURL.length <= BLUEPRINT_LIMITS.PHOTO_MAX_CHARS
      ? user.photoURL
      : '';

  const payload = {
    uid: user.uid,
    displayName,
    handle,
    bio: 'Documenting trails, mountain passes, viewpoints, and travel routes.',
    homeBase: '',
    avatarUrl,
    completedTreksCount: 0,
    totalDistanceKm: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(ref, payload);
    const created = await getDoc(ref);
    return created.data() as PublicProfile;
  } catch (error) {
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
  try {
    await updateDoc(ref, {
      displayName: clampString(updates.displayName || 'Explorer', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
      handle: cleanHandle,
      bio: clampString(updates.bio, BLUEPRINT_LIMITS.BIO_MAX),
      homeBase: clampString(updates.homeBase, BLUEPRINT_LIMITS.HOME_BASE_MAX),
      avatarUrl: updates.avatarUrl.slice(0, BLUEPRINT_LIMITS.PHOTO_MAX_CHARS),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
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

export function subscribeTrekWaypoints(
  trekId: string,
  isOwnerViewing: boolean,
  ownerUid: string | null,
  onData: (waypoints: Waypoint[]) => void
): Unsubscribe {
  const path = `treks/${trekId}/waypoints`;
  const q =
    isOwnerViewing && ownerUid
      ? query(collection(db, 'treks', trekId, 'waypoints'), where('ownerId', '==', ownerUid))
      : query(collection(db, 'treks', trekId, 'waypoints'), where('trekIsPublic', '==', true));

  return onSnapshot(
    q,
    (snap) => {
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

    await batch.commit();
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

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateActiveWaypoint(params: {
  trek: Trek;
  existingWaypoints: Waypoint[];
  waypoint: Waypoint;
  name: string;
  category: WaypointCategory;
  elevationM: number | null;
  note: string;
  photos: string[];
}): Promise<void> {
  const path = `treks/${params.trek.id}/waypoints/${params.waypoint.id}`;
  const sanitizedPhotos = params.photos
    .slice(0, BLUEPRINT_LIMITS.PHOTOS_PER_WAYPOINT_MAX)
    .map((p) => p.slice(0, BLUEPRINT_LIMITS.PHOTO_MAX_CHARS));

  const updatedList = params.existingWaypoints.map((w) =>
    w.id === params.waypoint.id
      ? {
          ...w,
          name: clampString(params.name, BLUEPRINT_LIMITS.WAYPOINT_NAME_MAX),
          category: params.category,
          elevationM: params.elevationM,
          note: clampString(params.note, BLUEPRINT_LIMITS.NOTE_MAX),
          photos: sanitizedPhotos,
        }
      : w
  );

  const photoCount = updatedList.reduce((acc, w) => acc + (w.photos?.length || 0), 0);
  const maxElevationM = updatedList.reduce((max, w) => {
    if (w.elevationM !== null && Number.isFinite(w.elevationM)) {
      return Math.max(max, w.elevationM);
    }
    return max;
  }, 0);
  const firstAvailablePhoto =
    updatedList.find((w) => w.photos && w.photos.length > 0)?.photos[0] || '';

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'treks', params.trek.id, 'waypoints', params.waypoint.id), {
      name: clampString(params.name, BLUEPRINT_LIMITS.WAYPOINT_NAME_MAX),
      category: params.category,
      elevationM: params.elevationM !== null && Number.isFinite(params.elevationM) ? params.elevationM : null,
      note: clampString(params.note, BLUEPRINT_LIMITS.NOTE_MAX),
      photos: sanitizedPhotos,
    });
    batch.update(doc(db, 'treks', params.trek.id), {
      photoCount,
      maxElevationM,
      coverPhotoDataUrl: firstAvailablePhoto,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
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

    await updateDoc(doc(db, 'publicProfiles', uid), {
      completedTreksCount,
      totalDistanceKm,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
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

    await batch.commit();
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
    await batch.commit();
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
    await batch.commit();
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
  const remaining = waypoints.filter((w) => w.id !== waypointId);
  const last = remaining[remaining.length - 1];
  const distanceKm = calculatePathDistanceKm(remaining.map((w) => ({ lat: w.lat, lng: w.lng })));
  const maxElevationM = remaining.reduce(
    (max, w) => (w.elevationM !== null && Number.isFinite(w.elevationM) ? Math.max(max, w.elevationM) : max),
    0
  );
  const photoCount = remaining.reduce((acc, w) => acc + (w.photos?.length || 0), 0);
  const coverPhotoDataUrl = remaining.find((w) => w.photos?.length > 0)?.photos[0] || '';

  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'treks', trek.id, 'waypoints', waypointId));
    batch.update(doc(db, 'treks', trek.id), {
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
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
