import { useContext, useEffect, useRef, useState } from 'react';
import { APIProviderContext, useMapsLibrary } from '@vis.gl/react-google-maps';
import { MapPin, Search, X } from 'lucide-react';
import type { LatLngLiteral } from '../../types/trail';

export interface SelectedPlaceResult {
  name: string;
  formattedAddress: string;
  location: LatLngLiteral;
}

interface PlaceSearchBoxProps {
  placeholder?: string;
  onPlaceSelect: (result: SelectedPlaceResult) => void;
  className?: string;
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('Quota') ||
    msg.includes('429')
  );
}

export function PlaceSearchBox(props: PlaceSearchBoxProps) {
  const apiCtx = useContext(APIProviderContext);
  if (!apiCtx) {
    return (
      <div className={props.className || ''}>
        <input
          type="text"
          disabled
          placeholder="Place search unavailable without Maps API key (use GPS below)"
          className="w-full px-3.5 py-2.5 text-sm sm:text-xs bg-[#F6F7FB] border border-[#E2E8F0] rounded-lg text-[#475569]"
        />
      </div>
    );
  }
  return <PlaceSearchBoxInner {...props} />;
}

function PlaceSearchBoxInner({
  placeholder = 'Search trailhead, summit, park, or village...',
  onPlaceSelect,
  className = '',
}: PlaceSearchBoxProps) {
  const placesLib = useMapsLibrary('places');
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    if (!placesLib) return;
    const trimmed = inputValue.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    let cancelled = false;
    setIsLoading(true);
    setSearchError(null);

    const timer = window.setTimeout(() => {
      AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: trimmed,
        sessionToken: sessionTokenRef.current ?? undefined,
      })
        .then((res) => {
          if (cancelled) return;
          setSuggestions(res.suggestions ?? []);
          setOpen(true);
          setIsLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          setIsLoading(false);
          if (isQuotaError(err)) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
          setSearchError('Place suggestions unavailable. Click directly on the map or use GPS.');
        });
    }, 240);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [placesLib, inputValue]);

  const handleSelect = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    if (!placesLib || !suggestion.placePrediction) return;
    setIsLoading(true);
    setSearchError(null);
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location'],
      });
      if (place.location) {
        const lat = place.location.lat();
        const lng = place.location.lng();
        const name = place.displayName || suggestion.placePrediction.text?.text || 'Selected Location';
        onPlaceSelect({
          name,
          formattedAddress: place.formattedAddress || name,
          location: { lat, lng },
        });
        setInputValue(name);
      }
    } catch (err) {
      if (isQuotaError(err)) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      setSearchError('Could not load place coordinates. Try clicking on the map.');
    } finally {
      sessionTokenRef.current = null;
      setSuggestions([]);
      setOpen(false);
      setIsLoading(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-[#475569] absolute left-3.5 pointer-events-none" />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (e.target.value.trim().length >= 2) setOpen(true);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          placeholder={placeholder}
          aria-label="Search location"
          className="w-full min-h-[44px] pl-10 pr-10 py-2.5 text-base sm:text-sm bg-white border border-[#E2E8F0] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#4F46E5] trail-transition"
        />
        {inputValue && (
          <button
            type="button"
            onClick={() => {
              setInputValue('');
              setSuggestions([]);
              setOpen(false);
            }}
            aria-label="Clear search"
            className="absolute right-2 p-2 text-[#475569] hover:text-[#0F172A] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && (suggestions.length > 0 || isLoading) && (
        <ul className="absolute z-30 mt-1.5 w-full bg-white border border-[#E2E8F0] rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-[#F1F5F9]">
          {isLoading && suggestions.length === 0 ? (
            <li className="px-3.5 py-3 text-xs text-[#475569]">Searching trailheads & places...</li>
          ) : (
            suggestions.map((s, idx) => (
              <li key={idx}>
                <button
                  type="button"
                  onClick={() => void handleSelect(s)}
                  className="w-full min-h-[44px] text-left px-3.5 py-2.5 text-sm hover:bg-[#EEF2FF] flex items-start gap-2.5 cursor-pointer trail-transition"
                >
                  <MapPin className="w-4 h-4 text-[#4F46E5] mt-0.5 shrink-0" />
                  <span className="text-[#0F172A] leading-snug">
                    {s.placePrediction?.text?.text || 'Unnamed place'}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      {searchError && (
        <p className="mt-1.5 text-xs text-amber-800">{searchError}</p>
      )}
    </div>
  );
}
