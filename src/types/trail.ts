import type { Timestamp } from 'firebase/firestore';

export type TrekDifficulty = 'Easy' | 'Moderate' | 'Challenging' | 'Extreme';
export type TrekStatus = 'active' | 'completed';
export type WaypointCategory = 'trailhead' | 'camp' | 'viewpoint' | 'summit' | 'rest' | 'finish';

export const BLUEPRINT_LIMITS = {
  DISPLAY_NAME_MAX: 60,
  HANDLE_MIN: 2,
  HANDLE_MAX: 32,
  HANDLE_REGEX: /^[a-z0-9_-]+$/,
  ID_REGEX: /^[a-zA-Z0-9_-]+$/,
  BIO_MAX: 300,
  HOME_BASE_MAX: 80,
  TREK_TITLE_MAX: 100,
  REGION_MAX: 80,
  SUMMARY_MAX: 1000,
  LOCATION_NAME_MAX: 120,
  WAYPOINT_NAME_MAX: 120,
  NOTE_MAX: 2000,
  PHOTO_MAX_CHARS: 350000,
  PHOTOS_PER_WAYPOINT_MAX: 2,
} as const;

export interface PublicProfile {
  uid: string;
  displayName: string;
  handle: string;
  bio: string;
  homeBase: string;
  avatarUrl: string;
  completedTreksCount: number;
  totalDistanceKm: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Trek {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerHandle: string;
  title: string;
  region: string;
  summary: string;
  difficulty: TrekDifficulty;
  status: TrekStatus;
  isPublic: boolean;
  startLocationName: string;
  startLat: number;
  startLng: number;
  endLocationName: string;
  endLat: number;
  endLng: number;
  distanceKm: number;
  maxElevationM: number;
  waypointCount: number;
  photoCount: number;
  coverPhotoDataUrl: string;
  startedAt: Timestamp | null;
  completedAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Waypoint {
  id: string;
  trekId: string;
  ownerId: string;
  trekIsPublic: boolean;
  orderIndex: number;
  name: string;
  category: WaypointCategory;
  lat: number;
  lng: number;
  elevationM: number | null;
  note: string;
  photos: string[];
  reachedAt: Timestamp | null;
}

export type UserControlStatus = 'active' | 'suspended';
export type UserControlRole = 'user' | 'moderator';

export const SUPER_ADMIN_EMAIL = 'itpradeepadhikari@gmail.com';

export function isSuperAdminUser(email: string | null | undefined, emailVerified?: boolean): boolean {
  return Boolean(email && email.toLowerCase() === SUPER_ADMIN_EMAIL && emailVerified !== false);
}

export interface UserControl {
  uid: string;
  status: UserControlStatus;
  role: UserControlRole;
  moderationNote: string;
  updatedBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface LatLngLiteral {
  lat: number;
  lng: number;
}
