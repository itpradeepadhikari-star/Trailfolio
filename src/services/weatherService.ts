export type WeatherConditionKind =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'storm';

export interface DailyWeatherItem {
  dateIso: string;
  label: string;
  conditionLabel: string;
  kind: WeatherConditionKind;
  maxTempC: number;
  minTempC: number;
  precipChance: number;
}

export interface WeatherForecast {
  tempC: number;
  conditionLabel: string;
  kind: WeatherConditionKind;
  windKmh: number;
  humidityPct: number;
  precipChance: number;
  elevationM: number | null;
  daily: DailyWeatherItem[];
  source: 'google' | 'open-meteo';
}

const SESSION_CACHE_TTL_MS = 15 * 60 * 1000;
const sessionWeatherCache = new Map<string, { data: WeatherForecast; fetchedAt: number }>();
const inFlightRequests = new Map<string, Promise<WeatherForecast>>();
const sessionElevationCache = new Map<string, number | null>();
const inFlightElevationRequests = new Map<string, Promise<number | null>>();

function formatDayLabel(dateIso: string, index: number): string {
  if (index === 0) return 'Today';
  const parsed = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateIso;
  return parsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function mapWmoCode(code: number): { label: string; kind: WeatherConditionKind } {
  if (code === 0) return { label: 'Clear sky', kind: 'clear' };
  if (code === 1 || code === 2) return { label: 'Partly cloudy', kind: 'partly-cloudy' };
  if (code === 3) return { label: 'Overcast', kind: 'cloudy' };
  if (code === 45 || code === 48) return { label: 'Foggy', kind: 'fog' };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', kind: 'drizzle' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: 'Rain', kind: 'rain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: 'Snow', kind: 'snow' };
  if (code >= 95) return { label: 'Thunderstorm', kind: 'storm' };
  return { label: 'Fair', kind: 'partly-cloudy' };
}

interface OpenMeteoElevationResponse {
  elevation?: number[];
}

export async function fetchCoordinateElevation(lat: number, lng: number): Promise<number | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (sessionElevationCache.has(cacheKey)) {
    return sessionElevationCache.get(cacheKey) ?? null;
  }

  const existing = inFlightElevationRequests.get(cacheKey);
  if (existing) return existing;

  const req = (async () => {
    try {
      const url = new URL('https://api.open-meteo.com/v1/elevation');
      url.searchParams.set('latitude', lat.toFixed(6));
      url.searchParams.set('longitude', lng.toFixed(6));

      const response = await fetch(url.toString());
      if (!response.ok) return null;

      const data = (await response.json()) as OpenMeteoElevationResponse;
      const raw = data.elevation?.[0];
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        const rounded = Math.round(raw);
        sessionElevationCache.set(cacheKey, rounded);
        return rounded;
      }
      return null;
    } catch {
      return null;
    }
  })();

  inFlightElevationRequests.set(cacheKey, req);
  try {
    return await req;
  } finally {
    inFlightElevationRequests.delete(cacheKey);
  }
}

interface OpenMeteoResponse {
  elevation?: number;
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
}

async function fetchFromOpenMeteo(
  lat: number,
  lng: number,
  targetElevationM: number | null
): Promise<WeatherForecast> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat.toFixed(6));
  url.searchParams.set('longitude', lng.toFixed(6));
  if (targetElevationM !== null && Number.isFinite(targetElevationM)) {
    url.searchParams.set('elevation', String(Math.round(targetElevationM)));
  }
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code'
  );
  url.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
  );
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '4');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Weather forecast unavailable (${response.status})`);
  }

  const data = (await response.json()) as OpenMeteoResponse;
  if (!data.current || !data.daily?.time?.length) {
    throw new Error('Weather data unavailable for these coordinates.');
  }

  const currentMapped = mapWmoCode(data.current.weather_code ?? 0);
  const daily: DailyWeatherItem[] = data.daily.time.slice(0, 4).map((dateIso, idx) => {
    const code = data.daily?.weather_code?.[idx] ?? 0;
    const mapped = mapWmoCode(code);
    return {
      dateIso,
      label: formatDayLabel(dateIso, idx),
      conditionLabel: mapped.label,
      kind: mapped.kind,
      maxTempC: Math.round(data.daily?.temperature_2m_max?.[idx] ?? data.current?.temperature_2m ?? 0),
      minTempC: Math.round(data.daily?.temperature_2m_min?.[idx] ?? data.current?.temperature_2m ?? 0),
      precipChance: Math.round(data.daily?.precipitation_probability_max?.[idx] ?? 0),
    };
  });

  const rawTemp = data.current.temperature_2m ?? 0;
  const resolvedElev =
    targetElevationM !== null && Number.isFinite(targetElevationM)
      ? Math.round(targetElevationM)
      : typeof data.elevation === 'number' && Number.isFinite(data.elevation)
        ? Math.round(data.elevation)
        : null;

  return {
    tempC: Math.round(rawTemp * 10) / 10,
    conditionLabel: currentMapped.label,
    kind: currentMapped.kind,
    windKmh: Math.round(data.current.wind_speed_10m ?? 0),
    humidityPct: Math.round(data.current.relative_humidity_2m ?? 0),
    precipChance: daily[0]?.precipChance ?? 0,
    elevationM: resolvedElev,
    daily,
    source: 'open-meteo',
  };
}

export async function fetchLocationWeather(
  lat: number,
  lng: number,
  preferredElevationM?: number | null
): Promise<WeatherForecast> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Invalid location coordinates for weather lookup.');
  }

  const hasPreferredElev =
    preferredElevationM !== null &&
    preferredElevationM !== undefined &&
    Number.isFinite(preferredElevationM);
  const elevKey = hasPreferredElev ? String(Math.round(preferredElevationM)) : 'auto';
  const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)},${elevKey}`;

  const cached = sessionWeatherCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < SESSION_CACHE_TTL_MS) {
    return cached.data;
  }

  const existingPromise = inFlightRequests.get(cacheKey);
  if (existingPromise) {
    return existingPromise;
  }

  const requestPromise = (async () => {
    const targetElev = hasPreferredElev
      ? Math.round(preferredElevationM)
      : await fetchCoordinateElevation(lat, lng);

    const openMeteo = await fetchFromOpenMeteo(lat, lng, targetElev);
    sessionWeatherCache.set(cacheKey, { data: openMeteo, fetchedAt: Date.now() });
    return openMeteo;
  })();

  inFlightRequests.set(cacheKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}
