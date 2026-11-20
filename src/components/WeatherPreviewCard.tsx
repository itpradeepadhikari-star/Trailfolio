import { useEffect, useState } from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Droplets,
  Mountain,
  RefreshCw,
  Snowflake,
  Sun,
  WifiOff,
  Wind,
} from 'lucide-react';
import { useOnlineStatus } from '../hooks/usePWAInstall';
import { formatCoords, formatElevation } from '../lib/geo';
import {
  fetchLocationWeather,
  type WeatherConditionKind,
  type WeatherForecast,
} from '../services/weatherService';

interface WeatherPreviewCardProps {
  lat: number;
  lng: number;
  locationLabel: string;
  elevationM?: number | null;
  unit?: 'C' | 'F';
  onUnitChange?: (unit: 'C' | 'F') => void;
}

function WeatherIcon({
  kind,
  className = 'w-5 h-5',
}: {
  kind: WeatherConditionKind;
  className?: string;
}) {
  switch (kind) {
    case 'clear':
      return <Sun className={`${className} text-amber-500`} />;
    case 'partly-cloudy':
      return <CloudSun className={`${className} text-[#4F46E5]`} />;
    case 'cloudy':
      return <Cloud className={`${className} text-[#64748B]`} />;
    case 'fog':
      return <CloudFog className={`${className} text-[#64748B]`} />;
    case 'drizzle':
      return <CloudDrizzle className={`${className} text-[#2563EB]`} />;
    case 'rain':
      return <CloudRain className={`${className} text-[#2563EB]`} />;
    case 'snow':
      return <Snowflake className={`${className} text-sky-500`} />;
    case 'storm':
      return <CloudLightning className={`${className} text-[#5B21B6]`} />;
  }
}

function formatTemp(tempC: number, unit: 'C' | 'F', precise = false): string {
  if (unit === 'F') {
    return `${Math.round((tempC * 9) / 5 + 32)}°F`;
  }
  const val = precise ? Number(tempC.toFixed(1)) : Math.round(tempC);
  return `${val}°C`;
}

