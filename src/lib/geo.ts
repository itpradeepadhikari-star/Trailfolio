import type { Timestamp } from 'firebase/firestore';
import { BLUEPRINT_LIMITS, type LatLngLiteral } from '../types/trail';

export function haversineKm(a: LatLngLiteral, b: LatLngLiteral): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLng * sinLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function calculatePathDistanceKm(points: LatLngLiteral[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineKm(points[i - 1], points[i]);
  }
  return Math.round(total * 100) / 100;
}

export function slugifyHandle(input: string, fallbackSuffix = ''): string {
  const cleaned = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = cleaned.length >= 2 ? cleaned : `explorer-${fallbackSuffix || 'user'}`;
  return base.slice(0, BLUEPRINT_LIMITS.HANDLE_MAX);
}

export function generateSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km <= 0) return '0.0 km';
  return `${km.toFixed(1)} km`;
}

export function formatElevation(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return '—';
  return `${Math.round(m).toLocaleString()} m`;
}

export function formatCoords(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
}

export function formatTimestamp(ts: Timestamp | null | undefined): string {
  if (!ts) return 'Just now';
  try {
    const date = ts.toDate();
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Recently';
  }
}

export function formatTimestampTime(ts: Timestamp | null | undefined): string {
  if (!ts) return 'Just now';
  try {
    const date = ts.toDate();
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Recently';
  }
}

function toDateSafe(ts: Timestamp | null | undefined): Date | null {
  if (!ts) return null;
  try {
    if (typeof ts.toDate === 'function') {
      const date = ts.toDate();
      return Number.isNaN(date.getTime()) ? null : date;
    }
  } catch {
    // Ignore invalid/pending timestamp conversion errors
  }
  return null;
}

export function calculateTripDays(
  startedAt: Timestamp | null | undefined,
  waypoints: Array<{ reachedAt?: Timestamp | null }>
): number | null {
  const startDate = toDateSafe(startedAt) ?? toDateSafe(waypoints[0]?.reachedAt);
  if (!startDate) return null;

  let lastDate: Date | null = null;
  for (let i = waypoints.length - 1; i >= 0; i -= 1) {
    const candidate = toDateSafe(waypoints[i]?.reachedAt);
    if (candidate) {
      lastDate = candidate;
      break;
    }
  }
  if (!lastDate) return 1;

  const startUtcDay = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endUtcDay = Date.UTC(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
  const diffDays = Math.round((endUtcDay - startUtcDay) / (24 * 60 * 60 * 1000));
  return Math.max(1, diffDays + 1);
}

export function formatTripDays(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(days)) return '—';
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/**
 * Compresses an uploaded/captured image into a compact JPEG data URL
 * strictly under maxChars so it fits safely inside Firestore limits.
 */
export async function compressImageToDataUrl(
  source: File | Blob,
  maxChars: number = 280000
): Promise<string> {
  const bitmapUrl = URL.createObjectURL(source);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to load image for compression.'));
      el.src = bitmapUrl;
    });

    const maxDim = 960;
    let width = img.naturalWidth || 960;
    let height = img.naturalHeight || 720;
    if (width > maxDim || height > maxDim) {
      const ratio = Math.min(maxDim / width, maxDim / height);
      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');

    let quality = 0.78;
    let scale = 1;
    let dataUrl = '';

    for (let attempt = 0; attempt < 6; attempt += 1) {
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= maxChars) {
        return dataUrl;
      }
      quality = Math.max(0.35, quality - 0.12);
      scale = scale * 0.8;
    }

    if (dataUrl.length > BLUEPRINT_LIMITS.PHOTO_MAX_CHARS) {
      throw new Error('Image is still too large after compression. Please choose a smaller photo.');
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}