export function WeatherPreviewCard({
  lat,
  lng,
  locationLabel,
  elevationM,
  unit: controlledUnit,
  onUnitChange,
}: WeatherPreviewCardProps) {
  const isOnline = useOnlineStatus();
  const [internalUnit, setInternalUnit] = useState<'C' | 'F'>('C');
  const unit = controlledUnit ?? internalUnit;
  const setUnit = onUnitChange ?? setInternalUnit;
  const [weather, setWeather] = useState<WeatherForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setWeather(null);
    if (!isOnline) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    fetchLocationWeather(lat, lng, elevationM)
      .then((data) => {
        if (!cancelled) {
          setWeather(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load forecast.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lng, elevationM, isOnline, refreshTick]);

  const resolvedElev =
    elevationM !== null && elevationM !== undefined && Number.isFinite(elevationM)
      ? Math.round(elevationM)
      : weather?.elevationM ?? null;

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[#4F46E5]">Local Weather Preview</p>
          <p className="text-xs text-[#475569] mt-0.5">
            {locationLabel}
            <span aria-hidden="true"> · </span>
            <span className="font-mono tabular-nums">{formatCoords(lat, lng)}</span>
            {resolvedElev !== null && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="font-mono tabular-nums text-[#0F172A]">
                  {formatElevation(resolvedElev)} elev
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-[#EEF1FA] rounded-lg">
            {(['C', 'F'] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                aria-label={`Show temperatures in degrees ${u}`}
                className={`min-h-[30px] px-2.5 py-1 text-xs font-mono font-medium rounded-md cursor-pointer trail-transition ${
                  unit === u
                    ? 'bg-white text-[#4F46E5] shadow-xs'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                °{u}
              </button>
            ))}
          </div>
          {isOnline && (
            <button
              type="button"
              onClick={() => setRefreshTick((t) => t + 1)}
              aria-label="Refresh weather forecast"
              className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg border border-[#E2E8F0] bg-[#F6F7FB] text-[#475569] hover:text-[#0F172A] hover:border-[#C7D2FE] cursor-pointer trail-transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {!isOnline && !weather ? (
        <div className="flex items-center gap-2.5 text-xs text-[#475569] bg-[#F6F7FB] border border-[#E2E8F0] rounded-xl px-3.5 py-3">
          <WifiOff className="w-4 h-4 text-amber-500 shrink-0" />
          <span>
            Offline mode — connect to internet to fetch live weather for {locationLabel}.
          </span>
        </div>
      ) : loading && !weather ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center animate-pulse">
          <div className="lg:col-span-4 h-16 rounded-xl bg-[#EEF1FA]" />
          <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="h-16 rounded-xl bg-[#F6F7FB]" />
            <div className="h-16 rounded-xl bg-[#F6F7FB]" />
            <div className="h-16 rounded-xl bg-[#F6F7FB]" />
            <div className="h-16 rounded-xl bg-[#F6F7FB]" />
          </div>
        </div>
      ) : error && !weather ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#475569] bg-[#F6F7FB] border border-[#E2E8F0] rounded-xl px-3.5 py-3">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setRefreshTick((t) => t + 1)}
            className="font-medium text-[#4F46E5] hover:underline cursor-pointer"
          >
            Try again
          </button>
        </div>
      ) : weather ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          {/* Current Weather Summary */}
          <div className="lg:col-span-4 flex items-center gap-3.5 pr-2">
            <div className="w-12 h-12 rounded-xl bg-[#EEF2FF] border border-[#C7D2FE]/60 flex items-center justify-center shrink-0">
              <WeatherIcon kind={weather.kind} className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold font-mono tabular-nums text-[#0F172A]">
                  {formatTemp(weather.tempC, unit, true)}
                </span>
                <span className="text-sm font-medium text-[#334155] truncate">
                  {weather.conditionLabel}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#475569] mt-1 font-mono tabular-nums">
                <span className="inline-flex items-center gap-1">
                  <Wind className="w-3 h-3 text-[#4F46E5]" />
                  {weather.windKmh} km/h
                </span>
                <span className="inline-flex items-center gap-1">
                  <Droplets className="w-3 h-3 text-[#2563EB]" />
                  {weather.humidityPct}%
                </span>
                <span>{weather.precipChance}% precip</span>
              </div>
            </div>
          </div>

          {/* 4-Day Forecast Strip */}
          <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {weather.daily.map((day) => (
              <div
                key={day.dateIso}
                className="bg-[#F6F7FB] border border-[#E2E8F0] rounded-xl px-3 py-2.5 flex flex-col justify-between gap-1.5"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium text-[#0F172A] truncate">{day.label}</span>
                  <WeatherIcon kind={day.kind} className="w-4 h-4 shrink-0" />
                </div>
                <div className="flex items-baseline justify-between gap-2 text-xs font-mono tabular-nums">
                  <span className="font-semibold text-[#0F172A]">
                    {formatTemp(day.maxTempC, unit)}
                  </span>
                  <span className="text-[#64748B]">{formatTemp(day.minTempC, unit)}</span>
                </div>
                <p className="text-[11px] text-[#475569] truncate">
                  {day.conditionLabel}
                  {day.precipChance > 0 ? ` · ${day.precipChance}%` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface StopWeatherPreviewProps {
  lat: number;
  lng: number;
  elevationM?: number | null;
  unit?: 'C' | 'F';
}

export function StopWeatherPreview({
  lat,
  lng,
  elevationM,
  unit: propUnit,
}: StopWeatherPreviewProps) {
  const isOnline = useOnlineStatus();
  const [localUnit, setLocalUnit] = useState<'C' | 'F'>('C');
  const unit = propUnit ?? localUnit;
  const [weather, setWeather] = useState<WeatherForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setWeather(null);
    if (!isOnline) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setFailed(false);
    fetchLocationWeather(lat, lng, elevationM)
      .then((data) => {
        if (!cancelled) {
          setWeather(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lng, elevationM, isOnline]);

  if (!isOnline && !weather) {
    return (
      <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-[#64748B]">
        <WifiOff className="w-3 h-3 text-amber-500 shrink-0" />
        <span>Offline — weather preview loads when online</span>
      </div>
    );
  }

  if (loading && !weather) {
    return <div className="mt-2.5 h-8 w-full rounded-xl bg-[#F6F7FB] animate-pulse" />;
  }

  if (failed || !weather) {
    return null;
  }

  const resolvedElev =
    elevationM !== null && elevationM !== undefined && Number.isFinite(elevationM)
      ? Math.round(elevationM)
      : weather.elevationM ?? null;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-3 py-2 rounded-xl bg-[#F6F7FB] border border-[#E2E8F0] text-xs cursor-default"
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
        <WeatherIcon kind={weather.kind} className="w-4 h-4 shrink-0" />
        {propUnit ? (
          <span className="font-mono font-semibold tabular-nums text-[#0F172A]">
            {formatTemp(weather.tempC, unit, true)}
          </span>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLocalUnit((prev) => (prev === 'C' ? 'F' : 'C'));
            }}
            title="Switch °C / °F"
            className="font-mono font-semibold tabular-nums text-[#0F172A] hover:text-[#4F46E5] cursor-pointer"
          >
            {formatTemp(weather.tempC, unit, true)}
          </button>
        )}
        <span className="font-medium text-[#334155]">{weather.conditionLabel}</span>
        <span aria-hidden="true" className="text-[#CBD5E1]">
          ·
        </span>
        {resolvedElev !== null && (
          <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[#475569]">
            <Mountain className="w-3 h-3 text-[#5B21B6]" />
            {formatElevation(resolvedElev)}
          </span>
        )}
        <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[#475569]">
          <Wind className="w-3 h-3 text-[#4F46E5]" />
          {weather.windKmh} km/h
        </span>
        <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[#475569]">
          <Droplets className="w-3 h-3 text-[#2563EB]" />
          {weather.humidityPct}%
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#475569] font-mono tabular-nums">
        {weather.daily.slice(0, 3).map((day) => (
          <span key={day.dateIso} className="inline-flex items-center gap-1">
            <WeatherIcon kind={day.kind} className="w-3 h-3 shrink-0" />
            <span className="font-sans text-[#64748B]">
              {day.label === 'Today' ? 'Today' : day.label.split(',')[0]}
            </span>
            <span className="text-[#0F172A] font-medium">
              {formatTemp(day.maxTempC, unit)}/{formatTemp(day.minTempC, unit)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
