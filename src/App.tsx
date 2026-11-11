/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, useState, useEffect, useRef } from 'react';
import {
  Globe2,
  Earth,
  Route,
  Waypoints,
  Navigation,
  Glasses,
  View,
  Building2,
  Moon,
  Sun,
  Orbit,
  Box,
  SunMoon,
  Contrast,
  Compass,
  MapPin,
  Layers,
  Globe,
  Map,
  Play,
  Square,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  ArrowDown,
  Info,
  HelpCircle,
  Video,
  Minimize2,
  Move,
  Key,
  Sparkles,
  ExternalLink,
  RotateCw,
  RotateCcw,
  Pause,
  List,
  Star,
  MessageSquare,
  X,
  BookmarkCheck,
  CheckSquare,
  Trash2,
  Search,
  Plus,
  Loader2,
  Mountain,
  SlidersHorizontal,
  Eye,
  Crosshair
} from 'lucide-react';
import {
  CITIES,
  getCityConfig,
  DEFAULT_CITY_ID,
  CityConfig,
  LANDMARKS,
  getHaversineDistance,
  getFlightDuration,
  loadGoogleMapsScript,
  getLandmarkMarkerAltitude,
  Landmark
} from './utils';
import { motion, AnimatePresence } from 'motion/react';

export interface PreferredPlaceItem {
  id: string;
  placeId: string;
  name: string;
  cityName: string;
  cityId: string;
  lat: number;
  lng: number;
  description?: string;
  timestamp: number;
  types?: string[];
  viewport?: any;
  camRange?: number;
  camTilt?: number;
}

export const preferredPlaceToLandmark = (item: PreferredPlaceItem, index: number): Landmark => {
  const cleanId = item.placeId ? item.placeId.replace(/^places\//, '') : '';
  const cachedVp = cleanId ? viewportCache.get(cleanId) : null;
  const typesArr: string[] = Array.isArray(item.types) ? item.types : [];
  const typesStr = typesArr.join(' ').toLowerCase();
  const nameStr = (item.name || '').toLowerCase();

  const isMountain = /fuji|mount |mt\.|everest|kilimanjaro|matterhorn|mont blanc|rainier|denali|vesuvius|etna|volcano|mountain|summit|peak/i.test(nameStr) ||
    typesArr.some((t: string) => /mountain|volcano|natural_feature/i.test(t));
  const isStateOrCountry = /administrative_area_level_1|country/i.test(typesStr) ||
    /colorado|california|texas|alaska|washington|florida|switzerland|france|japan|germany|italy|brazil|canada/i.test(nameStr) ||
    (cachedVp && cachedVp.diagonalMeters > 200000);
  const isCityLevel = !isMountain && !isStateOrCountry && (
    /locality|administrative_area|political|city/i.test(typesStr) ||
    /paris|tokyo|london|new york|san francisco|rome|barcelona|sydney|amsterdam|singapore|rio/i.test(nameStr)
  );

  let defaultRange: number;
  let defaultTilt: number;
  let defaultAltitude: number;

  if (cachedVp) {
    defaultRange = cachedVp.range;
    defaultTilt = cachedVp.tilt;
    defaultAltitude = cachedVp.altitudeOffset;
  } else if (isMountain) {
    defaultRange = /mont blanc/i.test(nameStr) ? 30000 : (/fuji/i.test(nameStr) ? 25000 : 26000);
    defaultTilt = 40;
    defaultAltitude = /mont blanc/i.test(nameStr) ? 420 : 320;
  } else if (isStateOrCountry) {
    defaultRange = 950000;
    defaultTilt = 20;
    defaultAltitude = 0;
  } else if (isCityLevel) {
    defaultRange = /paris/i.test(nameStr) ? 7200 : 8500;
    defaultTilt = 46;
    defaultAltitude = 100;
  } else {
    defaultRange = item.camRange || 800;
    defaultTilt = item.camTilt || 56;
    defaultAltitude = 20;
  }

  return {
    id: item.id || `pref-${item.placeId}-${index}`,
    name: item.name,
    placeId: item.placeId,
    lat: Number(item.lat),
    lng: Number(item.lng),
    altitude: defaultAltitude,
    markerAltitude: isStateOrCountry ? 500 : (isMountain ? 25 : (isCityLevel ? 50 : 15)),
    heading: 0,
    tilt: defaultTilt,
    camAltitude: defaultAltitude,
    camRange: defaultRange,
    camTilt: defaultTilt,
    camHeading: 0,
    category: isStateOrCountry ? 'Region' : (isMountain ? 'Mountain' : (isCityLevel ? 'City' : 'Preferred Place')),
    description: item.description || `Saved stop #${index + 1} in your personal itinerary (${item.cityName})`,
    highlights: ['Preferred Place', item.cityName || 'Personal Tour'],
    iconName: isMountain ? 'Mountain' : 'BookmarkCheck',
    pinColor: '#10B981', // Emerald green pin for custom preferred markers
    glyph: isMountain ? '▲' : '★',
    svgIcon: '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>',
    rating: 5.0,
  };
};

// Google Maps API Key loaded securely via environment variable / secrets (VITE_GOOGLE_MAPS_API_KEY)
const ENV_DEV_KEY = ((import.meta as any)?.env?.VITE_GOOGLE_MAPS_API_KEY as string) ||
  (typeof process !== 'undefined' && (process.env as any)?.VITE_GOOGLE_MAPS_API_KEY as string) ||
  '';

export const DEFAULT_DEV_API_KEY: string = (ENV_DEV_KEY && ENV_DEV_KEY.trim() !== '')
  ? ENV_DEV_KEY.trim()
  : '';

function getInitialApiKey(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('gmp_custom_api_key') || localStorage.getItem('custom_maps_api_key');
    if (custom && custom.trim() !== '') {
      return custom.trim();
    }
  }
  return DEFAULT_DEV_API_KEY;
}

function isMobileHorizontalDevice(): boolean {
  if (typeof window === 'undefined') return false;

  // Must be in landscape orientation (width > height)
  const isLandscape = window.innerWidth > window.innerHeight;
  if (!isLandscape) return false;

  // On any landscape view with compact vertical height (<= 640px),
  // it is a mobile horizontal view where vertical space is constrained.
  // Tablets (iPad, Galaxy Tab, Surface) in landscape have height >= 768px.
  // Laptops and desktop monitors have height >= 700px.
  // Mobile phones in landscape have height between 320px and 550px.
  return window.innerHeight <= 640;
}

/**
 * Robust comparator to check if two places or markers represent the same real-world location
 */
export function isSamePlace(
  a?: { id?: string; placeId?: string; lat?: number; lng?: number; name?: string } | null,
  b?: { id?: string; placeId?: string; lat?: number; lng?: number; name?: string } | null
): boolean {
  if (!a || !b) return false;

  // 1. Check by placeId (stripping 'places/' prefix)
  const aPlaceId = (a.placeId || '').replace(/^places\//, '').trim();
  const bPlaceId = (b.placeId || '').replace(/^places\//, '').trim();
  if (aPlaceId && bPlaceId && aPlaceId === bPlaceId) return true;

  // 2. Check by ID (normalizing prefixes like 'pref-', 'poi-', etc.)
  const aId = (a.id || '').replace(/^pref-/, '').replace(/^poi-/, '').trim();
  const bId = (b.id || '').replace(/^pref-/, '').replace(/^poi-/, '').trim();
  if (aId && bId) {
    if (aId === bId || (bPlaceId && aId === bPlaceId) || (aPlaceId && bId === aPlaceId)) {
      return true;
    }
  }

  // 3. Check by geographic coordinate proximity (within ~40 meters / ~0.0004 deg)
  if (typeof a.lat === 'number' && typeof a.lng === 'number' && typeof b.lat === 'number' && typeof b.lng === 'number') {
    const latDiff = Math.abs(a.lat - b.lat);
    const lngDiff = Math.abs(a.lng - b.lng);
    if (latDiff < 0.0004 && lngDiff < 0.0004) return true;
  }

  // 4. Check by normalized place name if in the same neighborhood
  if (a.name && b.name) {
    const aName = a.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const bName = b.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (aName && bName && (aName === bName || aName.includes(bName) || bName.includes(aName)) && aName.length >= 4 && bName.length >= 4) {
      if (typeof a.lat === 'number' && typeof b.lat === 'number') {
        const latDiff = Math.abs(a.lat - b.lat);
        const lngDiff = Math.abs(a.lng - b.lng);
        if (latDiff < 0.003 && lngDiff < 0.003) return true;
      } else {
        return true;
      }
    }
  }

  return false;
}

const SOLUTION_ATTRIBUTION_ID = 'gmp_aistudio_immersivetour_v1.0.0';

interface PlacesErrorBoundaryProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
  resetKey?: string;
  key?: React.Key;
}

interface PlacesErrorBoundaryState {
  hasError: boolean;
}

class PlacesErrorBoundary extends Component<PlacesErrorBoundaryProps, PlacesErrorBoundaryState> {
  override state: PlacesErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: any) {
    console.warn('Places UI Kit render note (using custom place details fallback):', error);
  }

  override componentDidUpdate(prevProps: PlacesErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

interface PlacesAdvancedListProps {
  places: string[];
  isDark?: boolean;
  onPlaceSelect?: (place: any) => void;
}

const PlacesAdvancedList: React.FC<PlacesAdvancedListProps> = ({
  places,
  isDark = false,
  onPlaceSelect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!places || places.length === 0) {
      container.innerHTML = '';
      return;
    }

    let isCancelled = false;

    const setupList = async () => {
      try {
        if ((window as any).google?.maps?.importLibrary) {
          await (window as any).google.maps.importLibrary('places');
        }
      } catch (err) {
        console.warn('Places library import note in PlacesAdvancedList:', err);
      }

      if (isCancelled || !containerRef.current) return;

      const formattedPlaces = places
        .slice(0, 25)
        .filter(Boolean)
        .map((p) => (p.startsWith('places/') ? p : `places/${p}`))
        .filter((p) => /^places\/[A-Za-z0-9_-]+$/.test(p));

      if (formattedPlaces.length === 0) {
        container.innerHTML = '';
        return;
      }

      const placesStr = formattedPlaces.join(' ');

      container.innerHTML = `
        <gmp-advanced-place-list
          places="${placesStr}"
          orientation="VERTICAL"
          selectable
          style="width: 100%; color-scheme: ${isDark ? 'dark' : 'light'}; --gmp-details-background: transparent; --gmp-details-color: ${isDark ? '#f1f5f9' : '#0f172a'}; font-family: inherit;"
        >
          <template slot="details-item">
            <gmp-place-name></gmp-place-name>
            <gmp-place-address></gmp-place-address>
            <gmp-place-rating></gmp-place-rating>
          </template>
          <gmp-place-attribution light-scheme-color="${isDark ? 'WHITE' : 'BLACK'}" dark-scheme-color="GRAY"></gmp-place-attribution>
        </gmp-advanced-place-list>
      `;

      const listEl = container.querySelector('gmp-advanced-place-list');
      if (!listEl) return;

      // Also set places property directly in case setter is active
      try {
        (listEl as any).places = formattedPlaces;
      } catch {}

      const onSelect = (e: any) => {
        if (onPlaceSelect && e.place) {
          onPlaceSelect(e.place);
        }
      };

      const onClickCapture = (e: MouseEvent) => {
        const path = (e.composedPath ? e.composedPath() : []) as any[];
        for (const node of path) {
          if (node && node.place && onPlaceSelect) {
            onPlaceSelect(node.place);
            break;
          }
        }
      };

      const onError = (e: any) => {
        console.warn('Advanced Place List report:', e.detail?.errors ?? e);
      };

      listEl.addEventListener('gmp-select', onSelect);
      listEl.addEventListener('click', onClickCapture);
      listEl.addEventListener('gmp-error', onError);
    };

    setupList();

    return () => {
      isCancelled = true;
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [places.join(' '), isDark]);

  return <div ref={containerRef} className="w-full min-h-[160px]" />;
};

function PlacesBasicAutocomplete({
  onPlaceSelect,
  isDark,
  locationBiasCenter,
  compact = false,
  onFocusChange,
}: {
  onPlaceSelect: (place: any) => void;
  isDark: boolean;
  locationBiasCenter?: { lat: number; lng: number };
  compact?: boolean;
  onFocusChange?: (focused: boolean) => void;
}) {
  const elRef = useRef<HTMLElement | null>(null);
  const onSelectRef = useRef(onPlaceSelect);
  onSelectRef.current = onPlaceSelect;
  const [isFocused, setIsFocused] = useState(false);

  // Apply responsive styles into shadowRoot so text and icons are vertically centered, stable, and dropdown list is never clipped
  const updateShadowStyles = (el: HTMLElement | null, focused: boolean, isCompact: boolean) => {
    if (!el || !el.shadowRoot) return;
    try {
      let style = el.shadowRoot.querySelector('style[data-comfort-style]') as HTMLStyleElement | null;
      if (!style) {
        style = document.createElement('style');
        style.setAttribute('data-comfort-style', 'true');
        el.shadowRoot.appendChild(style);
      }
      const targetHeight = isCompact ? '32px' : (focused ? '42px' : '38px');
      style.textContent = `
        :host {
          height: ${targetHeight} !important;
          min-height: ${targetHeight} !important;
          border-radius: ${isCompact ? '10px' : '12px'} !important;
          box-sizing: border-box !important;
          font-family: inherit !important;
          overflow: visible !important;
          position: relative !important;
          display: block !important;
          width: 100% !important;
        }
        .widget-container, .input-container {
          height: ${targetHeight} !important;
          min-height: ${targetHeight} !important;
          max-height: ${targetHeight} !important;
          box-sizing: border-box !important;
          display: flex !important;
          align-items: center !important;
          overflow: visible !important;
        }
        .input-container div.autocomplete-icon {
          height: 100% !important;
          width: ${isCompact ? '26px' : '34px'} !important;
          min-width: ${isCompact ? '26px' : '34px'} !important;
          padding: 0 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .input-container div.autocomplete-icon svg {
          height: ${isCompact ? '14px' : '17px'} !important;
          width: ${isCompact ? '14px' : '17px'} !important;
        }
        .input-container button.clear-button {
          height: 100% !important;
          width: ${isCompact ? '26px' : '32px'} !important;
          min-width: ${isCompact ? '26px' : '32px'} !important;
          padding: 0 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          cursor: pointer !important;
        }
        .input-container button.clear-button svg {
          height: ${isCompact ? '13px' : '15px'} !important;
          width: ${isCompact ? '13px' : '15px'} !important;
        }
        input {
          font-size: ${isCompact ? '13px' : '14px'} !important;
          line-height: normal !important;
          height: 100% !important;
          min-height: ${isCompact ? '24px' : '30px'} !important;
          padding: 0 4px !important;
          margin: 0 !important;
          box-sizing: border-box !important;
          vertical-align: middle !important;
          font-family: inherit !important;
        }
      `;
    } catch {}
  };

  useEffect(() => {
    let isCancelled = false;

    const setup = async () => {
      try {
        if ((window as any).google?.maps?.importLibrary) {
          await (window as any).google.maps.importLibrary('places');
        }
      } catch (err) {
        console.warn('Places import for basic autocomplete:', err);
      }

      if (isCancelled) return;
      const el = elRef.current;
      if (!el) return;

      if (locationBiasCenter) {
        try {
          (el as any).locationBias = {
            center: locationBiasCenter,
            radius: 35000,
          };
        } catch {}
      }

      updateShadowStyles(el, isFocused, compact);
    };

    setup();

    return () => {
      isCancelled = true;
    };
  }, [locationBiasCenter?.lat, locationBiasCenter?.lng, compact, isFocused]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const handleActivate = () => {
      setIsFocused(true);
      onFocusChange?.(true);
      updateShadowStyles(el, true, compact);
    };

    const handler = (event: any) => {
      const selected = event?.place || (typeof event?.placePrediction?.toPlace === 'function' ? event.placePrediction.toPlace() : event?.placePrediction);
      if (selected) {
        onSelectRef.current(selected);
        setIsFocused(false);
        onFocusChange?.(false);
        updateShadowStyles(el, false, compact);

        // Clear the inner native input and blur so subsequent clicks immediately expand fresh autocomplete
        try {
          const innerInput = el.shadowRoot?.querySelector('input');
          if (innerInput) {
            innerInput.value = '';
            innerInput.blur();
          }
        } catch {}
      }
    };

    const handleFocusIn = () => {
      handleActivate();
    };

    const handleFocusOut = (e: FocusEvent) => {
      const path = (e.composedPath && e.composedPath()) || [];
      if (!path.includes(el) && !el.contains(e.relatedTarget as Node)) {
        setIsFocused(false);
        onFocusChange?.(false);
        updateShadowStyles(el, false, compact);
      }
    };

    // Attach listeners on both the web component and document to guarantee expanding on every user tap/click
    el.addEventListener('gmp-select', handler);
    el.addEventListener('gmp-placeselect', handler);
    el.addEventListener('focusin', handleFocusIn);
    el.addEventListener('focusout', handleFocusOut);
    el.addEventListener('pointerdown', handleActivate);
    el.addEventListener('click', handleActivate);

    // Also attach to inner input if shadowRoot is ready
    let innerInput: HTMLInputElement | null = null;
    try {
      innerInput = el.shadowRoot?.querySelector('input') as HTMLInputElement | null;
      if (innerInput) {
        innerInput.addEventListener('pointerdown', handleActivate);
        innerInput.addEventListener('click', handleActivate);
        innerInput.addEventListener('focus', handleActivate);
      }
    } catch {}

    const handleDocPointerDown = (e: MouseEvent | TouchEvent) => {
      const path = (e.composedPath && e.composedPath()) || [];
      if (!path.includes(el) && !el.contains(e.target as Node)) {
        setIsFocused(false);
        onFocusChange?.(false);
        updateShadowStyles(el, false, compact);
      }
    };
    document.addEventListener('pointerdown', handleDocPointerDown);

    return () => {
      el.removeEventListener('gmp-select', handler);
      el.removeEventListener('gmp-placeselect', handler);
      el.removeEventListener('focusin', handleFocusIn);
      el.removeEventListener('focusout', handleFocusOut);
      el.removeEventListener('pointerdown', handleActivate);
      el.removeEventListener('click', handleActivate);
      document.removeEventListener('pointerdown', handleDocPointerDown);
      if (innerInput) {
        innerInput.removeEventListener('pointerdown', handleActivate);
        innerInput.removeEventListener('click', handleActivate);
        innerInput.removeEventListener('focus', handleActivate);
      }
    };
  }, [onFocusChange, compact]);

  const componentHeight = compact ? '32px' : (isFocused ? '42px' : '38px');

  return (
    <div
      className="w-full relative z-30 cursor-pointer"
      onPointerDown={() => {
        setIsFocused(true);
        onFocusChange?.(true);
        updateShadowStyles(elRef.current, true, compact);
      }}
      onClick={() => {
        setIsFocused(true);
        onFocusChange?.(true);
        updateShadowStyles(elRef.current, true, compact);
      }}
    >
      <gmp-basic-place-autocomplete
        ref={elRef}
        slot="control-inline-start-block-start"
        style={{
          width: '100%',
          display: 'block',
          borderRadius: compact ? '10px' : '12px',
          colorScheme: isDark ? 'dark' : 'light',
          height: componentHeight,
          minHeight: componentHeight,
          overflow: 'visible',
          boxSizing: 'border-box',
        }}
      ></gmp-basic-place-autocomplete>
    </div>
  );
}

export interface CalibratedViewportData {
  diagonalMeters: number;
  widthMeters: number;
  heightMeters: number;
  range: number;
  altitudeOffset: number;
  tilt: number;
  bounds: { north: number; south: number; east: number; west: number };
  center?: { lat: number; lng: number };
}

// In-memory cache for Places API (New) viewport bounding box calculations
export const viewportCache = new globalThis.Map<string, CalibratedViewportData>();

/**
 * Parses and calibrates viewport bounding box from any Google Places API format
 * (LatLngBounds, high/low latitude/longitude, northeast/southwest, north/south/east/west).
 */
export function parseAndStoreViewport(
  placeId: string,
  viewport: any,
  placeName?: string,
  placeTypes?: string[]
): CalibratedViewportData | null {
  if (!placeId || !viewport) return null;
  const cleanId = placeId.startsWith('places/') ? placeId.replace('places/', '') : placeId;

  const extractNum = (val: any): number => {
    if (typeof val === 'function') {
      try { return Number(val()); } catch { return NaN; }
    }
    return typeof val === 'number' ? val : Number(val);
  };

  const extractPtLat = (pt: any): number => {
    if (!pt) return NaN;
    if (typeof pt.lat === 'function') return extractNum(pt.lat());
    if (typeof pt.latitude === 'function') return extractNum(pt.latitude());
    return extractNum(pt.latitude ?? pt.lat);
  };

  const extractPtLng = (pt: any): number => {
    if (!pt) return NaN;
    if (typeof pt.lng === 'function') return extractNum(pt.lng());
    if (typeof pt.longitude === 'function') return extractNum(pt.longitude());
    return extractNum(pt.longitude ?? pt.lng);
  };

  let north = NaN;
  let south = NaN;
  let east = NaN;
  let west = NaN;

  // 1. Google Maps JS SDK LatLngBounds (getNorthEast, getSouthWest)
  if (typeof viewport.getNorthEast === 'function' && typeof viewport.getSouthWest === 'function') {
    const ne = viewport.getNorthEast();
    const sw = viewport.getSouthWest();
    north = extractPtLat(ne);
    east = extractPtLng(ne);
    south = extractPtLat(sw);
    west = extractPtLng(sw);
  }

  // 2. Places API (New) REST / Place class format: high.latitude / low.latitude (as in user payload)
  if (isNaN(north) || isNaN(south) || isNaN(east) || isNaN(west)) {
    const high = viewport.high || viewport.northeast || viewport.northEast || viewport.ne;
    const low = viewport.low || viewport.southwest || viewport.southWest || viewport.sw;
    if (high && low) {
      north = extractPtLat(high);
      east = extractPtLng(high);
      south = extractPtLat(low);
      west = extractPtLng(low);
    }
  }

  // 3. Direct north / south / east / west properties
  if (isNaN(north) || isNaN(south) || isNaN(east) || isNaN(west)) {
    north = extractNum(viewport.north);
    south = extractNum(viewport.south);
    east = extractNum(viewport.east);
    west = extractNum(viewport.west);
  }

  if (!isNaN(north) && !isNaN(south) && !isNaN(east) && !isNaN(west)) {
    const minLat = Math.min(north, south);
    const maxLat = Math.max(north, south);
    const minLng = Math.min(east, west);
    const maxLng = Math.max(east, west);

    const centerLat = (maxLat + minLat) / 2;
    const centerLng = (maxLng + minLng) / 2;
    const widthMeters = getHaversineDistance(centerLat, minLng, centerLat, maxLng) * 1000;
    const heightMeters = getHaversineDistance(minLat, centerLng, maxLat, centerLng) * 1000;
    let diagonalMeters = Math.max(60, Math.round(Math.hypot(widthMeters, heightMeters)));

    const nameStr = (placeName || cleanId || '').toLowerCase();
    const typesArr = placeTypes || [];
    const typesStr = typesArr.join(' ').toLowerCase();

    const isMountain = (/fuji|everest|kilimanjaro|matterhorn|mont blanc|rainier|denali|vesuvius|etna|volcano/i.test(nameStr) ||
      (/(mountain|summit|peak|volcano)/i.test(nameStr) && !/park|street|beach|island|drive|blvd|avenue|road|way|plaza|pier|wharf/i.test(nameStr))) &&
      !/beach|park|street|island/i.test(nameStr);
    const isTallTower = /eiffel|tour eiffel|tokyo tower|shard|burj|tower|skyscraper|needle/i.test(nameStr);
    const isVenice = /venice|venezia/i.test(nameStr);
    const isParis = /paris/i.test(nameStr);
    const isStateOrCountry = /administrative_area_level_1|country/i.test(typesStr) ||
      /colorado|california|texas|alaska|washington|florida|switzerland|france|japan|germany|italy|brazil|canada/i.test(nameStr) ||
      diagonalMeters > 200000;

    let range: number;
    let altitudeOffset: number = 20;
    let tilt: number;

    if (isMountain) {
      // Mont Blanc, Mount Fuji, Everest, Kilimanjaro, Rainier, Denali, etc.
      tilt = 40;
      altitudeOffset = /mont blanc/i.test(nameStr) ? 420 : 320;
      if (diagonalMeters >= 15000) {
        range = Math.max(24000, Math.round(diagonalMeters * 1.35));
      } else if (/mont blanc/i.test(nameStr)) {
        range = 30000;
        diagonalMeters = 28000;
      } else if (/fuji/i.test(nameStr)) {
        range = 25000;
        diagonalMeters = 24000;
      } else {
        range = 26000;
        diagonalMeters = 22000;
      }
    } else if (isTallTower) {
      tilt = 52;
      altitudeOffset = 140;
      range = 1550;
    } else if (isVenice) {
      tilt = 48;
      altitudeOffset = 45;
      range = 3400;
    } else if (isParis && (!placeTypes || /locality|political|city/i.test(typesStr))) {
      tilt = 48;
      altitudeOffset = 100;
      range = 7200;
    } else if (isStateOrCountry) {
      // Large State / Province / Country (e.g. Colorado, California, Switzerland)
      tilt = 20;
      altitudeOffset = 0;
      const tiltRad = (tilt * Math.PI) / 180;
      const cosTilt = Math.max(0.25, Math.cos(tiltRad));
      const dWidth = (widthMeters / 2) / Math.tan((60 * Math.PI) / 360);
      const dHeight = (heightMeters / 2) / (Math.tan((45 * Math.PI) / 360) * cosTilt);
      range = Math.round(Math.max(dWidth * 1.35, dHeight * 1.35, diagonalMeters * 1.35));
    } else {
      // Standard landmark and POI camera fitting (beaches, parks, streets, monuments, islands)
      if (diagonalMeters > 50000) {
        tilt = 40;
        altitudeOffset = 60;
      } else if (diagonalMeters > 15000) {
        tilt = 45;
        altitudeOffset = 40;
      } else if (diagonalMeters > 3000) {
        tilt = 50;
        altitudeOffset = 30;
      } else if (diagonalMeters > 800) {
        tilt = 54;
        altitudeOffset = 20;
      } else {
        tilt = 58;
        altitudeOffset = 15;
      }

      const tiltRad = (tilt * Math.PI) / 180;
      const cosTilt = Math.max(0.25, Math.cos(tiltRad));
      const dWidth = (widthMeters / 2) / Math.tan((60 * Math.PI) / 360);
      const dHeight = (heightMeters / 2) / (Math.tan((45 * Math.PI) / 360) * cosTilt);
      const rawRange = Math.round(Math.max(dWidth * 1.25, dHeight * 1.25, diagonalMeters * 1.25));
      // Tightly focus on the landmark: 380m to 1400m max so POIs are never seen from high altitude
      range = Math.min(1400, Math.max(380, rawRange));
    }

    const data: CalibratedViewportData = {
      diagonalMeters,
      widthMeters,
      heightMeters,
      range,
      altitudeOffset,
      tilt,
      bounds: { north: maxLat, south: minLat, east: maxLng, west: minLng },
      center: { lat: centerLat, lng: centerLng },
    };
    viewportCache.set(cleanId, data);
    return data;
  }
  return null;
}

/**
 * Fetches the official bounding box (viewport) for a place via Places API (New) Place.fetchFields({ fields: ['viewport', 'location'] }).
 * Dynamically computes physical dimensions in meters to adapt 3D camera range and altitude according to the landmark's scale.
 */
export async function fetchPlaceViewport(placeId: string): Promise<CalibratedViewportData | null> {
  if (!placeId) return null;
  const cleanId = placeId.startsWith('places/') ? placeId.replace('places/', '') : placeId;

  if (viewportCache.has(cleanId)) {
    return viewportCache.get(cleanId)!;
  }

  try {
    const googleMaps = (window as any).google?.maps;
    if (!googleMaps) return null;

    let PlaceClass = googleMaps.places?.Place;
    if (!PlaceClass && googleMaps.importLibrary) {
      const placesLib = await googleMaps.importLibrary('places');
      PlaceClass = placesLib.Place;
    }
    if (PlaceClass) {
      const place = new PlaceClass({
        id: cleanId,
        requestedLanguage: 'en',
      });

      await place.fetchFields({
        fields: ['viewport', 'location', 'displayName', 'types'],
      });

      if (place.viewport) {
        const placeName = typeof place.displayName === 'object' ? place.displayName.text || place.displayName : place.displayName;
        const data = parseAndStoreViewport(cleanId, place.viewport, placeName, place.types);
        if (data) return data;
      }
    }

    // Geocoder fallback if Places API did not return viewport
    if (googleMaps.Geocoder) {
      const geocoder = new googleMaps.Geocoder();
      const res = await geocoder.geocode({ placeId: cleanId });
      if (res?.results?.[0]?.geometry?.viewport) {
        const data = parseAndStoreViewport(cleanId, res.results[0].geometry.viewport, res.results[0].formatted_address, res.results[0].types);
        if (data) return data;
      }
    }
  } catch (err) {
    console.warn(`Place.fetchFields viewport fetch note for ${cleanId}:`, err);
  }
  return null;
}

/**
 * Calculates adaptive 3D camera parameters based on place altitude and structure size.
 * Leverages Places API (New) bounding box viewport calibration when available to dynamically
 * scale camera range and altitude according to the landmark's physical size (landmark vs park vs mountain vs city vs state).
 */
export function calculateCameraParameters(
  target: Landmark | { lat: number; lng: number; altitude?: number; name?: string; category?: string; camRange?: number; camTilt?: number; camHeading?: number; heading?: number; camRangeMobile?: number; placeId?: string; types?: string[] },
  mode: 'center' | 'cameraPosition',
  overrideAltitudeMode: 'RELATIVE_TO_MESH' | 'CLAMP_TO_GROUND' | 'ABSOLUTE' = 'RELATIVE_TO_MESH',
  overrideAltitudeOffset: number | null = null,
  rangeMultiplier: number = 1.0,
  isMobileScreen: boolean = false,
  viewportOverride?: CalibratedViewportData | null
) {
  const lat = Number(target.lat);
  const lng = Number(target.lng);
  const rawAltitude = Number(target.altitude || 0);

  // Check cached viewport bounding box
  const cleanPlaceId = (target as any).placeId ? (target as any).placeId.replace(/^places\//, '') : null;
  const vp = viewportOverride || (cleanPlaceId ? viewportCache.get(cleanPlaceId) : null);

  const nameStr = ((target as any).name || '').toLowerCase();
  const catStr = ((target as any).category || '').toLowerCase();
  const typesArr: string[] = Array.isArray((target as any).types) ? (target as any).types : [];
  const typesStr = typesArr.join(' ').toLowerCase();

  // 1. Mountain / Volcano / High Natural Peak (Mount Fuji, Everest, Kilimanjaro, Mount Rainier, Mont Blanc, etc.)
  // Strictly real mountain peaks, NEVER beaches, streets, parks, or islands!
  const isMountain = (/fuji|everest|kilimanjaro|matterhorn|mont blanc|rainier|denali|vesuvius|etna|volcano/i.test(nameStr) ||
    (/(mountain|summit|peak|volcano)/i.test(nameStr) && !/park|street|beach|island|drive|blvd|avenue|road|way|plaza|pier|wharf/i.test(nameStr)) ||
    catStr === 'mountain' ||
    typesArr.some((t: string) => /mountain_peak|volcano/i.test(t))) &&
    !/beach|park|street|island/i.test(nameStr);

  // 2. Tall Tower / Skyscraper / Spire (Eiffel Tower, Tokyo Tower, Shard, Empire State Building, etc.)
  const isTallTower = /eiffel|tour eiffel|tokyo tower|torre|shard|burj|empire state|space needle|tall building|skyscraper|spire/i.test(nameStr) ||
    (target as any).id === 'eiffel-tower' ||
    /tower|skyscraper/i.test(catStr);

  // 3. Venice (Canal island historic city)
  const isVenice = /venice|venezia/i.test(nameStr) || (target as any).id === 'venice' || (target as any).cityId === 'venice';

  // 4. Paris (City of Light overview)
  const isParis = /paris/i.test(nameStr) || (target as any).id === 'paris' || (target as any).cityId === 'paris';

  // 5. Large State / Region / Country (e.g. Colorado, California, Texas, Switzerland)
  const isStateOrCountry = !isMountain && (
    /administrative_area_level_1|country/i.test(typesStr) ||
    /colorado|california|texas|alaska|washington|florida|switzerland|france|japan|germany|italy|brazil|canada/i.test(nameStr) ||
    (vp && vp.diagonalMeters > 200000)
  );

  // 6. General City level / Metropolitan area
  const isCityLevel = !isMountain && !isTallTower && !isStateOrCountry && (
    /locality|administrative_area|political|city/i.test(typesStr) ||
    (target as any).category === 'City' ||
    /tokyo|london|new york|san francisco|rome|barcelona|sydney|amsterdam|singapore|rio|florence|madrid|berlin/i.test(nameStr)
  );

  // 7. Coastal / Waterfront / Beach at sea level (e.g. Ocean Beach, Copacabana)
  const isSeaLevel = !isMountain && !isTallTower && !isCityLevel && !isStateOrCountry && (
    rawAltitude <= 25 ||
    /beach|sea|bay|harbor|canal|river|waterfront|plaza|square/i.test(catStr) ||
    /beach|ocean beach|baker beach|copacabana|ipanema|harbor|bay|quay|canal|wharf/i.test(nameStr) ||
    typesArr.some((t: string) => /beach/i.test(t))
  );

  // 8. Streets / Crooked roads / Avenues (e.g. Lombard Street)
  const isStreetOrRoute = !isMountain && !isTallTower && !isCityLevel && !isStateOrCountry && (
    /street|st\.|road|rd\.|avenue|ave\.|boulevard|blvd|drive|dr\.|lane|way|switchback|crooked/i.test(nameStr) ||
    typesArr.some((t: string) => /route|transit_station/i.test(t))
  );

  // 9. Island / Tourist attraction / Park (e.g. Alcatraz Island, John McLaren Park)
  const isIslandOrAttraction = !isMountain && !isTallTower && !isCityLevel && !isStateOrCountry && (
    /island|alcatraz|park|presidio|wharf|pier|monument|fort|battery|garden|square/i.test(nameStr) ||
    typesArr.some((t: string) => /tourist_attraction|historical_place|park|museum/i.test(t))
  );

  // 10. General elevated landmark / hill
  const isHighAltitude = !isMountain && !isTallTower && !isCityLevel && !isStateOrCountry && (
    rawAltitude >= 70 ||
    /hill|observatory|bridge|lookout|viewpoint/i.test(catStr) ||
    /corcovado|sugarloaf|viewpoint|lookout|twin peaks/i.test(nameStr)
  );

  const altMode = overrideAltitudeMode || 'RELATIVE_TO_MESH';

  // ALWAYS lock camera pivot directly to the exact marker coordinates!
  const targetMarkerLat = (!isNaN(lat) && lat !== 0) ? lat : Number((target as any).lat || (vp?.center?.lat ?? 0));
  const targetMarkerLng = (!isNaN(lng) && lng !== 0) ? lng : Number((target as any).lng || (vp?.center?.lng ?? 0));

  if (mode === 'cameraPosition') {
    // CAMERA POSITION MODE
    let clearanceHeight = 100;
    if (overrideAltitudeOffset !== null && overrideAltitudeOffset !== undefined) {
      clearanceHeight = overrideAltitudeOffset;
    } else if (isMountain) {
      clearanceHeight = 450;
    } else if (isTallTower) {
      clearanceHeight = 180;
    } else if (isStateOrCountry) {
      clearanceHeight = 50000;
    } else if (isCityLevel) {
      clearanceHeight = 400;
    } else if (isHighAltitude) {
      clearanceHeight = 120;
    } else if (isSeaLevel) {
      clearanceHeight = 60;
    } else if (vp) {
      clearanceHeight = Math.max(60, Math.min(1800, Math.round(vp.diagonalMeters * 0.25)));
    } else {
      clearanceHeight = 100;
    }

    return {
      cameraPosition: {
        lat: targetMarkerLat,
        lng: targetMarkerLng,
        altitude: clearanceHeight,
        altitudeMode: altMode,
      },
      tilt: 80,
      heading: Number((target as any).camHeading ?? (target as any).heading ?? 0),
      isCenterMode: false,
      altitudeOffset: clearanceHeight,
      altMode,
    };
  } else {
    // CENTER MODE (Looking AT the target marker)
    const hasCuratedCamRange = typeof (target as any).camRange === 'number' && (target as any).camRange > 0;
    let targetMeshAltitude = 20;
    let targetRange = hasCuratedCamRange ? Number((target as any).camRange) : 800;
    let targetTilt = Number((target as any).camTilt || 60);

    if (overrideAltitudeOffset !== null && overrideAltitudeOffset !== undefined) {
      targetMeshAltitude = overrideAltitudeOffset;
    } else if (hasCuratedCamRange) {
      // PRESERVE CURATED CLOSE-UP FRAMING FOR ALL ICONIC LANDMARKS (Alcatraz 800m, Lombard 450m, McLaren Park 1000m, etc.)
      targetRange = Number((target as any).camRange);
      targetTilt = Number((target as any).camTilt || 60);
      targetMeshAltitude = 20;
    } else if (isMountain) {
      // Mont Blanc, Mount Fuji, Everest, Kilimanjaro, Rainier, Denali, etc.
      // Massifs are 20km-40km wide: zoomed out to 25,000m - 30,000m with tilt 40°
      targetMeshAltitude = /mont blanc/i.test(nameStr) ? 420 : 320;
      targetTilt = 40;
      if (vp && vp.diagonalMeters >= 15000) {
        targetRange = Math.max(24000, vp.range);
      } else if (/mont blanc/i.test(nameStr)) {
        targetRange = 30000;
      } else if (/fuji/i.test(nameStr)) {
        targetRange = 25000;
      } else {
        targetRange = 26000;
      }
    } else if (isTallTower) {
      // Eiffel Tower / Skyscraper
      targetMeshAltitude = 140;
      targetRange = vp ? Math.max(1450, Math.min(1850, vp.range)) : (isMobileScreen ? 1650 : 1550);
      targetTilt = 52;
    } else if (isVenice) {
      // Venice: compact historic island city
      targetMeshAltitude = 45;
      targetRange = isMobileScreen ? 3800 : 3400;
      targetTilt = 48;
    } else if (isParis && ((target as any).category === 'City' || !(target as any).id || (target as any).id === 'paris' || isCityLevel)) {
      // Paris city overview: 7,200m
      targetMeshAltitude = 100;
      targetRange = isMobileScreen ? 8200 : 7200;
      targetTilt = 48;
    } else if (isStateOrCountry) {
      // Colorado, California, Switzerland
      targetMeshAltitude = 0;
      targetTilt = 20;
      targetRange = vp ? Math.max(600000, vp.range) : 950000;
    } else if (isCityLevel) {
      targetMeshAltitude = 120;
      targetRange = isMobileScreen ? 8200 : 7200;
      targetTilt = 46;
    } else if (isStreetOrRoute) {
      targetMeshAltitude = 20;
      targetRange = isMobileScreen ? 650 : 500;
      targetTilt = 60;
    } else if (isSeaLevel) {
      // Ocean Beach, Copacabana, Baker Beach
      targetMeshAltitude = 15;
      targetRange = isMobileScreen ? 1100 : 950;
      targetTilt = 56;
    } else if (isIslandOrAttraction) {
      targetMeshAltitude = 20;
      targetRange = isMobileScreen ? 950 : 800;
      targetTilt = 58;
    } else if (vp) {
      targetMeshAltitude = vp.altitudeOffset;
      // Cap landmark viewport range to 1400m so points of interest stay closely framed!
      targetRange = Math.min(1400, Math.max(380, vp.range));
      targetTilt = Math.min(65, Math.max(50, vp.tilt));
    } else if (isHighAltitude) {
      targetMeshAltitude = 50;
      targetRange = Math.max(targetRange, isMobileScreen ? 1200 : 1050);
      targetTilt = 58;
    } else {
      targetMeshAltitude = 20;
      targetRange = Math.min(1400, Math.max(380, targetRange));
      targetTilt = 58;
    }

    targetRange = Math.round(targetRange * rangeMultiplier);

    if (isMobileScreen && !isMountain && !isTallTower && !isVenice && !isParis && !isStateOrCountry) {
      targetRange = (target as any).camRangeMobile || Math.round(targetRange * 1.12);
    }

    // Exact landmark center (lat & lng only, anchored to terrain/building mesh surface)
    // Exactly matches the rotation orbit center so flyCameraTo flies directly to the landmark
    // with zero visual altitude drop or camera jump!
    const centerObj: { lat: number; lng: number; altitude?: number; altitudeMode?: string } = {
      lat: targetMarkerLat,
      lng: targetMarkerLng,
    };

    // Only apply explicit altitude when the user has set a custom altitude offset via the controls
    if (overrideAltitudeOffset !== null && overrideAltitudeOffset !== undefined) {
      centerObj.altitude = overrideAltitudeOffset;
      centerObj.altitudeMode = altMode;
    }

    return {
      center: centerObj,
      range: targetRange,
      tilt: targetTilt,
      heading: Number((target as any).camHeading ?? (target as any).heading ?? 0),
      isCenterMode: true,
      altitudeOffset: overrideAltitudeOffset ?? 0,
      altMode,
    };
  }
}

export default function App() {
  // API Key State & Configuration
  const [apiKey, setApiKey] = useState<string>(getInitialApiKey);
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);
  const [keyInputValue, setKeyInputValue] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('gmp_custom_api_key') || localStorage.getItem('custom_maps_api_key') || '';
    }
    return '';
  });

  const isCustomKey = Boolean(apiKey && apiKey.trim() !== '' && apiKey !== DEFAULT_DEV_API_KEY);
  const [authFailed, setAuthFailed] = useState<boolean>(false);

  useEffect(() => {
    (window as any).gm_authFailure = () => {
      console.warn("Google Maps Platform auth failure detected");
      setAuthFailed(true);
    };
  }, []);

  const hasConfiguredKey = Boolean(
    apiKey &&
    apiKey.trim() !== '' &&
    apiKey !== 'MY_GOOGLE_MAPS_PLATFORM_KEY' &&
    apiKey !== 'YOUR_API_KEY'
  );

  const isKeyWorking = hasConfiguredKey && !authFailed;

  const formatMaskedKey = (key: string) => {
    if (!key) return "None";
    if (key.length <= 16) return key;
    return `${key.slice(0, 8)}...${key.slice(-6)}`;
  };

  const handleSaveApiKey = () => {
    const trimmed = keyInputValue.trim();
    if (trimmed) {
      localStorage.setItem('gmp_custom_api_key', trimmed);
      localStorage.setItem('custom_maps_api_key', trimmed);
    } else {
      localStorage.removeItem('gmp_custom_api_key');
      localStorage.removeItem('custom_maps_api_key');
    }
    setShowApiKeyModal(false);
    window.location.reload();
  };

  const handleResetApiKey = () => {
    localStorage.removeItem('gmp_custom_api_key');
    localStorage.removeItem('custom_maps_api_key');
    setKeyInputValue('');
    setShowApiKeyModal(false);
    window.location.reload();
  };

  // City Selection State (Randomly picked city on initial load)
  const [selectedCityId, setSelectedCityId] = useState<string>(() => {
    if (CITIES && CITIES.length > 0) {
      const randomIndex = Math.floor(Math.random() * CITIES.length);
      return CITIES[randomIndex].id;
    }
    return DEFAULT_CITY_ID;
  });
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState<boolean>(false);
  const [canScrollMoreCities, setCanScrollMoreCities] = useState<boolean>(true);
  const cityDropdownScrollRef = useRef<HTMLDivElement>(null);
  const cityDropdownContainerRef = useRef<HTMLDivElement>(null);
  const selectedCity = getCityConfig(selectedCityId);

  // Check scroll position for City Dropdown menu to show/hide bottom indicator arrow
  const handleCityScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 8;
    setCanScrollMoreCities(!isAtBottom);
  };

  const handleScrollMoreCities = () => {
    if (cityDropdownScrollRef.current) {
      cityDropdownScrollRef.current.scrollBy({ top: 120, behavior: 'smooth' });
    }
  };

  // Close city dropdown when clicking outside
  useEffect(() => {
    if (!isCityDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        cityDropdownContainerRef.current &&
        !cityDropdownContainerRef.current.contains(event.target as Node)
      ) {
        setIsCityDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isCityDropdownOpen]);

  useEffect(() => {
    if (isCityDropdownOpen) {
      setTimeout(() => {
        if (cityDropdownScrollRef.current) {
          const el = cityDropdownScrollRef.current;
          setCanScrollMoreCities(el.scrollHeight > el.clientHeight + 4);
        }
      }, 50);
    }
  }, [isCityDropdownOpen]);

  // State managers
  const [landmarksList, setLandmarksList] = useState<Landmark[]>(() => getCityConfig(selectedCityId).landmarks);
  const [activeLandmark, setActiveLandmark] = useState<Landmark | null>(null);
  const [hoveredLandmark, setHoveredLandmark] = useState<Landmark | null>(null);

  const [mapMode, setMapMode] = useState<'HYBRID' | 'SATELLITE' | 'ROADMAP'>('HYBRID');
  const [forceNorth, setForceNorth] = useState<boolean>(true);
  const forceNorthRef = useRef<boolean>(true);
  const [isTouring, setIsTouring] = useState<boolean>(false);
  const [rotationMode, setRotationMode] = useState<'none' | 'left' | 'right'>('right');
  const rotationModeRef = useRef<'none' | 'left' | 'right'>('right');
  const isRotatingPoi = rotationMode !== 'none';
  const isRotatingPoiRef = useRef<boolean>(true);
  const rotateAnimFrameRef = useRef<number | null>(null);
  const lastKnownHeadingRef = useRef<number>(0);
  const [isFlying, setIsFlying] = useState<boolean>(false);
  const isFlyingRef = useRef<boolean>(false);
  const triggerPoiOrbitRef = useRef<((lm?: Landmark | null) => void) | null>(null);
  const stopCameraOrbitOnlyRef = useRef<(() => void) | null>(null);
  const pauseCurrentRotationOnInteractionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    isFlyingRef.current = isFlying;
  }, [isFlying]);
  const [hasInteractedWithTour, setHasInteractedWithTour] = useState<boolean>(false);
  const [showLandingBanner, setShowLandingBanner] = useState<boolean>(true);
  const [showPlaceInfo, setShowPlaceInfo] = useState<boolean>(true);
  const showMobilePlaceModal = showPlaceInfo;
  const setShowMobilePlaceModal = setShowPlaceInfo;
  const [tourIndex, setTourIndex] = useState<number>(0);
  const [mapsLoaded, setMapsLoaded] = useState<boolean>(false);
  const [placesLoaded, setPlacesLoaded] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showPopovers, setShowPopovers] = useState<boolean>(true);
  const [showFullPlaceDetails, setShowFullPlaceDetails] = useState<boolean>(false);

  // Preferred Places list state: flushed on every load (every load is considered a fresh first load)
  const [preferredPlaces, setPreferredPlaces] = useState<PreferredPlaceItem[]>(() => {
    try {
      localStorage.removeItem('city-tour-preferred-places');
      sessionStorage.removeItem('city-tour-session-initialized');
      sessionStorage.removeItem('city-tour-first-load-cleaned');
    } catch {}
    return [];
  });
  const [showPreferredListModal, setShowPreferredListModal] = useState<boolean>(false);
  const advancedPlaceDetailsRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Flush saved places on first load - consider every reload a fresh start
    try {
      localStorage.removeItem('city-tour-preferred-places');
    } catch {}
    setPreferredPlaces([]);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('city-tour-preferred-places', JSON.stringify(preferredPlaces));
    } catch (e) {
      console.warn('Failed saving preferred places to localStorage', e);
    }
  }, [preferredPlaces]);

  // Active places list mode: 'city' (default city landmarks), 'preferred' (custom preferred list), or 'combined' (both)
  const [placesListMode, setPlacesListMode] = useState<'city' | 'preferred' | 'combined'>('city');
  const placesListModeRef = useRef<'city' | 'preferred' | 'combined'>('city');
  placesListModeRef.current = placesListMode;

  const selectedCityIdRef = useRef<string>(selectedCityId);
  selectedCityIdRef.current = selectedCityId;

  const activeLandmarkRef = useRef<Landmark | null>(activeLandmark);
  activeLandmarkRef.current = activeLandmark;

  const flightSeqRef = useRef<number>(0);

  const landmarksListRef = useRef<Landmark[]>(landmarksList);
  landmarksListRef.current = landmarksList;

  const preferredPlacesRef = useRef<PreferredPlaceItem[]>(preferredPlaces);
  preferredPlacesRef.current = preferredPlaces;

  // Header Search expansion state on user interaction
  const [isNavSearchActive, setIsNavSearchActive] = useState<boolean>(false);

  // Camera View Mode: 'center' (Target Centering Mode) vs 'cameraPosition' (Camera POV Position Mode)
  const [cameraViewMode, setCameraViewMode] = useState<'center' | 'cameraPosition'>('center');
  const cameraViewModeRef = useRef<'center' | 'cameraPosition'>('center');
  cameraViewModeRef.current = cameraViewMode;

  // Altitude Mode: 'RELATIVE_TO_MESH' | 'CLAMP_TO_GROUND' | 'ABSOLUTE'
  const [altitudeMode, setAltitudeMode] = useState<'RELATIVE_TO_MESH' | 'CLAMP_TO_GROUND' | 'ABSOLUTE'>('RELATIVE_TO_MESH');
  const altitudeModeRef = useRef<'RELATIVE_TO_MESH' | 'CLAMP_TO_GROUND' | 'ABSOLUTE'>('RELATIVE_TO_MESH');
  altitudeModeRef.current = altitudeMode;

  // Custom Altitude Offset (null = auto based on place altitude/size)
  const [customAltitudeOffset, setCustomAltitudeOffset] = useState<number | null>(null);
  const customAltitudeOffsetRef = useRef<number | null>(null);
  customAltitudeOffsetRef.current = customAltitudeOffset;

  // Custom Range Multiplier (1.0 = normal)
  const [customRangeMultiplier, setCustomRangeMultiplier] = useState<number>(1.0);
  const customRangeMultiplierRef = useRef<number>(1.0);
  customRangeMultiplierRef.current = customRangeMultiplier;

  // Custom Tilt Override (null = automatic)
  const [customTiltOverride, setCustomTiltOverride] = useState<number | null>(null);
  const customTiltOverrideRef = useRef<number | null>(null);
  customTiltOverrideRef.current = customTiltOverride;

  // Show Altitude & Centering Tuning Modal
  const [showAltitudeModal, setShowAltitudeModal] = useState<boolean>(false);

  // Autocomplete search states for Preferred Places
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [suggestions, setSuggestions] = useState<Array<{ placeId: string; mainText: string; secondaryText: string; fullText: string }>>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // Autocomplete search debounce effect for Preferred Places
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    let isCurrent = true;
    setIsSearching(true);

    const fetchSuggestions = async () => {
      try {
        const googleMaps = (window as any).google?.maps;
        if (!googleMaps) return;

        // 1. Try modern AutocompleteSuggestion API
        if (googleMaps.places?.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
          const curCenter = mapElementRef.current?.center || {
            lat: getCityConfig(selectedCityId).initialCam.center.lat,
            lng: getCityConfig(selectedCityId).initialCam.center.lng,
          };
          const response = await googleMaps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: searchQuery,
            locationBias: {
              center: { lat: curCenter.lat, lng: curCenter.lng },
              radius: 50000,
            },
          });
          if (!isCurrent) return;
          if (response?.suggestions) {
            const list = response.suggestions
              .filter((s: any) => s.placePrediction)
              .map((s: any) => {
                const p = s.placePrediction;
                return {
                  placeId: p.placeId,
                  mainText: p.mainText?.text || p.text?.text || searchQuery,
                  secondaryText: p.secondaryText?.text || '',
                  fullText: p.text?.text || searchQuery,
                };
              });
            setSuggestions(list);
            setIsSearching(false);
            return;
          }
        }

        // 2. Fallback using AutocompleteService
        if (googleMaps.places?.AutocompleteService) {
          const service = new googleMaps.places.AutocompleteService();
          service.getPlacePredictions(
            {
              input: searchQuery,
              locationBias: mapElementRef.current?.center
                ? new googleMaps.LatLng(mapElementRef.current.center.lat, mapElementRef.current.center.lng)
                : undefined,
            },
            (predictions: any[]) => {
              if (!isCurrent) return;
              setIsSearching(false);
              if (predictions && Array.isArray(predictions)) {
                setSuggestions(
                  predictions.map((p) => ({
                    placeId: p.place_id,
                    mainText: p.structured_formatting?.main_text || p.description,
                    secondaryText: p.structured_formatting?.secondary_text || '',
                    fullText: p.description,
                  }))
                );
              } else {
                setSuggestions([]);
              }
            }
          );
          return;
        }
      } catch (err) {
        console.warn('Autocomplete fetch error:', err);
      } finally {
        if (isCurrent) setIsSearching(false);
      }
    };

    const timer = setTimeout(fetchSuggestions, 260);
    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [searchQuery, selectedCityId]);

  // Fetch full details of an autocomplete prediction and append to preferred places
  // Fetch full details of an autocomplete prediction and append to preferred places
  const fetchPlaceDetailsAndAdd = async (placeId: string, fallbackName?: string) => {
    const googleMaps = (window as any).google?.maps;
    let lat = 0;
    let lng = 0;
    let name = fallbackName || 'Preferred Place';
    let address = '';
    let types: string[] = [];

    try {
      if (googleMaps?.places?.Place) {
        const place = new googleMaps.places.Place({ id: placeId });
        await place.fetchFields({ fields: ['displayName', 'location', 'formattedAddress', 'viewport', 'types'] });
        if (place.location) {
          lat = typeof place.location.lat === 'function' ? place.location.lat() : Number(place.location.lat ?? place.location.latitude);
          lng = typeof place.location.lng === 'function' ? place.location.lng() : Number(place.location.lng ?? place.location.longitude);
        }
        if (place.displayName) {
          name = typeof place.displayName === 'object' ? place.displayName.text || place.displayName : place.displayName;
        }
        if (place.formattedAddress) address = place.formattedAddress;
        if (Array.isArray(place.types)) types = place.types;

        if (place.viewport) {
          parseAndStoreViewport(placeId, place.viewport, typeof name === 'string' ? name : '', types);
        }
      }
    } catch (err) {
      console.warn('Place.fetchFields error:', err);
    }

    if (!lat || !lng) {
      try {
        if (googleMaps?.Geocoder) {
          const geocoder = new googleMaps.Geocoder();
          const res = await geocoder.geocode({ placeId });
          if (res?.results?.[0]?.geometry?.location) {
            const loc = res.results[0].geometry.location;
            lat = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat);
            lng = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng);
            if (!address && res.results[0].formatted_address) address = res.results[0].formatted_address;
            if (res.results[0].geometry.viewport) {
              parseAndStoreViewport(placeId, res.results[0].geometry.viewport, typeof name === 'string' ? name : res.results[0].formatted_address, res.results[0].types);
            }
          }
        }
      } catch (e) {}
    }

    if (!lat || !lng) {
      const cur = getCityConfig(selectedCityId);
      lat = cur.initialCam.center.lat;
      lng = cur.initialCam.center.lng;
    }

    const targetCandidate = { id: placeId, placeId, lat, lng, name };
    let existingMatch = (landmarksListRef.current || []).find((l) => isSamePlace(l, targetCandidate));
    if (!existingMatch) {
      for (const [_, entry] of markersMapRef.current.entries()) {
        if (isSamePlace(entry.loc, targetCandidate)) {
          existingMatch = entry.loc;
          break;
        }
      }
    }

    if (existingMatch) {
      // Landmark ALREADY EXISTS on the map!
      // DO NOT add a duplicate marker! Simply select and fly to the existing place, changing its icon & marker style.
      setClickedPlaceId(existingMatch.placeId || existingMatch.id);
      setActiveLandmark(existingMatch);
      activeLandmarkRef.current = existingMatch;
      if (updateAllMarkerStylesRef.current) {
        updateAllMarkerStylesRef.current(existingMatch);
      }
      if (selectAndFlyToLandmarkRef.current) {
        selectAndFlyToLandmarkRef.current(existingMatch);
      }
      setShowPlaceInfo(true);
      return;
    }

    const cachedVp = viewportCache.get(placeId.replace(/^places\//, ''));
    const newItem: PreferredPlaceItem = {
      id: `pref-${placeId}`,
      placeId,
      name,
      cityName: selectedCity.name,
      cityId: selectedCityId,
      lat,
      lng,
      description: address || name,
      timestamp: Date.now(),
      types,
      camRange: cachedVp?.range,
      camTilt: cachedVp?.tilt,
    };

    saveAndActivatePreferredPlace(newItem);
  };

  // Helper to ensure preferred places state, ref, landmarks list, 3D markers and mode are always in sync
  const saveAndActivatePreferredPlace = (newItem: PreferredPlaceItem) => {
    setPreferredPlaces((prev) => {
      const filtered = prev.filter((p) => p.placeId !== newItem.placeId && p.id !== newItem.id);
      const updated = [newItem, ...filtered];
      preferredPlacesRef.current = updated;
      try {
        localStorage.setItem('preferred_places_v1', JSON.stringify(updated));
      } catch {}

      // Keep default city landmarks compatible!
      // Switch to 'combined' mode so BOTH default city places and user's saved places remain active and tourable,
      // unless user was already explicitly on 'preferred' mode.
      const targetMode: 'city' | 'preferred' | 'combined' = placesListModeRef.current === 'preferred' ? 'preferred' : 'combined';
      setPlacesListMode(targetMode);
      placesListModeRef.current = targetMode;

      const prefLandmarks = updated.map(preferredPlaceToLandmark);
      const cityLandmarks = getCityConfig(selectedCityId).landmarks;
      // Filter out any preferred places that already exist in cityLandmarks to prevent duplicate markers
      const uniquePrefLandmarks = prefLandmarks.filter(
        pref => !cityLandmarks.some(city =>
          (city.placeId && pref.placeId && city.placeId.replace(/^places\//, '') === pref.placeId.replace(/^places\//, '')) ||
          city.id === pref.id ||
          (Math.abs(city.lat - pref.lat) < 0.0003 && Math.abs(city.lng - pref.lng) < 0.0003)
        )
      );
      const targetList = targetMode === 'preferred'
        ? prefLandmarks
        : [...cityLandmarks, ...uniquePrefLandmarks];

      setLandmarksList(targetList);
      landmarksListRef.current = targetList;
      if (mapElementRef.current) {
        mountLandmarkMarkers(mapElementRef.current, targetList);
      }

      return updated;
    });

    setClickedPlaceId(newItem.placeId);
    const prefLm = preferredPlaceToLandmark(newItem, 0);
    setActiveLandmark(prefLm);
    if (selectAndFlyToLandmarkRef.current) {
      selectAndFlyToLandmarkRef.current(prefLm);
    }
    setShowMobilePlaceModal(true);
  };

  const handleSelectSuggestion = async (s: { placeId: string; mainText: string; secondaryText: string }) => {
    setSearchQuery('');
    setSuggestions([]);
    await fetchPlaceDetailsAndAdd(s.placeId, s.mainText);
  };

  // Handler for Places UI Kit Basic Autocomplete selection
  const handleBasicAutocompleteSelect = async (placeInput: any) => {
    if (!placeInput) return;
    let place = placeInput;
    if (typeof place.toPlace === 'function') {
      try {
        place = place.toPlace();
      } catch (e) {}
    }

    const rawId = place.id || place.placeId || place.name;
    const placeId = rawId ? (rawId.startsWith('places/') ? rawId.replace('places/', '') : rawId) : '';
    if (!placeId) return;

    let lat = 0;
    let lng = 0;
    let name = place.displayName || '';
    let address = place.formattedAddress || '';
    let types: string[] = Array.isArray(place.types) ? place.types : [];

    try {
      if (typeof place.fetchFields === 'function') {
        await place.fetchFields({ fields: ['displayName', 'location', 'formattedAddress', 'viewport', 'types'] });
      }
      if (place.location) {
        lat = typeof place.location.lat === 'function' ? place.location.lat() : Number(place.location.lat ?? place.location.latitude);
        lng = typeof place.location.lng === 'function' ? place.location.lng() : Number(place.location.lng ?? place.location.longitude);
      }
      if (place.displayName) {
        name = typeof place.displayName === 'object' ? place.displayName.text || place.displayName : place.displayName;
      }
      if (place.formattedAddress) address = place.formattedAddress;
      if (Array.isArray(place.types)) types = place.types;

      if (place.viewport) {
        parseAndStoreViewport(placeId, place.viewport, typeof name === 'string' ? name : '', types);
      }
    } catch (err) {
      console.warn('Basic autocomplete place.fetchFields note:', err);
    }

    if (!lat || !lng) {
      await fetchPlaceDetailsAndAdd(placeId, typeof name === 'string' ? name : 'Preferred Place');
      return;
    }

    const targetCandidate = { id: placeId, placeId, lat, lng, name: typeof name === 'string' ? name : '' };
    let existingMatch = (landmarksListRef.current || []).find((l) => isSamePlace(l, targetCandidate));
    if (!existingMatch) {
      for (const [_, entry] of markersMapRef.current.entries()) {
        if (isSamePlace(entry.loc, targetCandidate)) {
          existingMatch = entry.loc;
          break;
        }
      }
    }

    if (existingMatch) {
      // Landmark ALREADY EXISTS on the map!
      // DO NOT add a duplicate marker! Simply select and fly to the existing place, changing its icon & marker style.
      setClickedPlaceId(existingMatch.placeId || existingMatch.id);
      setActiveLandmark(existingMatch);
      activeLandmarkRef.current = existingMatch;
      if (updateAllMarkerStylesRef.current) {
        updateAllMarkerStylesRef.current(existingMatch);
      }
      if (selectAndFlyToLandmarkRef.current) {
        selectAndFlyToLandmarkRef.current(existingMatch);
      }
      setShowPlaceInfo(true);
      return;
    }

    const cachedVp = viewportCache.get(placeId);
    const newItem: PreferredPlaceItem = {
      id: `pref-${placeId}`,
      placeId,
      name: (typeof name === 'string' && name.trim()) ? name : 'Preferred Place',
      cityName: selectedCity.name,
      cityId: selectedCityId,
      lat,
      lng,
      description: address || (typeof name === 'string' ? name : selectedCity.name),
      timestamp: Date.now(),
      types,
      camRange: cachedVp?.range,
      camTilt: cachedVp?.tilt,
    };

    saveAndActivatePreferredPlace(newItem);
  };

  // Detect mobile horizontal devices (smartphone in landscape orientation)
  const [isShortLandscape, setIsShortLandscape] = useState<boolean>(isMobileHorizontalDevice);

  useEffect(() => {
    const handleResize = () => {
      setIsShortLandscape(isMobileHorizontalDevice());
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const [userToggledDescription, setUserToggledDescription] = useState<boolean | null>(null);

  // Description is VISIBLE BY DEFAULT on desktop, laptop, tablet, and portrait mobile.
  // ONLY on mobile horizontal (smartphone landscape) is it folded by default.
  const isDescriptionVisible = userToggledDescription !== null
    ? userToggledDescription
    : !isShortLandscape;

  const togglePlaceDetails = () => {
    setShowMobilePlaceModal((prev) => !prev);
  };

  const toggleDescriptionFold = () => {
    setUserToggledDescription(!isDescriptionVisible);
  };

  // Camera tour speed control state: 1x, 1.5x, 2x
  const [tourSpeed, setTourSpeed] = useState<number>(1);
  const tourSpeedRef = useRef<number>(1);

  // Theme state: 'dark' | 'light' with localStorage persistence
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('app_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    }
    return 'dark';
  });

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      if (typeof window !== 'undefined') {
        localStorage.setItem('app_theme', next);
      }
      return next;
    });
  };

  // Auto-hide the initial landing guidance banner after 12 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowLandingBanner(false);
    }, 12000);
    return () => clearTimeout(timer);
  }, []);

  // Derive whether the user can manually move / orbit the 3D map (allowed whenever camera is not actively flying)
  const canUserControl = !isFlying;

  // On-map locked indicator state (shown when user clicks/touches the map while camera is moving)
  const [showLockedIndicator, setShowLockedIndicator] = useState<boolean>(false);
  const lockedIndicatorTimerRef = useRef<any>(null);

  const triggerLockedIndicator = () => {
    if (isFlying) {
      setShowLockedIndicator(true);
      if (lockedIndicatorTimerRef.current) {
        clearTimeout(lockedIndicatorTimerRef.current);
      }
      lockedIndicatorTimerRef.current = setTimeout(() => {
        setShowLockedIndicator(false);
      }, 1200);
    } else if (rotationModeRef.current !== 'none') {
      if (pauseCurrentRotationOnInteractionRef.current) {
        pauseCurrentRotationOnInteractionRef.current();
      }
    }
  };

  // Clicked POI from map interaction
  const [clickedPlaceId, setClickedPlaceId] = useState<string | null>(null);

  // Places UI Kit Explorer & Preferred List state (defaults to 'city' so places listing is immediately explored)
  const [placesModalTab, setPlacesModalTab] = useState<'preferred' | 'city'>('city');

  // Places UI Kit State mapping all landmark IDs and city IDs to verified Place IDs from Google
  const [placeIds, setPlaceIds] = useState<Record<string, string>>(() => {
    const dict: Record<string, string> = {};
    CITIES.forEach((c) => {
      dict[c.id] = c.placeId;
      c.landmarks.forEach((lm) => {
        if (lm.placeId) {
          dict[lm.id] = lm.placeId;
        }
      });
    });
    return dict;
  });

  const [flightStatus, setFlightStatus] = useState<string>("Ready");

  // Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapElementRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const markersMapRef = useRef<globalThis.Map<string, { marker: any; loc: Landmark; isSelected: boolean }>>(new globalThis.Map());
  const animationTimerRef = useRef<any>(null);
  const flightTimerRef = useRef<any>(null);
  const tourActiveRef = useRef<boolean>(false);
  const tourCurrentIndexRef = useRef<number>(0);
  const visitNextTourStepRef = useRef<((idx: number) => void) | null>(null);
  const selectAndFlyToLandmarkRef = useRef<((loc: Landmark) => void) | null>(null);
  const pauseGuidedTourRef = useRef<(() => void) | null>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Paused and panning trajectory tracking
  const [isTourPaused, setIsTourPaused] = useState<boolean>(false);
  const isTourPausedRef = useRef<boolean>(false);
  const panAnimFrameRef = useRef<number | null>(null);
  const updateAllMarkerStylesRef = useRef<((targetPlace: Landmark | null) => void) | null>(null);

  /**
   * Generates custom SVG pin string based on whether the marker is selected or default
   */
  const getMarkerSvgString = (loc: Landmark, isSelected: boolean): string => {
    const innerSvg = (loc.svgIcon || '')
      .replace(/^<svg[^>]*>/, '')
      .replace(/<\/svg>$/, '');

    const basePinColor = loc.pinColor || '#0284C7';

    if (isSelected) {
      // SELECTED / ACTIVE PLACE MARKER STYLE:
      // Clean Emerald Green marker pin (#10B981) with contrasting dark green core (#047857), crisp white border, white icon, and NO bottom shadow
      return `
<svg xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 30 38" fill="none">
  <!-- Emerald Green selected pin body (#10B981) with crisp white border (clean pin tip, zero bottom shadow) -->
  <path d="M15 1.5C8.8 1.5 3.8 6.5 3.8 12.8c0 9.2 11.2 22 11.2 22s11.2-12.8 11.2-22C26.2 6.5 21.2 1.5 15 1.5z" fill="#10B981" stroke="#FFFFFF" stroke-width="2.2" stroke-linejoin="round"/>
  <!-- Circular badge for category icon -->
  <circle cx="15" cy="12.8" r="7.2" fill="#047857" />
  <!-- Scaled Category / Selected Icon in white -->
  <g transform="translate(8, 5.8) scale(0.58)" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none">
    ${innerSvg || '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="#FFFFFF" stroke="#FFFFFF"/>'}
  </g>
</svg>
`.trim();
    }

    // DEFAULT / UNSELECTED MARKER STYLE:
    // Compact 24x30 physical marker pin
    return `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="30" viewBox="0 0 24 30" fill="none">
  <!-- Clean compact pin body -->
  <path d="M12 1.5C6.8 1.5 2.5 5.8 2.5 11c0 7.5 9.5 17.5 9.5 17.5s9.5-10 9.5-17.5C21.5 5.8 17.2 1.5 12 1.5z" fill="${basePinColor}" stroke="#FFFFFF" stroke-width="1.6" stroke-linejoin="round"/>
  
  <!-- Scaled Category Icon -->
  <g transform="translate(6, 5) scale(0.5)" stroke="#FFFFFF" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" fill="none">
    ${innerSvg}
  </g>
</svg>
`.trim();
  };

  /**
   * Applies or updates the SVG template on an existing Marker3D element in place
   */
  const applyMarkerTemplate = (marker: any, loc: Landmark, isSelected: boolean) => {
    try {
      const svgString = getMarkerSvgString(loc, isSelected);
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
      const svgElement = svgDoc.documentElement;

      const template = document.createElement('template');
      template.content.appendChild(svgElement);

      if (typeof marker.replaceChildren === 'function') {
        marker.replaceChildren(template);
      } else {
        marker.innerHTML = '';
        marker.appendChild(template);
      }

      try {
        const behavior = isSelected ? 'REQUIRED' : 'REQUIRED_AND_HIDES_OPTIONAL';
        marker.collisionBehavior = behavior;
        marker.drawsWhenOccluded = true;
        if (typeof marker.setAttribute === 'function') {
          marker.setAttribute('collision-behavior', behavior);
          marker.setAttribute('draws-when-occluded', 'true');
          marker.setAttribute('z-index', isSelected ? '99999' : '1');
        }
        marker.zIndex = isSelected ? 99999 : 1;
      } catch (e) { }

      try {
        marker.dispatchEvent(new Event('slotchange'));
      } catch (e) { }
    } catch (pinErr) {
      console.warn(`Could not update marker template for ${loc.name}`, pinErr);
    }
  };

  /**
   * Updates marker styles and icons across all active markers on the map
   */
  const updateAllMarkerStyles = (targetPlace: Landmark | null) => {
    markersMapRef.current.forEach((entry) => {
      const isSelected = targetPlace ? isSamePlace(entry.loc, targetPlace) : false;
      if (entry.isSelected !== isSelected) {
        entry.isSelected = isSelected;
        applyMarkerTemplate(entry.marker, entry.loc, isSelected);
      }
    });
  };
  updateAllMarkerStylesRef.current = updateAllMarkerStyles;

  /**
   * Reuses existing 3D markers without duplicating them, and updates styles & icons in-place
   */
  const mountLandmarkMarkers = (map: any, landmarks: Landmark[], explicitSelectedPlace?: Landmark | string | null) => {
    const googleMaps = (window as any).google?.maps;
    if (!googleMaps) return;

    const maps3d = (googleMaps as any).maps3d;
    const MarkerClass = maps3d?.Marker3DInteractiveElement || maps3d?.Marker3DElement;
    if (!MarkerClass) return;

    const targetPlace = explicitSelectedPlace !== undefined
      ? (typeof explicitSelectedPlace === 'string' ? { id: explicitSelectedPlace, placeId: explicitSelectedPlace, lat: 0, lng: 0 } : explicitSelectedPlace)
      : activeLandmarkRef.current;

    // Deduplicate landmarks array so no two entries represent the same place
    const dedupedLandmarks: Landmark[] = [];
    landmarks.forEach((loc) => {
      if (!loc) return;
      const alreadyIncluded = dedupedLandmarks.some((d) => isSamePlace(d, loc));
      if (!alreadyIncluded) {
        dedupedLandmarks.push(loc);
      }
    });

    const activeKeys = new Set<string>();

    dedupedLandmarks.forEach((loc) => {
      const locKey = loc.id || loc.placeId;
      if (!locKey) return;
      activeKeys.add(locKey);

      const isSelected = targetPlace ? isSamePlace(loc, targetPlace) : false;

      // Check if a marker ALREADY exists for this place on the map
      let existingEntry = markersMapRef.current.get(locKey);
      if (!existingEntry) {
        for (const [_, entry] of markersMapRef.current.entries()) {
          if (isSamePlace(entry.loc, loc)) {
            existingEntry = entry;
            break;
          }
        }
      }

      if (existingEntry && existingEntry.marker && existingEntry.marker.parentNode === map) {
        // MARKER ALREADY EXISTS! DONT ADD A NEW MARKER. Update its icon & style in-place!
        existingEntry.loc = { ...existingEntry.loc, ...loc };
        existingEntry.isSelected = isSelected;
        applyMarkerTemplate(existingEntry.marker, existingEntry.loc, isSelected);
        return;
      }

      // Marker does not exist yet on map: construct and attach it
      try {
        const markerAltitude = getLandmarkMarkerAltitude(loc);
        const altMode = loc.altitudeMode || (loc.id === 'ferry-building' ? 'RELATIVE_TO_GROUND' : 'RELATIVE_TO_MESH');
        const marker = new MarkerClass({
          position: { lat: Number(loc.lat), lng: Number(loc.lng), altitude: markerAltitude },
          altitudeMode: altMode,
          extruded: false,
          collisionBehavior: isSelected ? 'REQUIRED' : 'REQUIRED_AND_HIDES_OPTIONAL',
          drawsWhenOccluded: true,
        });

        try {
          marker.position = { lat: Number(loc.lat), lng: Number(loc.lng), altitude: markerAltitude };
          marker.altitudeMode = altMode;
          marker.setAttribute('altitude-mode', altMode);
          marker.extruded = false;
          marker.collisionBehavior = isSelected ? 'REQUIRED' : 'REQUIRED_AND_HIDES_OPTIONAL';
          marker.drawsWhenOccluded = true;
          marker.zIndex = isSelected ? 99999 : 1;
        } catch (e) { }

        applyMarkerTemplate(marker, loc, isSelected);

        // Add click behavior on markers: select existing place and update its style without adding duplicate markers
        marker.addEventListener('gmp-click', (e: any) => {
          try {
            if (e) {
              if (typeof e.stop === 'function') e.stop();
              if (typeof e.preventDefault === 'function') e.preventDefault();
            }
            if (tourActiveRef.current && pauseGuidedTourRef.current) {
              pauseGuidedTourRef.current();
            }
            const targetId = loc.placeId || placeIds[loc.id] || null;
            setClickedPlaceId(targetId);
            if (selectAndFlyToLandmarkRef.current) {
              selectAndFlyToLandmarkRef.current(loc);
            }
          } catch (err) { }
        });

        // Add pointer hover triggers for Places UI Kit Compact Card display
        marker.addEventListener('pointerover', () => {
          try {
            setHoveredLandmark(loc);
          } catch (e) { }
        });

        marker.addEventListener('pointerout', () => {
          try {
            setHoveredLandmark(null);
          } catch (e) { }
        });

        map.appendChild(marker);
        markersMapRef.current.set(locKey, { marker, loc, isSelected });
      } catch (markerErr) {
        console.error(`Failed to construct or append marker for ${loc.name}`, markerErr);
      }
    });

    // Clean up only markers that are truly no longer in the landmarks list
    markersMapRef.current.forEach((entry, key) => {
      const stillActive = dedupedLandmarks.some((l) => isSamePlace(l, entry.loc));
      if (!stillActive) {
        try {
          if (entry.marker && entry.marker.parentNode) {
            entry.marker.parentNode.removeChild(entry.marker);
          }
        } catch (e) {}
        markersMapRef.current.delete(key);
      }
    });

    markersRef.current = Array.from(markersMapRef.current.values()).map(e => e.marker);
  };

  /**
   * Switches the active city, updates landmarks, remounts markers, and smoothly flies camera to the new city overview
   */
  const handleSelectCity = (cityId: string) => {
    // 1. Invalidate any in-progress or queued flights, viewports fetches, or tour steps
    const currentFlightId = ++flightSeqRef.current;

    // 2. Immediately cancel active orbit animation frame & stop camera animation
    applyRotationMode('none');
    stopCameraOrbitOnly();
    if (rotateAnimFrameRef.current) {
      cancelAnimationFrame(rotateAnimFrameRef.current);
      rotateAnimFrameRef.current = null;
    }

    // 3. Stop active tour & clear all flight and animation timers
    if (tourActiveRef.current) {
      stopGuidedTour();
    }
    tourActiveRef.current = false;
    setIsTouring(false);

    if (flightTimerRef.current) {
      clearTimeout(flightTimerRef.current);
      flightTimerRef.current = null;
    }
    if (animationTimerRef.current) {
      clearTimeout(animationTimerRef.current);
      animationTimerRef.current = null;
    }
    if (panAnimFrameRef.current) {
      cancelAnimationFrame(panAnimFrameRef.current);
      panAnimFrameRef.current = null;
    }

    // Stop current camera animation in progress so the new flight triggers instantly
    if (mapElementRef.current && typeof mapElementRef.current.stopCameraAnimation === 'function') {
      try {
        mapElementRef.current.stopCameraAnimation();
      } catch (e) { }
    }

    const newCity = getCityConfig(cityId);
    selectedCityIdRef.current = cityId;
    setSelectedCityId(cityId);
    setPlacesListMode('city');
    placesListModeRef.current = 'city';
    setLandmarksList(newCity.landmarks);
    landmarksListRef.current = newCity.landmarks;

    setPlaceIds(prev => {
      const nextDict = { ...prev, [newCity.id]: newCity.placeId };
      newCity.landmarks.forEach(lm => {
        if (lm.placeId) {
          nextDict[lm.id] = lm.placeId;
        }
      });
      return nextDict;
    });

    activeLandmarkRef.current = null;
    setActiveLandmark(null);
    setHoveredLandmark(null);
    setClickedPlaceId(null);
    setShowLandingBanner(false);
    setHasInteractedWithTour(true);
    setShowPlaceInfo(false);
    setIsCityDropdownOpen(false);
    setFlightStatus(`Flying to ${newCity.name}...`);

    if (mapElementRef.current) {
      markersMapRef.current.forEach((entry) => {
        try {
          if (entry.marker && entry.marker.parentNode) {
            entry.marker.parentNode.removeChild(entry.marker);
          }
        } catch (e) { }
      });
      markersMapRef.current.clear();
      markersRef.current = [];
      mountLandmarkMarkers(mapElementRef.current, newCity.landmarks);

      const isMobileScreen = typeof window !== 'undefined' && window.innerWidth < 1024;
      const targetCam = isMobileScreen ? newCity.initialCamMobile : newCity.initialCam;

      setIsFlying(true);
      isFlyingRef.current = true;
      try {
        mapElementRef.current.flyCameraTo({
          endCamera: {
            center: targetCam.center,
            range: targetCam.range,
            tilt: targetCam.tilt,
            heading: targetCam.heading,
          },
          durationMillis: 2200,
        });

        if (flightTimerRef.current) clearTimeout(flightTimerRef.current);
        flightTimerRef.current = setTimeout(() => {
          if (flightSeqRef.current !== currentFlightId) return;
          setIsFlying(false);
          isFlyingRef.current = false;
          setFlightStatus(`3D ${newCity.name} Overview Ready`);

          // If rotation mode is actively enabled, smoothly orbit around the NEW city overview:
          if (isRotatingPoiRef.current && rotationModeRef.current !== 'none' && triggerPoiOrbitRef.current) {
            triggerPoiOrbitRef.current(null);
          }
        }, 2200);
      } catch (err) {
        console.warn("flyCameraTo city overview failed", err);
        setIsFlying(false);
        isFlyingRef.current = false;
      }
    }
  };

  // Sync landmarksList and 3D map markers based on placesListMode and preferredPlaces
  useEffect(() => {
    const cityLandmarks = getCityConfig(selectedCityId).landmarks;
    const prefLandmarks = preferredPlaces.map(preferredPlaceToLandmark);

    let activeList: Landmark[];
    if (placesListMode === 'preferred') {
      activeList = prefLandmarks.length > 0 ? prefLandmarks : cityLandmarks;
    } else if (placesListMode === 'combined') {
      activeList = [...cityLandmarks, ...prefLandmarks];
    } else {
      activeList = cityLandmarks;
    }

    setLandmarksList(activeList);
    landmarksListRef.current = activeList;
    if (mapElementRef.current) {
      mountLandmarkMarkers(mapElementRef.current, activeList);
    }
  }, [placesListMode, preferredPlaces, selectedCityId]);

  // Whenever active landmark changes, update marker icons and styles in place without adding new markers
  useEffect(() => {
    updateAllMarkerStyles(activeLandmark);
  }, [activeLandmark?.id, activeLandmark?.placeId, activeLandmark?.lat, activeLandmark?.lng, activeLandmark?.name]);

  // Pre-fetch Places API (New) viewports for landmarks in current city to calibrate 3D altitude & range dynamically
  useEffect(() => {
    if (!mapsLoaded) return;
    const city = getCityConfig(selectedCityId);
    if (city && city.landmarks) {
      city.landmarks.forEach((lm) => {
        if (lm.placeId) {
          fetchPlaceViewport(lm.placeId);
        }
      });
    }
  }, [selectedCityId, mapsLoaded]);

  // Pre-fetch Places API (New) viewports for user's preferred places
  useEffect(() => {
    if (!mapsLoaded) return;
    preferredPlaces.forEach((p) => {
      if (p.placeId) {
        fetchPlaceViewport(p.placeId);
      }
    });
  }, [preferredPlaces, mapsLoaded]);

  const switchToPlacesMode = (mode: 'city' | 'preferred' | 'combined') => {
    setPlacesListMode(mode);
    placesListModeRef.current = mode;
    const cityLandmarks = getCityConfig(selectedCityId).landmarks;
    const prefLandmarks = preferredPlaces.map(preferredPlaceToLandmark);

    let targetList: Landmark[];
    if (mode === 'preferred') {
      targetList = prefLandmarks.length > 0 ? prefLandmarks : cityLandmarks;
    } else if (mode === 'combined') {
      targetList = [...cityLandmarks, ...prefLandmarks];
    } else {
      targetList = cityLandmarks;
    }

    setLandmarksList(targetList);
    landmarksListRef.current = targetList;
    if (mapElementRef.current) {
      mountLandmarkMarkers(mapElementRef.current, targetList);
    }
  };

  // Auto-scroll list in Y so the active landmark and its embedded Places widget are entirely visible
  useEffect(() => {
    if (!activeLandmark) return;
    const scrollTarget = () => {
      const el = document.getElementById(`landmark-item-${activeLandmark.id}`);
      if (el && listContainerRef.current) {
        const container = listContainerRef.current;
        const elRect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        if (elRect.bottom > containerRect.bottom) {
          container.scrollTo({
            top: container.scrollTop + (elRect.bottom - containerRect.bottom) + 16,
            behavior: 'smooth',
          });
        } else if (elRect.top < containerRect.top) {
          container.scrollTo({
            top: container.scrollTop - (containerRect.top - elRect.top) - 12,
            behavior: 'smooth',
          });
        }
      }
    };

    // Scroll immediately, then after component DOM expansion and Places UI kit rendering
    scrollTarget();
    const timer1 = setTimeout(scrollTarget, 100);
    const timer2 = setTimeout(scrollTarget, 300);
    const timer3 = setTimeout(scrollTarget, 600);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [activeLandmark?.id, showPopovers, showFullPlaceDetails]);

  // Load Google Maps API 3D
  useEffect(() => {
    setFlightStatus("Initializing Google 3D Maps...");
    loadGoogleMapsScript(apiKey)
      .then(() => {
        setMapsLoaded(true);
        setFlightStatus("Engine Ready — Coordinates calibrated");
      })
      .catch((err) => {
        console.warn("Google Maps 3D loading note:", err);
        setMapsLoaded(true);
        setFlightStatus("Ready");
      });
  }, [apiKey]);

  // Initialize and mount Google Map 3D element
  useEffect(() => {
    if (!mapsLoaded || !mapContainerRef.current) return;

    let isCancelled = false;

    // Clear target container first
    mapContainerRef.current.innerHTML = '';
    markersRef.current = [];

    const initialize3DMap = async () => {
      try {
        const [maps3dLib, markerLib, placesLib, mapsLib] = await Promise.all([
          (window as any).google.maps.importLibrary('maps3d'),
          (window as any).google.maps.importLibrary('marker'),
          (window as any).google.maps.importLibrary('places'),
          (window as any).google.maps.importLibrary('maps'),
        ]);

        if (isCancelled) return;

        const { Map3DElement } = maps3dLib;
        setPlacesLoaded(true);

        const currentCity = getCityConfig(selectedCityId);
        setLandmarksList(currentCity.landmarks);

        // Helper for responsive camera overview framing all markers
        const isMobileScreen = typeof window !== 'undefined' && window.innerWidth < 1024;
        const initialCam = isMobileScreen ? currentCity.initialCamMobile : currentCity.initialCam;

        // Setup Map3DElement safely with constructor options, attribution, and disabling cooperative gesture handling
        const map = new Map3DElement({
          center: initialCam.center,
          range: initialCam.range,
          tilt: initialCam.tilt,
          heading: initialCam.heading,
          mapId: 'ccfdf8d031b6b83ca3b365e5',
          defaultUIHidden: true,
          gestureHandling: 'GREEDY',
          ...(SOLUTION_ATTRIBUTION_ID ? { internalUsageAttributionIds: [SOLUTION_ATTRIBUTION_ID] } : {}),
        });

        // Turn off cooperative gesture handling on the 3D map (greedy mode handles all gestures directly without requiring modifier keys or two fingers)
        try {
          (map as any).gestureHandling = 'GREEDY';
          map.setAttribute('gesture-handling', 'GREEDY');
        } catch (gestureErr) { }

        // Hide default native overlapping compass and navigation controls (since our custom control deck provides full tour, compass, speed, basemap, and theme controls)
        try {
          (map as any).defaultUIHidden = true;
          map.setAttribute('default-ui-hidden', '');
        } catch (uiErr) { }

        // Set map-id and internal-usage-attribution-ids defensively
        try {
          map.setAttribute('map-id', 'ccfdf8d031b6b83ca3b365e5');
          if (SOLUTION_ATTRIBUTION_ID) {
            (map as any).internalUsageAttributionIds = [SOLUTION_ATTRIBUTION_ID];
            map.setAttribute('internal-usage-attribution-ids', SOLUTION_ATTRIBUTION_ID);
          }
        } catch (idErr) { }

        // Set mode defensively on the element
        try {
          if (mapMode) {
            map.mode = mapMode;
            map.setAttribute('mode', mapMode);
          }
        } catch (modeErr) { }

        map.style.width = '100%';
        map.style.height = '100%';
        map.style.display = 'block';
        map.style.filter = mapMode === 'ROADMAP' ? 'none' : 'brightness(1.05) contrast(1.05)';
        mapElementRef.current = map;
        lastKnownHeadingRef.current = initialCam.heading || 0;
        mapContainerRef.current?.appendChild(map);

        // Track camera heading changes accurately from user panning or 3D animations
        const handleCameraHeadingSync = () => {
          try {
            const raw = mapElementRef.current?.heading;
            const h = typeof raw === 'function' ? raw() : raw;
            if (typeof h === 'number' && !isNaN(h)) {
              lastKnownHeadingRef.current = ((h % 360) + 360) % 360;
            }
          } catch (e) {}
        };
        map.addEventListener('camera-change', handleCameraHeadingSync, { passive: true });
        map.addEventListener('gmp-camerachange', handleCameraHeadingSync, { passive: true });
        map.addEventListener('camerachange', handleCameraHeadingSync, { passive: true });
        map.addEventListener('gmp-animationend', handleCameraHeadingSync, { passive: true });
        map.addEventListener('pointerup', handleCameraHeadingSync, { passive: true });
        map.addEventListener('touchend', handleCameraHeadingSync, { passive: true });

        // Add dynamic POI click listener on the Map3DElement to catch POI interactions and pause active tour
        const handleMapPoiClick = async (event: any) => {
          try {
            // Check if the clicked object has a placeId
            if (event && event.placeId) {
              const clickedPlaceId = event.placeId;
              console.log('Clicked Place ID:', clickedPlaceId);

              // Prevents the default Google info window from popping up
              if (typeof event.stop === 'function') event.stop();
              if (typeof event.preventDefault === 'function') event.preventDefault();

              // Pause Tour if user clicks on a point of interest on the map
              if (tourActiveRef.current || isTourPausedRef.current) {
                if (pauseGuidedTourRef.current) {
                  pauseGuidedTourRef.current();
                }
              }

              setClickedPlaceId(clickedPlaceId);
              setShowPopovers(true);
              setHasInteractedWithTour(true);
              setShowLandingBanner(false);

              // 1. Check if clicked place or coordinate matches an existing marker or landmark on the map
              let lat = Number(event.position?.lat ?? event.position?.latitude ?? 37.7749);
              let lng = Number(event.position?.lng ?? event.position?.longitude ?? -122.4194);
              if (event.position) {
                lat = Number(event.position.lat ?? event.position.latitude ?? lat);
                lng = Number(event.position.lng ?? event.position.longitude ?? lng);
              }

              const targetCandidate = { id: clickedPlaceId, placeId: clickedPlaceId, lat, lng };
              let foundLandmark = (landmarksListRef.current || []).find(l => isSamePlace(l, targetCandidate));
              if (!foundLandmark) {
                for (const [_, entry] of markersMapRef.current.entries()) {
                  if (isSamePlace(entry.loc, targetCandidate)) {
                    foundLandmark = entry.loc;
                    break;
                  }
                }
              }

              if (foundLandmark) {
                setActiveLandmark(foundLandmark);
                setShowPlaceInfo(true);
                if (updateAllMarkerStylesRef.current) {
                  updateAllMarkerStylesRef.current(foundLandmark);
                }
                if (selectAndFlyToLandmarkRef.current) {
                  selectAndFlyToLandmarkRef.current(foundLandmark);
                }
                return;
              }

              // 2. If it's a new Roadmap / Basemap POI icon not yet on the map
              let placeName = 'Selected Place';
              let placeDesc = 'Point of Interest';
              let placeCategory = 'Point of Interest';

              // Create dynamic Landmark representation for this Roadmap POI
              const dynamicLandmark: Landmark = {
                id: `poi-${clickedPlaceId}`,
                name: placeName,
                placeId: clickedPlaceId,
                lat,
                lng,
                altitude: 15,
                heading: mapElementRef.current?.heading || 0,
                tilt: 55,
                camAltitude: 200,
                camRange: 600,
                camTilt: 55,
                camHeading: mapElementRef.current?.heading || 0,
                category: placeCategory,
                description: placeDesc,
                highlights: [],
                iconName: 'poi',
                pinColor: '#06b6d4',
                glyph: '📍',
                svgIcon: '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>'
              };

              setActiveLandmark(dynamicLandmark);
              setShowMobilePlaceModal(true);
              setFlightStatus(`Viewing ${placeName}`);

              // Fly camera smoothly to the clicked Roadmap POI location
              if (mapElementRef.current && lat && lng) {
                try {
                  const currentHeading = mapElementRef.current.heading || 0;
                  mapElementRef.current.flyCameraTo({
                    endCamera: {
                      center: { lat: Number(lat), lng: Number(lng), altitude: 25 },
                      range: 650,
                      tilt: 55,
                      heading: currentHeading
                    },
                    durationMillis: 1600
                  });
                } catch (flyErr) {
                  console.warn("Could not fly to clicked POI:", flyErr);
                }
              }
            }
          } catch (clickErr) {
            console.error("Error processing map click:", clickErr);
          }
        };

        map.addEventListener('gmp-click', handleMapPoiClick);
        map.addEventListener('click', handleMapPoiClick);

        const handleUserMapPointerDown = () => {
          if (pauseCurrentRotationOnInteractionRef.current) {
            pauseCurrentRotationOnInteractionRef.current();
          }
        };
        map.addEventListener('pointerdown', handleUserMapPointerDown, { passive: true });
        map.addEventListener('touchstart', handleUserMapPointerDown, { passive: true });
        map.addEventListener('wheel', handleUserMapPointerDown, { passive: true });

        // Mount 3D Markers for the active city with custom SVG pin icons
        mountLandmarkMarkers(map, currentCity.landmarks);

        // Keep initial view as the overview showing all landmarks; tour waits for user interaction on intro overlay
        setFlightStatus(`3D ${currentCity.name} Overview Ready`);

      } catch (e) {
        console.error("3D map bootstrap failed:", e);
        setLoadError("Failed to initialize Google Maps 3D Platform. Verify your API key has Map3D and Places enabled.");
        setFlightStatus("Initialization Failed");
      }
    };

    initialize3DMap();

    return () => {
      isCancelled = true;
      if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
      if (panAnimFrameRef.current) cancelAnimationFrame(panAnimFrameRef.current);
    };
  }, [mapsLoaded]);

  // Update map style mode and visual CSS filter dynamically
  useEffect(() => {
    if (mapElementRef.current) {
      try {
        mapElementRef.current.mode = mapMode;
      } catch (e) { }
      try {
        mapElementRef.current.setAttribute('mode', mapMode);
      } catch (e) { }
      try {
        mapElementRef.current.style.filter = mapMode === 'ROADMAP' ? 'none' : 'brightness(1.05) contrast(1.05)';
      } catch (e) { }
    }
  }, [mapMode]);

  const handleMapModeChange = (mode: 'HYBRID' | 'SATELLITE' | 'ROADMAP') => {
    setMapMode(mode);
    if (mapElementRef.current) {
      try {
        mapElementRef.current.mode = mode;
      } catch (e) { }
      try {
        mapElementRef.current.setAttribute('mode', mode);
      } catch (e) { }
      try {
        mapElementRef.current.style.filter = mode === 'ROADMAP' ? 'none' : 'brightness(1.05) contrast(1.05)';
      } catch (e) { }
    }
  };

  const cycleMapMode = () => {
    const modes: Array<'HYBRID' | 'SATELLITE' | 'ROADMAP'> = ['HYBRID', 'SATELLITE', 'ROADMAP'];
    const currentIndex = modes.indexOf(mapMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    handleMapModeChange(nextMode);
  };

  // Derived active place ID for the current location with guaranteed string safety
  const rawTargetPlaceId = clickedPlaceId || (activeLandmark ? (activeLandmark.placeId || placeIds[activeLandmark.id]) : (landmarksList[0]?.placeId || selectedCity?.placeId)) || selectedCity?.placeId || 'ChIJIQBpAG2ahYAR_6128GcTUEo';
  const currentTargetPlaceId: string = (typeof rawTargetPlaceId === 'string' && rawTargetPlaceId.trim() !== '') ? rawTargetPlaceId.trim() : 'ChIJIQBpAG2ahYAR_6128GcTUEo';
  const formattedPlaceResource: string = currentTargetPlaceId.startsWith('places/') ? currentTargetPlaceId : `places/${currentTargetPlaceId}`;

  // Check if current place is in preferred list
  const isCurrentPlacePreferred = preferredPlaces.some(
    (p) =>
      p.placeId === currentTargetPlaceId ||
      (activeLandmark && (p.id === activeLandmark.id || p.placeId === activeLandmark.placeId))
  );

  const lastToggleTimeRef = useRef<number>(0);
  const togglePreferredCurrentPlace = () => {
    const now = Date.now();
    if (now - lastToggleTimeRef.current < 250) {
      return;
    }
    lastToggleTimeRef.current = now;
    const currentCity = getCityConfig(selectedCityId);
    const placeIdToSave = currentTargetPlaceId;
    const landmarkName = activeLandmark ? activeLandmark.name : currentCity.name;
    const landmarkId = activeLandmark ? activeLandmark.id : `city-${currentCity.id}`;
    const lat = activeLandmark ? activeLandmark.lat : currentCity.initialCam.center.lat;
    const lng = activeLandmark ? activeLandmark.lng : currentCity.initialCam.center.lng;
    const description = activeLandmark?.description || currentCity.tagline;

    setPreferredPlaces((prev) => {
      const exists = prev.some(
        (p) => p.placeId === placeIdToSave || p.id === landmarkId
      );
      let updated: PreferredPlaceItem[];
      const cityLms = getCityConfig(selectedCityId).landmarks;
      if (exists) {
        updated = prev.filter(
          (p) => p.placeId !== placeIdToSave && p.id !== landmarkId
        );
        if (updated.length === 0) {
          setPlacesListMode('city');
          placesListModeRef.current = 'city';
          setLandmarksList(cityLms);
          landmarksListRef.current = cityLms;
          if (mapElementRef.current) {
            mountLandmarkMarkers(mapElementRef.current, cityLms);
          }
        } else {
          const prefLms = updated.map(preferredPlaceToLandmark);
          const targetList = placesListModeRef.current === 'combined'
            ? [...cityLms, ...prefLms]
            : placesListModeRef.current === 'preferred'
              ? prefLms
              : cityLms;
          setLandmarksList(targetList);
          landmarksListRef.current = targetList;
          if (mapElementRef.current) {
            mountLandmarkMarkers(mapElementRef.current, targetList);
          }
        }
      } else {
        const item: PreferredPlaceItem = {
          id: landmarkId,
          placeId: placeIdToSave,
          name: landmarkName,
          cityName: currentCity.name,
          cityId: currentCity.id,
          lat,
          lng,
          description,
          timestamp: Date.now(),
        };
        updated = [...prev, item];
        const nextMode = placesListModeRef.current === 'preferred' ? 'preferred' : 'combined';
        setPlacesListMode(nextMode);
        placesListModeRef.current = nextMode;
        const prefLms = updated.map(preferredPlaceToLandmark);
        const targetList = nextMode === 'preferred' ? prefLms : [...cityLms, ...prefLms];
        setLandmarksList(targetList);
        landmarksListRef.current = targetList;
        if (mapElementRef.current) {
          mountLandmarkMarkers(mapElementRef.current, targetList);
        }
      }
      preferredPlacesRef.current = updated;
      return updated;
    });
  };

  const removePreferredPlace = (id: string, placeId: string) => {
    setPreferredPlaces((prev) => {
      const updated = prev.filter((p) => p.id !== id && p.placeId !== placeId);
      preferredPlacesRef.current = updated;
      const cityLms = getCityConfig(selectedCityId).landmarks;
      if (updated.length === 0) {
        setPlacesListMode('city');
        placesListModeRef.current = 'city';
        setLandmarksList(cityLms);
        landmarksListRef.current = cityLms;
        if (mapElementRef.current) {
          mountLandmarkMarkers(mapElementRef.current, cityLms);
        }
      } else {
        const prefLms = updated.map(preferredPlaceToLandmark);
        const targetList = placesListModeRef.current === 'combined'
          ? [...cityLms, ...prefLms]
          : placesListModeRef.current === 'preferred'
            ? prefLms
            : cityLms;
        setLandmarksList(targetList);
        landmarksListRef.current = targetList;
        if (mapElementRef.current) {
          mountLandmarkMarkers(mapElementRef.current, targetList);
        }
      }
      return updated;
    });
  };

  const clearPreferredPlaces = () => {
    setPreferredPlaces([]);
    preferredPlacesRef.current = [];
    setPlacesListMode('city');
    placesListModeRef.current = 'city';
    const cityLms = getCityConfig(selectedCityId).landmarks;
    setLandmarksList(cityLms);
    landmarksListRef.current = cityLms;
    if (mapElementRef.current) {
      mountLandmarkMarkers(mapElementRef.current, cityLms);
    }
  };

  // Event listener hook and shadow DOM cleanup for Advanced Places UI Kit compact card
  useEffect(() => {
    const container = advancedPlaceDetailsRef.current;
    if (!container) return;

    try {
      container.setAttribute('orientation', 'HORIZONTAL');
      container.setAttribute('truncation-preferred', '');
    } catch (e) { }

    // Strip and hide any directions or open-in-maps buttons inside the shadow root
    const purgeDirectionsButton = () => {
      try {
        if (container.shadowRoot) {
          if (!container.shadowRoot.querySelector('style[data-hide-directions]')) {
            const style = document.createElement('style');
            style.setAttribute('data-hide-directions', 'true');
            style.textContent = `
              .open-in-maps-button,
              gmp-place-link,
              a[href*="google.com/maps"],
              a[href*="maps.google"] {
                display: none !important;
                visibility: hidden !important;
                pointer-events: none !important;
                opacity: 0 !important;
                width: 0 !important;
                height: 0 !important;
              }
            `;
            container.shadowRoot.appendChild(style);
          }

          const buttons = container.shadowRoot.querySelectorAll(
            '.open-in-maps-button, gmp-place-link, a[href*="maps"]'
          );
          buttons.forEach((el: any) => {
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
            el.style.setProperty('pointer-events', 'none', 'important');
          });
        }
      } catch {}
    };

    purgeDirectionsButton();

    let observer: MutationObserver | null = null;
    if (container.shadowRoot) {
      observer = new MutationObserver(() => {
        purgeDirectionsButton();
      });
      observer.observe(container.shadowRoot, { childList: true, subtree: true });
    }

    return () => {
      if (observer) observer.disconnect();
    };
  }, [
    currentTargetPlaceId,
    showMobilePlaceModal,
    isCurrentPlacePreferred,
  ]);

  const handlePlaceSelect = (selectedPlace: any) => {
    if (!selectedPlace) return;

    const rawId = selectedPlace.id ? selectedPlace.id.replace(/^places\//, '') : '';
    let lat: number | undefined;
    let lng: number | undefined;
    if (selectedPlace.location) {
      lat = typeof selectedPlace.location.lat === 'function' ? selectedPlace.location.lat() : selectedPlace.location.lat;
      lng = typeof selectedPlace.location.lng === 'function' ? selectedPlace.location.lng() : selectedPlace.location.lng;
    }
    const targetCandidate = { id: rawId, placeId: rawId, lat, lng, name: selectedPlace.displayName || selectedPlace.name };

    let matched = (landmarksListRef.current || []).find((l) => isSamePlace(l, targetCandidate));
    if (!matched) {
      for (const [_, entry] of markersMapRef.current.entries()) {
        if (isSamePlace(entry.loc, targetCandidate)) {
          matched = entry.loc;
          break;
        }
      }
    }

    if (matched && selectAndFlyToLandmarkRef.current) {
      selectAndFlyToLandmarkRef.current(matched);
      setShowPreferredListModal(false);
      setShowPlaceInfo(true);
    } else if (rawId) {
      setClickedPlaceId(rawId);
      if (lat !== undefined && lng !== undefined && mapElementRef.current) {
        mapElementRef.current.flyCameraTo({
          endCamera: {
            center: { lat: Number(lat), lng: Number(lng), altitude: 25 },
            range: 600,
            tilt: 55,
            heading: mapElementRef.current.heading || 0,
          },
          durationMillis: 2200,
        });
      }
      setShowPreferredListModal(false);
      setShowPlaceInfo(true);
    }
  };

  const handleToggleForceNorth = () => {
    if (isRotatingPoiRef.current) {
      stopRotatingPoi();
    }
    const nextForceNorth = !forceNorth;
    setForceNorth(nextForceNorth);
    forceNorthRef.current = nextForceNorth;

    if (!mapElementRef.current) return;

    // Case 1: Guided Tour is currently active
    if (tourActiveRef.current) {
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
      }
      if (flightTimerRef.current) {
        clearTimeout(flightTimerRef.current);
      }

      const currentIdx = tourCurrentIndexRef.current;
      const targetLandmark = landmarksList[currentIdx] || activeLandmark || landmarksList[0];

      // Calculate distance from the current camera place to target landmark
      let dist = 1.5;
      if (mapElementRef.current.center) {
        dist = getHaversineDistance(
          mapElementRef.current.center.lat,
          mapElementRef.current.center.lng,
          targetLandmark.lat,
          targetLandmark.lng
        );
      }

      // Re-animate camera from current place to landmark with newly selected heading
      runAutofitsCameraAnimation(targetLandmark, null, dist);

      const rawFlightMs = Math.min(5500, Math.max(3400, Math.round(dist * 500 + 3000)));
      const flightDurationMs = Math.max(1400, Math.round(rawFlightMs / (tourSpeedRef.current || 1)));
      const dwellMs = Math.max(1200, Math.round(4500 / (tourSpeedRef.current || 1)));
      const totalWaitMs = flightDurationMs + dwellMs;

      // Continue tour loop seamlessly after completing flight + dwell at this landmark
      animationTimerRef.current = setTimeout(() => {
        if (!tourActiveRef.current) return;
        if (visitNextTourStepRef.current) {
          visitNextTourStepRef.current(currentIdx + 1);
        } else {
          startGuidedTour(currentIdx + 1);
        }
      }, totalWaitMs);
      return;
    }

    // Case 2: Tour is not active, but a landmark is selected
    if (activeLandmark) {
      let dist = 1.0;
      if (mapElementRef.current.center) {
        dist = getHaversineDistance(
          mapElementRef.current.center.lat,
          mapElementRef.current.center.lng,
          activeLandmark.lat,
          activeLandmark.lng
        );
      }
      runAutofitsCameraAnimation(activeLandmark, null, dist);
      return;
    }

    // Case 3: Overview mode - smoothly adjust heading of current view
    try {
      const curCenter = mapElementRef.current.center || {
        lat: 37.773,
        lng: -122.442,
        altitude: 0
      };
      const curRange = mapElementRef.current.range || 22000;
      const curTilt = mapElementRef.current.tilt || 32;
      const targetHeading = nextForceNorth ? 0 : 0;
      setIsFlying(true);
      mapElementRef.current.flyCameraTo({
        endCamera: {
          center: curCenter,
          range: curRange,
          tilt: curTilt,
          heading: targetHeading,
        },
        durationMillis: 1000
      });
      if (flightTimerRef.current) clearTimeout(flightTimerRef.current);
      flightTimerRef.current = setTimeout(() => {
        setIsFlying(false);
      }, 1000);
    } catch (e) {
      try {
        mapElementRef.current.heading = nextForceNorth ? 0 : 0;
      } catch (err) { }
      setIsFlying(false);
    }
  };

  // Implement the core AutofitsCameraAnimation-style cinematic camera fitting
  const runAutofitsCameraAnimation = async (
    targetLandmark: Landmark,
    sourceLandmark: Landmark | null = null,
    explicitCustomDist: number | null = null
  ) => {
    // Validate that the target landmark belongs to the currently active city/list
    const curList = landmarksListRef.current || [];
    const isValidLandmark = curList.length === 0 || curList.some(
      (l) => l.id === targetLandmark.id || (targetLandmark.placeId && l.placeId === targetLandmark.placeId)
    );
    if (!isValidLandmark) {
      return;
    }

    const currentFlightId = ++flightSeqRef.current;
    activeLandmarkRef.current = targetLandmark;

    // Cancel any active custom panning or flight timers
    if (panAnimFrameRef.current) {
      cancelAnimationFrame(panAnimFrameRef.current);
      panAnimFrameRef.current = null;
    }
    if (flightTimerRef.current) {
      clearTimeout(flightTimerRef.current);
      flightTimerRef.current = null;
    }

    if (!mapElementRef.current || typeof mapElementRef.current.flyCameraTo !== 'function') {
      setIsFlying(false);
      isFlyingRef.current = false;
      setFlightStatus(`Viewing ${targetLandmark.name}`);
      return;
    }

    // Stop any in-progress camera flight immediately so the new flight starts without delay
    try {
      if (typeof mapElementRef.current.stopCameraAnimation === 'function') {
        mapElementRef.current.stopCameraAnimation();
      }
    } catch (e) { }

    // Distance calculation for smooth cinematic timing (3.6s - 5.5s, doubled duration)
    let distance = 2.5;
    if (explicitCustomDist !== null) {
      distance = explicitCustomDist;
    } else if (sourceLandmark) {
      distance = getHaversineDistance(
        sourceLandmark.lat,
        sourceLandmark.lng,
        targetLandmark.lat,
        targetLandmark.lng
      );
    } else if (mapElementRef.current && mapElementRef.current.center) {
      distance = getHaversineDistance(
        mapElementRef.current.center.lat,
        mapElementRef.current.center.lng,
        targetLandmark.lat,
        targetLandmark.lng
      );
    }

    const rawDurationMs = Math.min(5500, Math.max(3400, Math.round(distance * 500 + 3000)));
    const totalDurationMs = Math.max(1400, Math.round(rawDurationMs / (tourSpeedRef.current || 1)));
    const targetPlaceId = targetLandmark.placeId;
    const cleanPlaceId = targetPlaceId ? targetPlaceId.replace(/^places\//, '') : null;
    let cachedVp = cleanPlaceId ? viewportCache.get(cleanPlaceId) : null;
    if (cleanPlaceId && !cachedVp) {
      try {
        cachedVp = await fetchPlaceViewport(cleanPlaceId);
      } catch (err) {}
    }

    // If city changed or another flight started while fetching viewport, abort immediately!
    if (currentFlightId !== flightSeqRef.current) {
      return;
    }

    const isMobileScreen = typeof window !== 'undefined' && window.innerWidth < 1024;
    const params = calculateCameraParameters(
      targetLandmark,
      cameraViewModeRef.current,
      altitudeModeRef.current,
      customAltitudeOffsetRef.current,
      customRangeMultiplierRef.current,
      isMobileScreen,
      cachedVp
    );
    const targetTilt = customTiltOverrideRef.current !== null ? customTiltOverrideRef.current : params.tilt;
    const targetHeading = forceNorthRef.current ? 0 : params.heading;
    lastKnownHeadingRef.current = targetHeading;

    if (stopCameraOrbitOnlyRef.current) {
      stopCameraOrbitOnlyRef.current();
    }
    setIsFlying(true);
    isFlyingRef.current = true;
    setFlightStatus(`Flying to ${targetLandmark.name}...`);

    try {
      if (cameraViewModeRef.current === 'cameraPosition') {
        mapElementRef.current.cameraPosition = params.cameraPosition;
        mapElementRef.current.tilt = targetTilt;
        mapElementRef.current.heading = targetHeading;

        flightTimerRef.current = setTimeout(() => {
          if (currentFlightId !== flightSeqRef.current) return;
          setIsFlying(false);
          isFlyingRef.current = false;
          setFlightStatus(`Viewing ${targetLandmark.name} (POV)`);
        }, 1200);
      } else {
        mapElementRef.current.flyCameraTo({
          endCamera: {
            center: params.center,
            range: params.range,
            tilt: targetTilt,
            heading: targetHeading,
            altitudeMode: params.altMode,
          },
          durationMillis: totalDurationMs,
        });

        flightTimerRef.current = setTimeout(() => {
          if (currentFlightId !== flightSeqRef.current) return;
          setIsFlying(false);
          isFlyingRef.current = false;
          setFlightStatus(`Viewing ${targetLandmark.name}`);

          // Only rotate when the next location of the Tour is fixed:
          if (isRotatingPoiRef.current && triggerPoiOrbitRef.current) {
            triggerPoiOrbitRef.current(targetLandmark);
          }
        }, totalDurationMs);
      }
    } catch (flyErr) {
      console.error("Error flying camera:", flyErr);
      if (currentFlightId !== flightSeqRef.current) return;
      setIsFlying(false);
      isFlyingRef.current = false;
      setFlightStatus(`Viewing ${targetLandmark.name}`);
      if (isRotatingPoiRef.current && triggerPoiOrbitRef.current) {
        triggerPoiOrbitRef.current(targetLandmark);
      }
    }
  };

  const applyCameraSettingsLive = (
    mode: 'center' | 'cameraPosition',
    altMode: 'RELATIVE_TO_MESH' | 'CLAMP_TO_GROUND' | 'ABSOLUTE',
    altOffset: number | null,
    rangeMult: number,
    tiltOverride: number | null = null
  ) => {
    if (!mapElementRef.current) return;
    const currentTarget = activeLandmark || landmarksList[0] || {
      lat: selectedCity.initialCam.center.lat,
      lng: selectedCity.initialCam.center.lng,
      altitude: 0,
      name: selectedCity.name,
    };

    const targetPlaceId = (currentTarget as any).placeId;
    const cleanPlaceId = targetPlaceId ? targetPlaceId.replace(/^places\//, '') : null;
    const cachedVp = cleanPlaceId ? viewportCache.get(cleanPlaceId) : null;

    const isMobileScreen = typeof window !== 'undefined' && window.innerWidth < 1024;
    const params = calculateCameraParameters(
      currentTarget,
      mode,
      altMode,
      altOffset,
      rangeMult,
      isMobileScreen,
      cachedVp
    );

    stopCameraOrbitOnly();

    try {
      const finalTilt = tiltOverride !== null ? tiltOverride : params.tilt;
      const targetHeading = forceNorthRef.current ? 0 : params.heading;

      if (mode === 'cameraPosition') {
        mapElementRef.current.cameraPosition = params.cameraPosition;
        mapElementRef.current.tilt = finalTilt;
        if (targetHeading !== undefined) {
          mapElementRef.current.heading = targetHeading;
        }
        setFlightStatus(`Camera Position Mode (${params.altitudeOffset}m above mesh)`);
      } else {
        mapElementRef.current.center = params.center;
        mapElementRef.current.tilt = finalTilt;
        mapElementRef.current.range = params.range;
        if (targetHeading !== undefined) {
          mapElementRef.current.heading = targetHeading;
        }
        setFlightStatus(`Center Mode (${params.range}m range, ${params.altitudeOffset}m mesh offset)`);
      }
    } catch (e) {
      console.warn('Live camera adjustment notice:', e);
    }
  };

  const toggleCameraViewMode = () => {
    const nextMode = cameraViewMode === 'center' ? 'cameraPosition' : 'center';
    setCameraViewMode(nextMode);
    cameraViewModeRef.current = nextMode;
    applyCameraSettingsLive(nextMode, altitudeMode, customAltitudeOffset, customRangeMultiplier, customTiltOverride);
  };

  // Immediate speed adjustment: cycles 1x -> 1.5x -> 2x and immediately speeds up active flight / animation
  const cycleTourSpeed = () => {
    const speeds = [1, 1.5, 2];
    const currentIdx = speeds.indexOf(tourSpeedRef.current);
    const nextSpeed = speeds[(currentIdx + 1) % speeds.length];
    setTourSpeed(nextSpeed);
    tourSpeedRef.current = nextSpeed;

    if (!mapElementRef.current) return;

    // Case 1: If Guided Tour is currently active, immediately speed up flight to current destination
    if (tourActiveRef.current) {
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
      }
      if (flightTimerRef.current) {
        clearTimeout(flightTimerRef.current);
      }

      const currentIdx = tourCurrentIndexRef.current;
      const targetLandmark = landmarksList[currentIdx] || activeLandmark || landmarksList[0];

      // Calculate distance from current camera place to target landmark
      let dist = 1.5;
      if (mapElementRef.current.center) {
        dist = getHaversineDistance(
          mapElementRef.current.center.lat,
          mapElementRef.current.center.lng,
          targetLandmark.lat,
          targetLandmark.lng
        );
      }

      // Re-animate immediately with the new speed factor
      runAutofitsCameraAnimation(targetLandmark, null, dist);

      const rawFlightMs = Math.min(5500, Math.max(3400, Math.round(dist * 500 + 3000)));
      const flightDurationMs = Math.max(1400, Math.round(rawFlightMs / nextSpeed));
      const dwellMs = Math.max(1200, Math.round(4500 / nextSpeed));
      const totalWaitMs = flightDurationMs + dwellMs;

      animationTimerRef.current = setTimeout(() => {
        if (!tourActiveRef.current) return;
        if (visitNextTourStepRef.current) {
          visitNextTourStepRef.current(currentIdx + 1);
        } else {
          startGuidedTour(currentIdx + 1);
        }
      }, totalWaitMs);
      return;
    }

    // Case 2: If single landmark is in mid-flight, immediately accelerate to target
    if (activeLandmark && isFlying) {
      let dist = 1.0;
      if (mapElementRef.current.center) {
        dist = getHaversineDistance(
          mapElementRef.current.center.lat,
          mapElementRef.current.center.lng,
          activeLandmark.lat,
          activeLandmark.lng
        );
      }
      runAutofitsCameraAnimation(activeLandmark, null, dist);
    }

    // Case 3: If rotating around POI is active and camera is fixed, update orbit speed seamlessly
    if (isRotatingPoiRef.current && !isFlyingRef.current) {
      triggerPoiOrbit(activeLandmark);
    }
  };

  // Pause and Resume helpers for guided tour
  const pauseGuidedTour = () => {
    tourActiveRef.current = false;
    setIsTourPaused(true);
    isTourPausedRef.current = true;
    setIsFlying(false);
    if (animationTimerRef.current) {
      clearTimeout(animationTimerRef.current);
    }
    if (flightTimerRef.current) {
      clearTimeout(flightTimerRef.current);
    }
    setFlightStatus("Tour paused");
  };
  pauseGuidedTourRef.current = pauseGuidedTour;

  const resumeGuidedTour = () => {
    if (!isTourPausedRef.current) return;
    setIsTourPaused(false);
    isTourPausedRef.current = false;
    const currentIndex = activeLandmark ? landmarksList.findIndex(l => l.id === activeLandmark.id) : 0;
    const resumeIndex = currentIndex >= 0 ? currentIndex : 0;
    startGuidedTour(resumeIndex);
  };

  // Flying to standard landmarks
  const selectAndFlyToLandmark = (landmark: Landmark) => {
    setHasInteractedWithTour(true);
    setShowPlaceInfo(true);
    const parentSource = activeLandmarkRef.current;
    activeLandmarkRef.current = landmark;
    setActiveLandmark(landmark);
    setClickedPlaceId(landmark.placeId || placeIds[landmark.id] || null);

    // Update marker icon and style in-place for the selected place without adding any new markers!
    updateAllMarkerStyles(landmark);

    if (tourActiveRef.current) {
      const idx = landmarksList.findIndex(l => isSamePlace(l, landmark));
      if (idx !== -1) {
        startGuidedTour(idx);
        return;
      }
    }
    if (isTourPausedRef.current) {
      setIsTourPaused(false);
      isTourPausedRef.current = false;
      setIsTouring(false);
    }
    runAutofitsCameraAnimation(landmark, parentSource);
  };
  selectAndFlyToLandmarkRef.current = selectAndFlyToLandmark;

  // Autonomous Guided Tour controller
  const startGuidedTour = (startIndex: number = 0, explicitList?: Landmark[]) => {
    setHasInteractedWithTour(true);
    tourActiveRef.current = false;
    if (animationTimerRef.current) {
      clearTimeout(animationTimerRef.current);
    }
    if (flightTimerRef.current) {
      clearTimeout(flightTimerRef.current);
    }

    const currentPreferred = preferredPlacesRef.current;
    const cityLms = getCityConfig(selectedCityIdRef.current).landmarks;
    const prefLms = currentPreferred.map(preferredPlaceToLandmark);

    let tourList: Landmark[];
    if (explicitList && explicitList.length > 0) {
      tourList = explicitList;
    } else if (placesListModeRef.current === 'preferred' && prefLms.length > 0) {
      tourList = prefLms;
    } else if (placesListModeRef.current === 'combined' && prefLms.length > 0) {
      tourList = [...cityLms, ...prefLms];
    } else {
      tourList = landmarksListRef.current && landmarksListRef.current.length > 0
        ? landmarksListRef.current
        : cityLms;
    }

    if (!tourList || tourList.length === 0) {
      return;
    }

    tourActiveRef.current = true;
    setIsTouring(true);
    setTourIndex(startIndex);

    const visitNext = (idx: number) => {
      if (!tourActiveRef.current) {
        return;
      }

      if (stopCameraOrbitOnlyRef.current) {
        stopCameraOrbitOnlyRef.current();
      }

      const wrappedIndex = idx % tourList.length;
      tourCurrentIndexRef.current = wrappedIndex;
      const nextLandmark = tourList[wrappedIndex];

      setTourIndex(wrappedIndex);
      activeLandmarkRef.current = nextLandmark;
      setActiveLandmark(nextLandmark);
      setClickedPlaceId(nextLandmark.placeId || placeIds[nextLandmark.id] || null);

      const previousIndex = wrappedIndex > 0 ? wrappedIndex - 1 : tourList.length - 1;
      const previous = tourList[previousIndex];
      const dist = getHaversineDistance(previous.lat, previous.lng, nextLandmark.lat, nextLandmark.lng);

      try {
        runAutofitsCameraAnimation(nextLandmark, previous);
      } catch (err) {
        console.error("Fly error during guided tour:", err);
      }

      const baseFlightMs = Math.min(5500, Math.max(3400, Math.round(dist * 500 + 3000)));
      const flightDurationMs = Math.max(1400, Math.round(baseFlightMs / (tourSpeedRef.current || 1)));
      const dwellMs = isRotatingPoiRef.current
        ? Math.max(4000, Math.round(8500 / (tourSpeedRef.current || 1)))
        : Math.max(1200, Math.round(4500 / (tourSpeedRef.current || 1)));
      const totalWaitMs = flightDurationMs + dwellMs;

      const tourStepFlightId = flightSeqRef.current;
      animationTimerRef.current = setTimeout(() => {
        if (!tourActiveRef.current || tourStepFlightId !== flightSeqRef.current) return;
        visitNext(idx + 1);
      }, totalWaitMs);
    };

    visitNextTourStepRef.current = visitNext;
    visitNext(startIndex);
  };

  const stopGuidedTour = () => {
    tourActiveRef.current = false;
    setIsTouring(false);
    setIsFlying(false);
    isFlyingRef.current = false;
    setIsTourPaused(false);
    isTourPausedRef.current = false;
    if (animationTimerRef.current) {
      clearTimeout(animationTimerRef.current);
    }
    if (flightTimerRef.current) {
      clearTimeout(flightTimerRef.current);
    }
    if (!isRotatingPoiRef.current) {
      if (mapElementRef.current && typeof mapElementRef.current.stopCameraAnimation === 'function') {
        try {
          mapElementRef.current.stopCameraAnimation();
        } catch (err) { }
      }
    }
    setFlightStatus("Ready");
  };

  const startPreferredTour = (startIndex: number = 0) => {
    const currentPreferred = preferredPlacesRef.current;
    if (currentPreferred.length === 0) {
      setShowPreferredListModal(true);
      setPlacesModalTab('preferred');
      return;
    }
    setPlacesListMode('preferred');
    placesListModeRef.current = 'preferred';
    const prefLandmarks = currentPreferred.map(preferredPlaceToLandmark);
    setLandmarksList(prefLandmarks);
    landmarksListRef.current = prefLandmarks;
    if (mapElementRef.current) {
      mountLandmarkMarkers(mapElementRef.current, prefLandmarks);
    }
    setShowPreferredListModal(false);
    setShowMobilePlaceModal(true);
    startGuidedTour(startIndex, prefLandmarks);
  };

  const startCombinedTour = (startIndex: number = 0) => {
    const currentPreferred = preferredPlacesRef.current;
    setPlacesListMode('combined');
    placesListModeRef.current = 'combined';
    const cityLms = getCityConfig(selectedCityId).landmarks;
    const prefLandmarks = currentPreferred.map(preferredPlaceToLandmark);
    const combined = [...cityLms, ...prefLandmarks];
    setLandmarksList(combined);
    landmarksListRef.current = combined;
    if (mapElementRef.current) {
      mountLandmarkMarkers(mapElementRef.current, combined);
    }
    setShowPreferredListModal(false);
    setShowMobilePlaceModal(true);
    startGuidedTour(startIndex, combined);
  };

  const startCityTour = (startIndex: number = 0) => {
    setPlacesListMode('city');
    placesListModeRef.current = 'city';
    const cityLms = getCityConfig(selectedCityId).landmarks;
    setLandmarksList(cityLms);
    landmarksListRef.current = cityLms;
    if (mapElementRef.current) {
      mountLandmarkMarkers(mapElementRef.current, cityLms);
    }
    setShowPreferredListModal(false);
    setShowMobilePlaceModal(true);
    startGuidedTour(startIndex, cityLms);
  };

  const handlePrev = () => {
    if (stopCameraOrbitOnlyRef.current) {
      stopCameraOrbitOnlyRef.current();
    }
    setHasInteractedWithTour(true);
    const currentList = landmarksListRef.current;
    if (!currentList || currentList.length === 0) return;

    const currentIndex = activeLandmark ? currentList.findIndex(l => l.id === activeLandmark.id) : 0;
    const prevIndex = (currentIndex - 1 + currentList.length) % currentList.length;
    const target = currentList[prevIndex];
    setTourIndex(prevIndex);

    if (tourActiveRef.current) {
      startGuidedTour(prevIndex, currentList);
    } else {
      selectAndFlyToLandmark(target);
    }
  };

  const handleNext = () => {
    if (stopCameraOrbitOnlyRef.current) {
      stopCameraOrbitOnlyRef.current();
    }
    setHasInteractedWithTour(true);
    const currentList = landmarksListRef.current;
    if (!currentList || currentList.length === 0) return;

    const currentIndex = activeLandmark ? currentList.findIndex(l => l.id === activeLandmark.id) : -1;
    const nextIndex = (currentIndex + 1) % currentList.length;
    const target = currentList[nextIndex];
    setTourIndex(nextIndex);

    if (tourActiveRef.current) {
      startGuidedTour(nextIndex, currentList);
    } else {
      selectAndFlyToLandmark(target);
    }
  };

  const flyToOverview = () => {
    const currentFlightId = ++flightSeqRef.current;
    if (isRotatingPoiRef.current) {
      stopCameraOrbitOnly();
    }
    if (tourActiveRef.current) {
      stopGuidedTour();
    }
    tourActiveRef.current = false;
    setIsTouring(false);
    if (flightTimerRef.current) {
      clearTimeout(flightTimerRef.current);
      flightTimerRef.current = null;
    }
    if (animationTimerRef.current) {
      clearTimeout(animationTimerRef.current);
      animationTimerRef.current = null;
    }

    const currentCity = getCityConfig(selectedCityIdRef.current);
    activeLandmarkRef.current = null;
    setActiveLandmark(null);
    setClickedPlaceId(null);
    setShowPlaceInfo(false);
    if (updateAllMarkerStylesRef.current) {
      updateAllMarkerStylesRef.current(null);
    }
    setFlightStatus(`3D ${currentCity.name} Overview`);
    setIsFlying(true);
    isFlyingRef.current = true;
    if (mapElementRef.current && typeof mapElementRef.current.flyCameraTo === 'function') {
      try {
        const isMobileScreen = typeof window !== 'undefined' && window.innerWidth < 1024;
        const targetCam = isMobileScreen ? currentCity.initialCamMobile : currentCity.initialCam;
        const duration = Math.max(1600, Math.round(3600 / (tourSpeedRef.current || 1)));

        mapElementRef.current.flyCameraTo({
          endCamera: {
            center: targetCam.center,
            range: targetCam.range,
            tilt: targetCam.tilt,
            heading: targetCam.heading,
          },
          durationMillis: duration,
        });

        if (flightTimerRef.current) clearTimeout(flightTimerRef.current);
        flightTimerRef.current = setTimeout(() => {
          if (flightSeqRef.current !== currentFlightId) return;
          setIsFlying(false);
          isFlyingRef.current = false;
          setFlightStatus(`3D ${currentCity.name} Overview Ready`);

          if (isRotatingPoiRef.current && triggerPoiOrbitRef.current) {
            triggerPoiOrbitRef.current(null);
          }
        }, duration);
      } catch (err) {
        console.warn("flyCameraTo overview failed", err);
        setIsFlying(false);
        isFlyingRef.current = false;
      }
    } else {
      setIsFlying(false);
      isFlyingRef.current = false;
    }
  };

  const stopCameraOrbitOnly = () => {
    if (rotateAnimFrameRef.current) {
      cancelAnimationFrame(rotateAnimFrameRef.current);
      rotateAnimFrameRef.current = null;
    }
    if (mapElementRef.current && typeof mapElementRef.current.stopCameraAnimation === 'function') {
      try {
        mapElementRef.current.stopCameraAnimation();
      } catch (e) { }
    }
  };
  stopCameraOrbitOnlyRef.current = stopCameraOrbitOnly;

  const stopRotatingPoi = () => {
    applyRotationMode('none');
  };

  // When user interacts with the map during rotation:
  // Stops the rotation on the current location, but keeps the tour running,
  // and preserves the rotation setting so it rotates again on the next location.
  const pauseCurrentRotationOnInteraction = () => {
    if (isFlyingRef.current) return;
    if (rotationModeRef.current !== 'none') {
      stopCameraOrbitOnly();
      setFlightStatus(activeLandmarkRef.current ? `Viewing ${activeLandmarkRef.current.name}` : `Viewing ${selectedCity.name}`);
    }
  };
  pauseCurrentRotationOnInteractionRef.current = pauseCurrentRotationOnInteraction;

  const triggerPoiOrbit = (targetLandmark?: Landmark | null, overrideMode?: 'none' | 'left' | 'right') => {
    stopCameraOrbitOnly();

    const mode = overrideMode || rotationModeRef.current;
    if (mode === 'none') {
      return;
    }

    // Do NOT start orbiting if the camera is actively flying between places
    if (isFlyingRef.current) {
      return;
    }

    const directionName = mode === 'left' ? 'counter-clockwise' : 'clockwise';

    const isMobileScreen = typeof window !== 'undefined' && window.innerWidth < 1024;
    const extractCoord = (val: any, fallback: number = 0): number => {
      if (typeof val === 'function') {
        try {
          const res = val();
          return typeof res === 'number' && !isNaN(res) ? res : fallback;
        } catch {
          return fallback;
        }
      }
      const n = Number(val);
      return typeof n === 'number' && !isNaN(n) ? n : fallback;
    };

    const curCenterObj = mapElementRef.current?.center;
    const curLat = curCenterObj ? extractCoord(curCenterObj.lat, NaN) : NaN;
    const curLng = curCenterObj ? extractCoord(curCenterObj.lng, NaN) : NaN;

    // ALWAYS center rotation directly on the marker whenever a landmark is targeted or active!
    let target = targetLandmark || activeLandmarkRef.current;

    // Validate that the target belongs to the currently active city/list
    if (target) {
      const curList = landmarksListRef.current || [];
      const belongsToCurrentView = curList.length === 0 || curList.some(
        (l) => l.id === target?.id || (target?.placeId && l.placeId === target?.placeId)
      );
      if (!belongsToCurrentView) {
        target = null;
      }
    }

    // If no target is set, orbit the city overview center without auto-selecting any landmark

    let poiCenter: { lat: number; lng: number; altitude?: number; altitudeMode?: string };
    let poiRange: number;
    let poiTilt: number;

    const currentCityConfig = getCityConfig(selectedCityIdRef.current);

    if (target) {
      const cleanPlaceId = target.placeId ? target.placeId.replace(/^places\//, '') : null;
      const cachedVp = cleanPlaceId ? viewportCache.get(cleanPlaceId) : null;
      const params = calculateCameraParameters(
        target,
        'center',
        altitudeModeRef.current,
        customAltitudeOffsetRef.current,
        customRangeMultiplierRef.current,
        isMobileScreen,
        cachedVp
      );

      // Use the exact same center, range, and tilt from params to guarantee zero jump between flight and orbit
      poiCenter = {
        ...params.center,
      };

      poiRange = params.range;
      poiTilt = customTiltOverrideRef.current !== null ? customTiltOverrideRef.current : params.tilt;

      setFlightStatus(`Orbiting ${directionName} around ${target.name}...`);
    } else {
      const defaultCam = isMobileScreen ? currentCityConfig.initialCamMobile : currentCityConfig.initialCam;
      poiCenter = {
        lat: defaultCam.center.lat,
        lng: defaultCam.center.lng,
        altitude: typeof defaultCam.center.altitude === 'number' ? defaultCam.center.altitude : 20,
        altitudeMode: 'RELATIVE_TO_MESH',
      };
      poiRange = defaultCam.range;
      poiTilt = defaultCam.tilt;
      setFlightStatus(`Orbiting ${directionName} around ${currentCityConfig.name}...`);
    }

    // 1x rotates much more smoothly and majestically (55s per 360° orbit)
    const durationPerOrbit = Math.round(55000 / (tourSpeedRef.current || 1));
    // Invert sign so screen visual rotation matches button indicator:
    // 'right' visually rotates right / clockwise around landmark
    // 'left' visually rotates left / counter-clockwise around landmark
    const dirSign = mode === 'left' ? 1 : -1;
    const targetDegreesPerSecond = 360 / (durationPerOrbit / 1000);

    // Cancel any previous orbit frame
    if (rotateAnimFrameRef.current) {
      cancelAnimationFrame(rotateAnimFrameRef.current);
      rotateAnimFrameRef.current = null;
    }

    // Both left and right share the exact same easing curve and exact same speed:
    const easeDurationMs = 1800;
    const startTime = performance.now();
    let lastTime = startTime;

    // Accurately determine the starting heading from the current camera view:
    const rawHeading = typeof mapElementRef.current?.heading === 'function'
      ? (mapElementRef.current as any).heading()
      : mapElementRef.current?.heading;
    let currentHeading = (typeof rawHeading === 'number' && !isNaN(rawHeading) && rawHeading !== null)
      ? ((rawHeading % 360) + 360) % 360
      : (typeof lastKnownHeadingRef.current === 'number' && !isNaN(lastKnownHeadingRef.current)
        ? ((lastKnownHeadingRef.current % 360) + 360) % 360
        : 0);
    lastKnownHeadingRef.current = currentHeading;

    if (mapElementRef.current && cameraViewModeRef.current !== 'cameraPosition') {
      const existingCenter = mapElementRef.current.center;
      if (!existingCenter || isNaN(extractCoord(existingCenter.lat, NaN))) {
        try {
          mapElementRef.current.center = poiCenter;
          if (typeof poiRange === 'number' && !isNaN(poiRange)) {
            mapElementRef.current.range = poiRange;
          }
          if (typeof poiTilt === 'number' && !isNaN(poiTilt)) {
            mapElementRef.current.tilt = poiTilt;
          }
        } catch (e) { }
      }
    }

    const orbitFlightId = flightSeqRef.current;
    const step = (time: number) => {
      if (
        rotationModeRef.current === 'none' ||
        !mapElementRef.current ||
        isFlyingRef.current ||
        orbitFlightId !== flightSeqRef.current
      ) {
        if (rotateAnimFrameRef.current) {
          cancelAnimationFrame(rotateAnimFrameRef.current);
          rotateAnimFrameRef.current = null;
        }
        return;
      }
      const deltaMs = Math.min(time - lastTime, 100);
      lastTime = time;

      const elapsed = time - startTime;
      const easeProgress = Math.min(1, elapsed / easeDurationMs);
      // Sinusoidal ease-in: accelerates smoothly from rest (0 speed) to target cruise speed
      const easeFactor = Math.sin((easeProgress * Math.PI) / 2);
      const currentSpeed = targetDegreesPerSecond * easeFactor;

      currentHeading = (currentHeading + dirSign * (currentSpeed * deltaMs) / 1000 + 360) % 360;

      // Orbit around the landmark center smoothly by advancing heading only (no center jitter)
      mapElementRef.current.heading = currentHeading;
      lastKnownHeadingRef.current = currentHeading;
      rotateAnimFrameRef.current = requestAnimationFrame(step);
    };

    rotateAnimFrameRef.current = requestAnimationFrame(step);
  };
  triggerPoiOrbitRef.current = triggerPoiOrbit;

  const applyRotationMode = (mode: 'none' | 'left' | 'right', targetLandmark?: Landmark | null) => {
    setRotationMode(mode);
    rotationModeRef.current = mode;
    isRotatingPoiRef.current = mode !== 'none';

    if (mode === 'none') {
      stopCameraOrbitOnly();
      setFlightStatus(activeLandmark ? `Viewing ${activeLandmark.name}` : `Viewing ${selectedCity.name}`);
    } else {
      if (!isFlyingRef.current) {
        triggerPoiOrbit(targetLandmark || activeLandmark, mode);
      }
    }
  };

  const startRotatingPoi = (targetLandmark?: Landmark | null) => {
    applyRotationMode(rotationModeRef.current === 'none' ? 'right' : rotationModeRef.current, targetLandmark || activeLandmark);
  };

  const toggleRotatingAroundPoi = () => {
    // Cycle: none -> right -> left -> none
    const nextMode = rotationModeRef.current === 'none' ? 'right' : rotationModeRef.current === 'right' ? 'left' : 'none';
    applyRotationMode(nextMode, activeLandmark);
  };

  const isDarkControls = theme === 'dark';

    return (
    <div className="relative w-screen h-screen bg-slate-900 text-slate-800 font-sans select-none antialiased overflow-hidden">
      
      {/* 100% Width and Height 3D Map Canvas */}
      <main className={`w-full h-full absolute inset-0 z-0 ${isDarkControls ? 'bg-slate-900' : 'bg-slate-100'} ${canUserControl ? 'cursor-grab active:cursor-grabbing' : 'cursor-wait'}`}>
        <div
          className={`w-full h-full absolute inset-0 z-0 ${isDarkControls ? 'bg-slate-900' : 'bg-slate-100'} relative overflow-hidden`}
          onPointerDown={triggerLockedIndicator}
          onTouchStart={triggerLockedIndicator}
        >
          <div ref={mapContainerRef} className={`w-full h-full ${isFlying ? 'cursor-wait' : 'cursor-grab active:cursor-grabbing'}`}>
            <div className={`absolute inset-0 flex items-center justify-center ${isDarkControls ? 'bg-slate-900 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
              <div className="text-center space-y-3">
                <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin mx-auto" />
                <p className="font-mono text-xs">Rendering 3D Spherical Map...</p>
              </div>
            </div>
          </div>

          {/* Transparent pointer capture layer when camera is programmatically moving */}
          {isFlying && (
            <div
              className="absolute inset-0 z-20 cursor-wait select-none"
              onPointerDown={triggerLockedIndicator}
              onTouchStart={triggerLockedIndicator}
            />
          )}

          {/* Subtle On-Map Camera Moving Indicator: Minimal animated icon, no text obstruction */}
          <AnimatePresence>
            {showLockedIndicator && isFlying && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none select-none flex items-center justify-center"
              >
                <div className="relative flex items-center justify-center w-14 h-14 rounded-full bg-slate-950/75 backdrop-blur-md border border-white/20 shadow-2xl">
                  {/* Orbiting dashed indicator ring */}
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                    className="absolute inset-1 rounded-full border border-dashed border-cyan-400/50"
                  />
                  {/* Animated Camera Flight Icon with subtle Move lock hint */}
                  <div className="relative flex items-center justify-center">
                    <Video className="w-6 h-6 text-cyan-400 animate-pulse" />
                    <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center">
                      <Move className="w-2.5 h-2.5 text-slate-500 opacity-60" />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Determine theme based on basemap */}
            {/* TOP BAR: Immersive Tour & City Menu, Recenter button, and Demo/Custom Key button */}
            <header
              className={`fixed ${
                isShortLandscape
                  ? 'top-1.5 h-8 w-[calc(100%-1rem)] max-w-[420px] px-2 gap-1 rounded-xl'
                  : 'top-3 h-10 w-[calc(100%-1.5rem)] sm:w-[500px] md:w-[530px] max-w-[550px] px-2 sm:px-3 gap-1 sm:gap-2 rounded-2xl'
              } left-1/2 -translate-x-1/2 flex items-center justify-between shadow-xl backdrop-blur-md transition-colors duration-200 border pointer-events-auto z-40 ${
                isDarkControls
                  ? 'bg-[#1a1c1e]/90 text-white border-white/10 shadow-2xl'
                  : 'bg-white/95 text-slate-800 border-slate-300/90'
              }`}
            >
              {/* Left group: Branding & City Selection */}
              <div className="relative flex items-center gap-1 sm:gap-1.5 min-w-0 shrink">
                <div
                  className={`${
                    isShortLandscape ? 'w-4 h-4 rounded-md' : 'w-5 h-5 rounded-lg'
                  } flex items-center justify-center shrink-0 border ${
                    isDarkControls
                      ? 'bg-cyan-950/80 border-cyan-700/40 text-cyan-400'
                      : 'bg-cyan-50 border-cyan-200 text-cyan-600'
                  }`}
                >
                  <Globe2 className={isShortLandscape ? "w-2.5 h-2.5" : "w-3.5 h-3.5"} />
                </div>

                <span className={`font-bold ${isShortLandscape ? 'text-[11px]' : 'text-xs sm:text-sm'} tracking-tight shrink-0 whitespace-nowrap ${isNavSearchActive ? 'hidden' : 'hidden md:inline'}`}>
                  Immersive Tour
                </span>
                <span className={`text-slate-400 text-xs font-light ${isNavSearchActive ? 'hidden' : 'hidden md:inline'}`}>|</span>

                {/* City Selection Dropdown with 7-char max name */}
                <div ref={cityDropdownContainerRef} className="relative shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsCityDropdownOpen(prev => !prev);
                    }}
                    className={`flex items-center gap-1 ${
                      isShortLandscape ? 'px-1 py-0.5 text-[11px]' : 'px-1.5 py-0.5 text-xs sm:text-sm'
                    } rounded-lg font-semibold tracking-tight border transition-colors cursor-pointer ${
                      isDarkControls
                        ? 'bg-white/5 hover:bg-white/10 text-cyan-400 border-white/10'
                        : 'bg-slate-100 hover:bg-slate-200/70 text-cyan-700 border-slate-200'
                    }`}
                    aria-label={`Selected City: ${selectedCity.name}`}
                    title={selectedCity.name}
                  >
                    <span className={isShortLandscape ? 'text-xs' : 'text-xs sm:text-sm'}>{selectedCity.flag}</span>
                    <span className="truncate">
                      {selectedCity.name.length > 7 ? `${selectedCity.name.slice(0, 7)}...` : selectedCity.name}
                    </span>
                    <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-150 ${isCityDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Dropdown Menu */}
                  <AnimatePresence>
                    {isCityDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className={`absolute top-full left-0 mt-1.5 w-48 sm:w-52 rounded-xl shadow-2xl backdrop-blur-md border z-[999] pointer-events-auto overflow-hidden flex flex-col ${
                          isDarkControls
                            ? 'bg-[#1a1c1e]/98 border-white/15 text-white shadow-black/60'
                            : 'bg-white/98 border-slate-200 text-slate-800 shadow-slate-300/50'
                        }`}
                      >
                        {/* Scrollable container displaying up to 7 cities simultaneously */}
                        <div
                          ref={cityDropdownScrollRef}
                          onScroll={handleCityScroll}
                          className="max-h-[min(238px,45vh)] overflow-y-auto py-1 scrollbar-thin divide-y-0"
                        >
                          {CITIES.map((city) => {
                            const isSelected = city.id === selectedCityId;
                            return (
                              <button
                                key={city.id}
                                onClick={() => handleSelectCity(city.id)}
                                className={`w-full px-2.5 py-1.5 flex items-center justify-between text-xs transition-colors cursor-pointer ${
                                  isSelected
                                    ? isDarkControls
                                    : 'hover:bg-slate-100 text-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <span className="text-sm shrink-0">{city.flag}</span>
                                  <span className="truncate">{city.name}</span>
                                </div>
                                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0 ml-1.5" />}
                              </button>
                            );
                          })}
                        </div>

                        {/* Visual indicator arrow showing more cities exist below */}
                        {canScrollMoreCities && (
                          <button
                            onClick={handleScrollMoreCities}
                            className={`w-full py-1 px-2 flex items-center justify-center gap-1 border-t text-[10px] font-medium transition-colors cursor-pointer shrink-0 ${
                              isDarkControls
                                ? 'bg-[#141618] hover:bg-[#202226] border-white/10 text-cyan-400'
                                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-cyan-700'
                            }`}
                            title="Scroll down for more cities"
                            aria-label="Scroll for more cities"
                          >
                            <span className="tracking-tight">More cities</span>
                            <ChevronDown className="w-3 h-3 text-cyan-400 animate-bounce" />
                          </button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Right Action Group: Search (expands LEFTWARD!), Recenter, and Key */}
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
                {/* Autocomplete Search: anchored on the right, expands LEFTWARD into middle space on interaction */}
                <div
                  onPointerDown={() => setIsNavSearchActive(true)}
                  onClick={() => setIsNavSearchActive(true)}
                  className={`flex items-center transition-all duration-300 ease-out z-30 cursor-pointer ${
                    isNavSearchActive
                      ? 'w-44 xs:w-52 sm:w-60 md:w-68 shadow-lg shadow-black/25 ring-2 ring-cyan-500/60 rounded-xl'
                      : 'w-24 xs:w-28 sm:w-32'
                  }`}
                >
                  <PlacesBasicAutocomplete
                    onPlaceSelect={handleBasicAutocompleteSelect}
                    isDark={isDarkControls}
                    compact={true}
                    onFocusChange={setIsNavSearchActive}
                    locationBiasCenter={{
                      lat: selectedCity.initialCam.center.lat,
                      lng: selectedCity.initialCam.center.lng,
                    }}
                  />
                </div>

                {/* Recenter Camera View (Focus on all landmarks like page load) */}
                <button
                  onClick={() => {
                    flyToOverview();
                  }}
                  className={`${
                    isShortLandscape ? 'w-6 h-6 rounded-md' : 'w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl'
                  } border transition-all cursor-pointer flex items-center justify-center shadow-2xs shrink-0 ${
                    isDarkControls
                      ? 'bg-white/10 hover:bg-white/15 text-slate-200 border-white/15 hover:text-cyan-400'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200/90 hover:text-cyan-600'
                  }`}
                  title="Recenter view to all landmarks (City Overview)"
                  aria-label="Recenter Map"
                >
                  <MapPin className={`${isShortLandscape ? 'w-3 h-3' : 'w-3.5 h-3.5 sm:w-4 sm:h-4'} text-cyan-400 shrink-0`} />
                </button>

                {/* API Key Modal Button: ICON ONLY, NO TEXT */}
                <button
                  onClick={() => {
                    setKeyInputValue(localStorage.getItem('gmp_custom_api_key') || localStorage.getItem('custom_maps_api_key') || '');
                    setShowApiKeyModal(true);
                  }}
                  className={`${
                    isShortLandscape
                      ? 'w-6 h-6 rounded-md'
                      : 'w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl'
                  } border transition-all cursor-pointer flex items-center justify-center relative shadow-2xs shrink-0 ${
                    isDarkControls
                      ? 'bg-white/10 hover:bg-white/15 text-slate-200 border-white/15'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200/90'
                  }`}
                  title={isCustomKey ? 'Custom Google Maps API Key (Active)' : 'Google Maps Demo Key (Active)'}
                  aria-label="API Key Settings"
                >
                  <Key className={`${isShortLandscape ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5 sm:w-4 sm:h-4'} text-blue-500 shrink-0`} />
                  <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${isKeyWorking ? 'bg-emerald-500' : isCustomKey ? 'bg-rose-500' : 'bg-slate-400'}`} />
                </button>
              </div>
            </header>

            {/* UNIFIED BOTTOM NAVIGATION & PLACE INFO PANEL: No separation between info and bottom menu */}
            <div
              className={`fixed ${
                isShortLandscape
                  ? 'bottom-1.5 w-[calc(100%-1rem)] max-w-[420px] rounded-xl'
                  : 'bottom-3 w-[calc(100%-1.5rem)] sm:w-[520px] max-w-[520px] rounded-2xl'
              } left-1/2 -translate-x-1/2 z-40 pointer-events-auto flex flex-col shadow-2xl backdrop-blur-md transition-all duration-200 border overflow-hidden ${
                isDarkControls
                  ? 'bg-[#1a1c1e]/95 text-white border-white/15 shadow-black/60'
                  : 'bg-white/95 text-slate-800 border-slate-300/90 shadow-slate-900/15'
              }`}
            >
              {/* TOP PART: Place Details Info Section (no separation, directly atop the navigation dock) */}
              <AnimatePresence initial={false}>
                {showPlaceInfo && (
                  <motion.div
                    key={`unified-place-info-${currentTargetPlaceId}`}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className={`w-full relative overflow-hidden border-b ${
                      isDarkControls ? 'border-white/10' : 'border-slate-200/90'
                    } p-2 sm:p-2.5`}
                  >
                  {/* Top Right Action Group: Reveal Full Info & Preferred List Tickbox */}
                  <div className="absolute top-2 right-2 z-30 flex items-center gap-1.5">
                    {/* Reveal Full Info / Reviews & Photos Toggle */}
                    <button
                      type="button"
                      onClick={() => setShowFullPlaceDetails((prev) => !prev)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-md border ${
                        showFullPlaceDetails
                          ? isDarkControls
                            ? 'bg-cyan-500/25 text-cyan-300 border-cyan-400/60 shadow-cyan-500/20'
                            : 'bg-cyan-100 text-cyan-700 border-cyan-400'
                          : isDarkControls
                            ? 'bg-[#2b2d30]/95 text-slate-300 border-white/15 hover:text-white hover:bg-[#383b40]'
                            : 'bg-white/95 text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                      title={showFullPlaceDetails ? "Collapse to compact place card" : "Reveal full place details, reviews & photos"}
                      aria-label={showFullPlaceDetails ? "Collapse place details" : "Reveal full place details and reviews"}
                    >
                      {showFullPlaceDetails ? (
                        <ChevronDown className="w-4.5 h-4.5 text-cyan-400 stroke-[2.5]" />
                      ) : (
                        <ChevronUp className="w-4.5 h-4.5 text-slate-300 hover:text-white stroke-[2.5]" />
                      )}
                    </button>

                    {/* Single "Preferred" Tickbox Toggle */}
                    <button
                      type="button"
                      onClick={togglePreferredCurrentPlace}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-md border ${
                        isCurrentPlacePreferred
                          ? isDarkControls
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 hover:bg-emerald-500/30'
                            : 'bg-emerald-50 text-emerald-600 border-emerald-300 hover:bg-emerald-100'
                          : isDarkControls
                            ? 'bg-[#2b2d30]/95 text-slate-300 border-white/15 hover:text-white hover:bg-[#383b40]'
                            : 'bg-white/95 text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                      title={isCurrentPlacePreferred ? "Mark as removed from preferred list" : "Save to preferred list"}
                      aria-label={isCurrentPlacePreferred ? "Remove from preferred list" : "Save to preferred list"}
                    >
                      {isCurrentPlacePreferred ? (
                        <CheckSquare className="w-4.5 h-4.5 text-emerald-400 stroke-[2.5]" />
                      ) : (
                        <Square className="w-4.5 h-4.5 text-slate-300 hover:text-white stroke-[2]" />
                      )}
                    </button>

                    {/* Close / Hide Place Details Info Button */}
                    <button
                      type="button"
                      onClick={() => setShowPlaceInfo(false)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-md border ${
                        isDarkControls
                          ? 'bg-[#2b2d30]/95 text-slate-300 border-white/15 hover:text-white hover:bg-[#383b40]'
                          : 'bg-white/95 text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                      title="Hide Place Details (Click ℹ️ Info button to restore)"
                      aria-label="Hide Place Details"
                    >
                      <X className="w-4 h-4 text-slate-300 hover:text-white stroke-[2.5]" />
                    </button>
                  </div>

                  {/* Places UI Kit Web Component with Fault-Tolerant Error Boundary */}
                  <div className="places-ui-kit-wrapper w-full">
                    <PlacesErrorBoundary
                      key={`places-err-boundary-${currentTargetPlaceId}`}
                      resetKey={currentTargetPlaceId}
                      fallback={
                        <div className="flex flex-col gap-1 w-full text-left py-1 pr-10">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-bold text-xs sm:text-sm truncate">
                                {activeLandmark ? activeLandmark.name : `${selectedCity.name} Overview`}
                              </h3>
                              <p className="text-[10.5px] sm:text-xs text-slate-400 truncate">
                                {activeLandmark ? `${activeLandmark.name}, ${selectedCity.name}` : selectedCity.tagline}
                              </p>
                            </div>
                            <div className="shrink-0 flex items-center gap-1 text-[11px] text-amber-400 font-medium">
                              <span>⭐</span>
                              <span>{activeLandmark?.rating ? activeLandmark.rating : '4.8'}</span>
                            </div>
                          </div>
                        </div>
                      }
                    >
                      {placesLoaded ? (
                        showFullPlaceDetails ? (
                          <div className="w-full max-h-[min(340px,45vh)] overflow-y-auto scrollbar-thin pr-1 pt-0.5">
                            <gmp-advanced-place-details
                              key={`bottom-full-${currentTargetPlaceId}`}
                              ref={advancedPlaceDetailsRef}
                              orientation="VERTICAL"
                              style={{
                                width: '100%',
                                minHeight: '220px',
                                padding: '0.25rem 0',
                                margin: 0,
                                border: 'none',
                                backgroundColor: 'transparent',
                                colorScheme: isDarkControls ? 'dark' : 'light',
                                '--gmp-details-background': 'transparent',
                                '--gmp-details-color': isDarkControls ? '#f1f5f9' : '#0f172a',
                                '--gmp-details-font-family': 'inherit',
                              } as React.CSSProperties}
                            >
                              <gmp-place-details-place-request
                                id="place-request-full"
                                place={formattedPlaceResource}
                              />
                              <gmp-place-media lightbox-preferred="true" />
                              <gmp-place-name />
                              <gmp-place-rating />
                              <gmp-place-type />
                              <gmp-place-price />
                              <gmp-place-address />
                              <gmp-place-accessible-entrance-icon />
                              <gmp-place-open-now-status />
                              <gmp-place-opening-hours />
                              <gmp-place-all-content />
                              <gmp-place-attribution
                                light-scheme-color={isDarkControls ? "WHITE" : "BLACK"}
                                dark-scheme-color="GRAY"
                              />
                            </gmp-advanced-place-details>
                          </div>
                        ) : (
                          <gmp-advanced-place-details-compact
                            key={`bottom-docked-${currentTargetPlaceId}`}
                            ref={advancedPlaceDetailsRef}
                            orientation="HORIZONTAL"
                            truncation-preferred=""
                            style={{
                              width: '100%',
                              minHeight: isShortLandscape ? '70px' : '80px',
                              padding: 0,
                              margin: 0,
                              border: 'none',
                              backgroundColor: 'transparent',
                              colorScheme: isDarkControls ? 'dark' : 'light',
                              '--gmp-details-background': 'transparent',
                              '--gmp-details-color': isDarkControls ? '#f1f5f9' : '#0f172a',
                              '--gmp-details-font-family': 'inherit',
                            } as React.CSSProperties}
                          >
                            <gmp-place-details-place-request
                              id="place-request"
                              place={formattedPlaceResource}
                            />
                            <gmp-place-media lightbox-preferred="true" />
                            <gmp-place-name />
                            <gmp-place-rating />
                            <gmp-place-address />
                            <gmp-place-type />
                            <gmp-place-price />
                            <gmp-place-accessible-entrance-icon />
                            <gmp-place-open-now-status />
                            <gmp-place-attribution
                              light-scheme-color={isDarkControls ? "WHITE" : "BLACK"}
                              dark-scheme-color="GRAY"
                            />
                          </gmp-advanced-place-details-compact>
                        )
                      ) : (
                        <div className="font-mono text-[10px] text-slate-400 py-3 text-center w-full">Loading Places Details...</div>
                      )}
                    </PlacesErrorBoundary>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* BOTTOM PART: Tour Navigation Deck (Zero separation, directly attached below info) */}
            <div className="w-full max-w-full px-2 sm:px-2.5 py-1.5 shrink-0 overflow-x-auto overflow-y-hidden no-scrollbar overscroll-x-contain touch-pan-x scroll-smooth">
                  <div className={`flex items-center justify-between min-w-max gap-1 sm:gap-2 px-0.5 ${
                    isShortLandscape ? 'py-0.5' : 'py-0.5'
                  }`}>
                    {/* Left: Previous, Tour Mode Pills, Tour (with City/Saved/Combined mode selection), Next */}
                    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                      <button
                        onClick={handlePrev}
                        className={`${
                          isShortLandscape ? 'w-6 h-6 rounded-md' : 'w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl'
                        } flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-2xs ${
                          isDarkControls
                            ? 'bg-[#2b2d30] border border-white/10 text-slate-200 hover:text-cyan-400'
                            : 'bg-slate-100 border border-slate-200 text-slate-700 hover:text-cyan-600'
                        }`}
                        title="Previous Location"
                      >
                        <ChevronLeft className={isShortLandscape ? "w-3 h-3" : "w-3.5 h-3.5 sm:w-4 sm:h-4"} />
                      </button>

                      {/* Left Tour Mode Buttons: Kept on the left as requested (City, Saved, All) */}
                      <div className="flex items-center p-0.5 rounded-lg bg-black/25 border border-white/10 text-[10px] shrink-0">
                        <button
                          type="button"
                          onClick={() => switchToPlacesMode('city')}
                          className={`px-1.5 py-0.5 sm:px-2 rounded-md font-medium transition-all cursor-pointer ${
                            placesListMode === 'city'
                              ? isDarkControls ? 'bg-cyan-600 text-white shadow-2xs font-semibold' : 'bg-white text-slate-900 shadow-2xs font-semibold'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                          title="Tour default city landmarks"
                        >
                          <span>🏛️ City</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (preferredPlaces.length === 0) {
                              setShowPreferredListModal(true);
                              setPlacesModalTab('preferred');
                            }
                            switchToPlacesMode('preferred');
                          }}
                          className={`px-1.5 py-0.5 sm:px-2 rounded-md font-medium transition-all cursor-pointer ${
                            placesListMode === 'preferred'
                              ? 'bg-emerald-600 text-white shadow-2xs font-semibold'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                          title={preferredPlaces.length > 0 ? `Tour your saved places (${preferredPlaces.length})` : "Saved places (click to view/add)"}
                        >
                          <span>⭐ Saved{preferredPlaces.length > 0 ? ` (${preferredPlaces.length})` : ''}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => switchToPlacesMode('combined')}
                          className={`px-1.5 py-0.5 sm:px-2 rounded-md font-medium transition-all cursor-pointer ${
                            placesListMode === 'combined'
                              ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                          title="Tour combined itinerary (City landmarks + Saved places)"
                        >
                          <span>🌐 All{preferredPlaces.length > 0 ? ` (${getCityConfig(selectedCityId).landmarks.length + preferredPlaces.length})` : ''}</span>
                        </button>
                      </div>

                      {/* Tour Button: Just 'Tour' (no 'city', 'saved', 'all', or count in the button text), keeping dynamic color changes */}
                      <button
                        onClick={() => {
                          setHasInteractedWithTour(true);
                          setShowLandingBanner(false);
                          if (isTouring) {
                            stopGuidedTour();
                          } else {
                            if (placesListMode === 'preferred') {
                              startPreferredTour(0);
                            } else if (placesListMode === 'combined') {
                              startCombinedTour(0);
                            } else {
                              const currentIdx = activeLandmark ? landmarksList.findIndex(l => l.id === activeLandmark.id) : 0;
                              startCityTour(currentIdx >= 0 ? currentIdx : 0);
                            }
                          }
                        }}
                        className={`${
                          isShortLandscape
                            ? 'py-0.5 px-2 rounded-md text-[10px] gap-1'
                            : 'py-1 px-2.5 sm:py-1.5 sm:px-3 rounded-lg sm:rounded-xl text-[11px] sm:text-xs gap-1.5'
                        } font-bold tracking-wide transition-all flex items-center justify-center cursor-pointer shadow-2xs active:scale-95 ${
                          isTouring
                            ? isDarkControls
                              ? 'bg-[#282a30] hover:bg-[#32353c] text-slate-100 border border-cyan-500/40'
                              : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                            : placesListMode === 'preferred'
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30'
                              : placesListMode === 'combined'
                                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/30'
                                : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                        }`}
                        title={
                          isTouring
                            ? "Click to stop Tour"
                            : placesListMode === 'preferred'
                              ? `Start Tour of your saved places`
                              : placesListMode === 'combined'
                                ? `Start Combined Tour (City + Saved)`
                                : `Start Tour of ${selectedCity.name} landmarks`
                        }
                      >
                        {isTouring ? (
                          <>
                            <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 sm:h-2 sm:w-2 bg-rose-500"></span>
                            </span>
                            <Square className="w-2 h-2 sm:w-2.5 sm:h-2.5 fill-current text-slate-200" />
                            <span>Stop</span>
                          </>
                        ) : (
                          <>
                            <Play className={isShortLandscape ? "w-2.5 h-2.5 fill-white" : "w-3 h-3 sm:w-3.5 sm:h-3.5 fill-white"} />
                            <span>Tour</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={handleNext}
                        className={`${
                          isShortLandscape ? 'w-6 h-6 rounded-md' : 'w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl'
                        } flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-2xs ${
                          isDarkControls
                            ? 'bg-[#2b2d30] border border-white/10 text-slate-200 hover:text-cyan-400'
                            : 'bg-slate-100 border border-slate-200 text-slate-700 hover:text-cyan-600'
                        }`}
                        title="Next Location"
                      >
                        <ChevronRight className={isShortLandscape ? "w-3 h-3" : "w-3.5 h-3.5 sm:w-4 sm:h-4"} />
                      </button>

                      {/* Info Button: Toggle Place Details Info on/off */}
                      <button
                        type="button"
                        onClick={() => {
                          if (!activeLandmark && !showPlaceInfo) {
                            const first = landmarksList[0];
                            if (first && selectAndFlyToLandmarkRef.current) {
                              selectAndFlyToLandmarkRef.current(first);
                              return;
                            }
                          }
                          setShowPlaceInfo((prev) => !prev);
                        }}
                        className={`${
                          isShortLandscape ? 'w-6 h-6 rounded-md' : 'w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl'
                        } relative flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-2xs shrink-0 ${
                          showPlaceInfo
                            ? isDarkControls
                              ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/60 shadow-cyan-500/20'
                              : 'bg-cyan-100 text-cyan-700 border border-cyan-400 shadow-sm'
                            : isDarkControls
                              ? 'bg-[#2b2d30] border border-white/10 text-slate-300 hover:text-cyan-400 hover:bg-[#383b40]'
                              : 'bg-slate-100 border border-slate-200 text-slate-700 hover:text-cyan-600 hover:bg-slate-200'
                        }`}
                        title={showPlaceInfo ? "Hide Place Details Info (Click to minimize card)" : "Show Place Details Info (Click to view card)"}
                        aria-label={showPlaceInfo ? "Hide Place Details Info" : "Show Place Details Info"}
                      >
                        <Info className={isShortLandscape ? "w-3 h-3 stroke-[2.2]" : "w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.2]"} />
                      </button>
                    </div>

                    {/* Right Controls: In requested order (Preferred Places Explorer -> Rotate POI -> Force North -> Camera Speed -> Basemap Mode -> Theme Change) */}
                    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">

                    {/* Preferred List Button: NO TEXT, icon-only button with count badge */}
                    <button
                      onClick={() => {
                        setPlacesModalTab(preferredPlaces.length > 0 ? 'preferred' : 'city');
                        setShowPreferredListModal((prev) => !prev);
                      }}
                      className={`${
                        isShortLandscape ? 'w-6 h-6 rounded-md' : 'w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl'
                      } relative flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-2xs shrink-0 ${
                        showPreferredListModal || preferredPlaces.length > 0
                          ? isDarkControls
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                          : isDarkControls
                            ? 'bg-[#2b2d30] border border-white/10 text-slate-300 hover:text-white'
                            : 'bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900'
                      }`}
                      title={
                        preferredPlaces.length > 0
                          ? `Preferred Places (${preferredPlaces.length})`
                          : "Preferred Places (Empty)"
                      }
                      aria-label="Preferred Places List"
                    >
                      <BookmarkCheck className={isShortLandscape ? "w-3 h-3" : "w-3.5 h-3.5 sm:w-4 sm:h-4"} />
                      {preferredPlaces.length > 0 && (
                        <span className="absolute -top-1 -right-1 px-1 py-0.2 rounded-full text-[8px] font-black bg-emerald-500 text-slate-950 shadow-2xs leading-none">
                          {preferredPlaces.length}
                        </span>
                      )}
                    </button>

                    {/* 2. Rotate around Point of Interest Single Button Toggle: Right -> Left -> Stop */}
                    <button
                      onClick={toggleRotatingAroundPoi}
                      className={`${
                        isShortLandscape ? 'w-6 h-6 rounded-md' : 'w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl'
                      } relative flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-2xs shrink-0 ${
                        rotationMode !== 'none'
                          ? isDarkControls
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : 'bg-cyan-50 text-cyan-700 border border-cyan-300'
                          : isDarkControls
                            ? 'bg-[#2b2d30] border border-white/10 text-slate-400 hover:text-white'
                            : 'bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-900'
                      }`}
                      title={
                        rotationMode === 'right'
                          ? "Rotation: Right (Clockwise) • Click for Left"
                          : rotationMode === 'left'
                            ? "Rotation: Left (Counter-Clockwise) • Click to Stop"
                            : "Rotation: Stopped (Off) • Click for Right"
                      }
                      aria-label={`Rotation: ${rotationMode === 'right' ? 'Right' : rotationMode === 'left' ? 'Left' : 'Stopped'}`}
                    >
                      {rotationMode === 'left' ? (
                        <RotateCcw
                          className={`${
                            isShortLandscape ? 'w-3 h-3' : 'w-3.5 h-3.5 sm:w-4 sm:h-4'
                          } text-cyan-400 transition-colors`}
                        />
                      ) : (
                        <RotateCw
                          className={`${
                            isShortLandscape ? 'w-3 h-3' : 'w-3.5 h-3.5 sm:w-4 sm:h-4'
                          } ${rotationMode === 'right' ? 'text-cyan-400' : 'text-slate-400'} transition-colors`}
                        />
                      )}

                      {/* Direction / Status Badge */}
                      {rotationMode !== 'none' ? (
                        <span className="absolute -top-1 -right-1 px-1 py-0.2 rounded-full text-[8px] font-black bg-cyan-500 text-white shadow-2xs leading-none">
                          {rotationMode === 'right' ? 'R' : 'L'}
                        </span>
                      ) : (
                        <span className="absolute -top-1 -right-1 px-1 py-0.2 rounded-full text-[7px] font-bold bg-slate-600 text-slate-300 shadow-2xs leading-none">
                          Off
                        </span>
                      )}
                    </button>

                    {/* 3. Force North / Lock North */}
                    <button
                      onClick={handleToggleForceNorth}
                      className={`${
                        isShortLandscape ? 'w-6 h-6 rounded-md' : 'w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl'
                      } flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-2xs shrink-0 ${
                        forceNorth
                          ? isDarkControls
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : 'bg-cyan-50 text-cyan-700 border border-cyan-300'
                          : isDarkControls
                            ? 'bg-[#2b2d30] border border-white/10 text-slate-300 hover:text-white'
                            : 'bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900'
                      }`}
                      title={forceNorth ? "Lock North is ON (Facing North / Top)" : "Lock North is OFF (Scenic angles enabled)"}
                      aria-label="Toggle Lock North"
                    >
                      <Compass
                        className={`${
                          isShortLandscape ? 'w-3 h-3' : 'w-3.5 h-3.5 sm:w-4 sm:h-4'
                        } transition-transform duration-300 ease-out ${
                          forceNorth ? '-rotate-45' : 'rotate-45'
                        }`}
                      />
                    </button>

                    {/* 4. Camera Centering / Altitude Mode Switch (Center Mode vs Camera Position POV Mode) */}
                    <button
                      onClick={toggleCameraViewMode}
                      className={`${
                        isShortLandscape ? 'w-6 h-6 rounded-md' : 'w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl'
                      } relative flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-2xs shrink-0 ${
                        cameraViewMode === 'cameraPosition'
                          ? isDarkControls
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-amber-50 text-amber-700 border border-amber-300'
                          : isDarkControls
                            ? 'bg-[#2b2d30] border border-white/10 text-slate-300 hover:text-white'
                            : 'bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900'
                      }`}
                      title={
                        cameraViewMode === 'center'
                          ? "Camera Mode: Center Target Mode (Looking AT place with adaptive altitude relative to mesh) • Click for Camera Position Mode"
                          : "Camera Mode: Camera Position Mode (100m offset above mesh, tilt 80) • Click for Center Target Mode"
                      }
                      aria-label={`Camera Mode: ${cameraViewMode === 'center' ? 'Center Target' : 'Camera Position POV'}`}
                    >
                      {cameraViewMode === 'center' ? (
                        <Crosshair className={isShortLandscape ? "w-3 h-3 text-cyan-400" : "w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400"} />
                      ) : (
                        <Eye className={isShortLandscape ? "w-3 h-3 text-amber-400" : "w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400"} />
                      )}
                      <span className={`absolute -top-1 -right-1 px-1 py-0.2 rounded-full text-[7.5px] font-black ${
                        cameraViewMode === 'center' ? 'bg-cyan-500 text-slate-950' : 'bg-amber-500 text-slate-950'
                      } shadow-2xs leading-none`}>
                        {cameraViewMode === 'center' ? 'Ctr' : 'POV'}
                      </span>
                    </button>

                    {/* 3. Camera Tour Speed: 1x, 1.5x, 2x with fixed width to prevent layout jitter */}
                    <button
                      onClick={cycleTourSpeed}
                      className={`${
                        isShortLandscape
                          ? 'w-6 h-6 rounded-md text-[9px]'
                          : 'w-7.5 h-7 sm:w-8.5 sm:h-8 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px]'
                      } flex items-center justify-center font-bold transition-all shrink-0 select-none active:scale-90 cursor-pointer shadow-2xs ${
                        tourSpeed !== 1
                          ? isDarkControls
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : 'bg-cyan-50 text-cyan-700 border border-cyan-300'
                          : isDarkControls
                            ? 'bg-[#2b2d30] border border-white/10 text-slate-300 hover:text-white'
                            : 'bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900'
                      }`}
                      title={`Camera Tour Speed: ${tourSpeed}x (Click to cycle: 1x → 1.5x → 2x)`}
                      aria-label={`Camera Tour Speed ${tourSpeed}x`}
                    >
                      <span className="font-mono tabular-nums text-center leading-none">{tourSpeed}x</span>
                    </button>

                    {/* 4. Basemap Mode Cycle */}
                    <button
                      onClick={cycleMapMode}
                      className={`${
                        isShortLandscape ? 'w-6 h-6 rounded-md' : 'w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl'
                      } flex items-center justify-center active:scale-90 transition-all cursor-pointer shadow-2xs shrink-0 ${
                        isDarkControls
                          ? 'bg-[#2b2d30] border border-white/10 text-slate-300 hover:text-cyan-400'
                          : 'bg-slate-100 border border-slate-200 text-slate-600 hover:text-cyan-700'
                      }`}
                      title={`Basemap Mode: ${mapMode} (Click to switch)`}
                      aria-label="Switch Basemap Mode"
                    >
                      {mapMode === 'HYBRID' && <Layers className={isShortLandscape ? "w-3 h-3 text-cyan-400" : "w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400"} />}
                      {mapMode === 'SATELLITE' && <Globe className={isShortLandscape ? "w-3 h-3 text-cyan-400" : "w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400"} />}
                      {mapMode === 'ROADMAP' && <Map className={isShortLandscape ? "w-3 h-3 text-cyan-400" : "w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400"} />}
                    </button>

                    {/* 5. Theme Change Light / Dark (Moon flipping to Sun, keeping theme consistent without yellow) */}
                    <button
                      onClick={toggleTheme}
                      className={`${
                        isShortLandscape ? 'w-6 h-6 rounded-md' : 'w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl'
                      } flex items-center justify-center active:scale-90 transition-all cursor-pointer shadow-2xs shrink-0 ${
                        isDarkControls
                          ? 'bg-[#2b2d30] border border-white/10 text-slate-300 hover:text-cyan-400'
                          : 'bg-slate-100 border border-slate-200 text-slate-600 hover:text-cyan-700'
                      }`}
                      title={isDarkControls ? "Current Theme: Dark (Click to flip to Light Theme)" : "Current Theme: Light (Click to flip to Dark Theme)"}
                      aria-label={isDarkControls ? "Switch to Light Theme" : "Switch to Dark Theme"}
                    >
                      <div className={`transition-transform duration-300 ease-out flex items-center justify-center ${isDarkControls ? 'rotate-0' : 'rotate-180'}`}>
                        {isDarkControls ? (
                          <Moon className={isShortLandscape ? "w-3 h-3 text-cyan-400" : "w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400"} />
                        ) : (
                          <Sun className={isShortLandscape ? "w-3 h-3 text-slate-700" : "w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-700"} />
                        )}
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* INITIAL WELCOME OVERLAY IN MAP CENTER */}
            <AnimatePresence>
              {showLandingBanner && !hasInteractedWithTour && !isTouring && activeLandmark === null && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: 10, transition: { duration: 0.25 } }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-auto select-none w-[90vw] max-w-[340px]"
                >
                  <div
                    className={`relative rounded-2xl shadow-2xl backdrop-blur-xl border pt-7 px-4 pb-3.5 transition-colors duration-200 ${
                      isDarkControls
                        ? 'bg-[#181a1d]/95 text-white border-white/15 shadow-black/70'
                        : 'bg-white/95 text-slate-800 border-slate-200/90 shadow-slate-400/40'
                    }`}
                  >
                    {/* Dismiss Button in top corner with dedicated clearance */}
                    <button
                      onClick={() => {
                        setShowLandingBanner(false);
                        setHasInteractedWithTour(true);
                      }}
                      className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-colors cursor-pointer z-10 ${
                        isDarkControls
                          ? 'text-slate-400 hover:text-white hover:bg-white/10'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                      title="Dismiss"
                      aria-label="Dismiss"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>

                    {/* Action: Tap / Click to start the tour (cleanly spaced below dismiss button) */}
                    <button
                      onClick={() => {
                        setShowLandingBanner(false);
                        setHasInteractedWithTour(true);
                        if (placesListModeRef.current === 'preferred' || preferredPlacesRef.current.length > 0) {
                          startPreferredTour(0);
                        } else {
                          startGuidedTour(0);
                        }
                      }}
                      className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-bold text-xs sm:text-sm shadow-lg shadow-cyan-900/30 flex items-center justify-center gap-2 transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99] group"
                    >
                      <Play className="w-3.5 h-3.5 fill-white text-white group-hover:translate-x-0.5 transition-transform" />
                      <span>
                        <span className="hidden md:inline">Click</span>
                        <span className="md:hidden">Tap</span> to start the tour
                      </span>
                    </button>

                    {/* Secondary Note: Remix or Set Demo API Key */}
                    <div className="mt-2.5 text-center">
                      <p
                        className={`inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-medium select-none ${
                          isDarkControls ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        <Key className="w-3 h-3 shrink-0 opacity-70 text-cyan-400" />
                        <span>or Remix and create a Google Maps demo api key</span>
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

      {/* Google Maps API Key Setup Modal */}
      <AnimatePresence>
        {showApiKeyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowApiKeyModal(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            />

            {/* Modal Dialog Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="relative w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 shadow-2xl text-slate-800 space-y-5 border border-slate-100 z-10"
            >
              {/* Header: Icon, Titles, Close */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-600/20">
                    <Key className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                      Google Maps API Key Setup
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Set via <code className="font-mono text-blue-600 font-semibold bg-blue-50 px-1 py-0.5 rounded border border-blue-100 text-[11px]">VITE_GOOGLE_MAPS_API_KEY</code>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowApiKeyModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  title="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Active Key Card */}
              <div className="rounded-2xl border border-slate-200/90 p-4 bg-slate-50/70 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-semibold text-slate-700">
                    Active Key
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                      authFailed
                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                        : isKeyWorking
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {authFailed
                      ? 'Authentication Failed'
                      : isKeyWorking
                      ? (isCustomKey ? 'Custom Key (Active)' : 'Demo Key (Active)')
                      : 'No Key Configured'}
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-500 truncate">
                  {formatMaskedKey(apiKey)}
                </div>
              </div>

              {/* Get Demo Key Link */}
              <div className="pt-0.5">
                <a
                  href="https://mapsplatform.google.com/maps-demo-key"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                >
                  <span>Get your free Google Maps Demo Key</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* Input Section */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Enter your Key
                </label>
                <input
                  type="text"
                  value={keyInputValue}
                  onChange={(e) => setKeyInputValue(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-4 py-2.5 rounded-2xl border border-slate-300 font-mono text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all"
                />
              </div>

              {/* Action Button */}
              <div className="pt-2">
                <button
                  onClick={handleSaveApiKey}
                  className="w-full py-3 px-4 rounded-2xl font-semibold text-xs text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Save & Reload</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* PREFERRED PLACES MODAL OVERLAY */}
      <AnimatePresence>
        {showPreferredListModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className={`w-full max-w-lg rounded-2xl shadow-2xl border overflow-hidden flex flex-col max-h-[85vh] ${
                isDarkControls
                  ? 'bg-[#181a1d] text-white border-white/15 shadow-black/80'
                  : 'bg-white text-slate-900 border-slate-200 shadow-xl'
              }`}
            >
              {/* Modal Header */}
              <div className={`p-4 border-b flex items-center justify-between ${
                isDarkControls ? 'border-white/10 bg-white/5' : 'border-slate-100 bg-slate-50/70'
              }`}>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
                    <BookmarkCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
                      Places Explorer
                    </h3>
                    <p className={`text-[11px] ${isDarkControls ? 'text-slate-400' : 'text-slate-500'}`}>
                      Powered by Google Places UI Kit Advanced Place List
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowPreferredListModal(false)}
                    className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                      isDarkControls
                        ? 'hover:bg-white/10 text-slate-400 hover:text-white'
                        : 'hover:bg-slate-200/80 text-slate-500 hover:text-slate-900'
                    }`}
                    title="Close"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* View Switcher Tabs: Preferred vs City Landmarks */}
              <div className={`flex items-center p-1.5 border-b gap-1 text-xs ${
                isDarkControls ? 'border-white/10 bg-black/20' : 'border-slate-100 bg-slate-100/60'
              }`}>
                <button
                  type="button"
                  onClick={() => setPlacesModalTab('preferred')}
                  className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    placesModalTab === 'preferred'
                      ? isDarkControls
                        ? 'bg-cyan-600 text-white shadow-xs font-semibold'
                        : 'bg-white text-slate-900 shadow-xs font-semibold'
                      : isDarkControls
                        ? 'text-slate-400 hover:text-slate-200'
                        : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>⭐ Preferred Places</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    placesModalTab === 'preferred'
                      ? 'bg-black/25 text-white'
                      : 'bg-slate-500/20 text-slate-400'
                  }`}>
                    {preferredPlaces.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPlacesModalTab('city')}
                  className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    placesModalTab === 'city'
                      ? isDarkControls
                        ? 'bg-cyan-600 text-white shadow-xs font-semibold'
                        : 'bg-white text-slate-900 shadow-xs font-semibold'
                      : isDarkControls
                        ? 'text-slate-400 hover:text-slate-200'
                        : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>📍 {selectedCity.name} Places</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    placesModalTab === 'city'
                      ? 'bg-black/25 text-white'
                      : 'bg-slate-500/20 text-slate-400'
                  }`}>
                    {landmarksList.length}
                  </span>
                </button>
              </div>

              {/* Modal Content: Advanced Place List Web Component */}
              <div className="p-4 overflow-y-auto scrollbar-thin flex-1 min-h-[220px]">
                {placesModalTab === 'preferred' ? (
                  <div className="w-full space-y-3">
                    {/* Autocomplete Search using Google Places UI Kit Basic Autocomplete */}
                    <div className="w-full">
                      <PlacesBasicAutocomplete
                        onPlaceSelect={handleBasicAutocompleteSelect}
                        isDark={isDarkControls}
                        locationBiasCenter={{
                          lat: selectedCity.initialCam.center.lat,
                          lng: selectedCity.initialCam.center.lng,
                        }}
                      />
                    </div>

                    {/* "Tour Places" Action Hero Bar with Saved, Combined, and City Tour Options */}
                    {preferredPlaces.length > 0 && (
                      <div className={`p-2.5 rounded-xl border space-y-2 ${
                        isDarkControls
                          ? 'bg-gradient-to-r from-emerald-950/70 to-teal-950/40 border-emerald-500/30'
                          : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-xs flex items-center gap-1.5 text-emerald-400">
                            <span>⭐ Custom Itinerary</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 font-mono">
                              {preferredPlaces.length} stop{preferredPlaces.length > 1 ? 's' : ''} saved
                            </span>
                          </div>
                          <span className={`text-[10.5px] ${isDarkControls ? 'text-slate-400' : 'text-slate-600'}`}>
                            Mode: <span className="font-semibold text-cyan-400">{placesListMode.toUpperCase()}</span>
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          <button
                            type="button"
                            onClick={() => startPreferredTour(0)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                            title="Tour exclusively your saved places"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Tour Saved ({preferredPlaces.length})</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => startCombinedTour(0)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                            title="Tour combined itinerary: default city places + saved places"
                          >
                            <Globe className="w-3 h-3" />
                            <span>Tour All ({getCityConfig(selectedCityId).landmarks.length + preferredPlaces.length})</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => startCityTour(0)}
                            className={`px-2 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all ${
                              isDarkControls
                                ? 'bg-white/10 hover:bg-white/15 text-slate-200'
                                : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                            }`}
                            title={`Tour only ${selectedCity.name} landmarks`}
                          >
                            <span>🏛️ City ({getCityConfig(selectedCityId).landmarks.length})</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {preferredPlaces.length === 0 ? (
                      <div className="text-center py-8 px-4">
                        <div className="w-12 h-12 rounded-2xl bg-slate-500/10 text-slate-400 flex items-center justify-center mx-auto mb-3">
                          <BookmarkCheck className="w-6 h-6" />
                        </div>
                        <h4 className="font-bold text-sm mb-1">No Preferred Places Yet</h4>
                        <p className={`text-xs max-w-xs mx-auto leading-relaxed mb-4 ${isDarkControls ? 'text-slate-400' : 'text-slate-500'}`}>
                          Use the search field above to search for any place, or click the tickbox <span className="font-semibold text-emerald-400">☑️</span> on any place details card to build your custom itinerary.
                        </p>
                        <button
                          type="button"
                          onClick={() => setPlacesModalTab('city')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs cursor-pointer transition-colors"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span>Browse {selectedCity.name} Landmarks</span>
                        </button>
                      </div>
                    ) : (
                      <div className="w-full space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                          <span>{preferredPlaces.length} saved stop{preferredPlaces.length > 1 ? 's' : ''} in your itinerary:</span>
                          <button
                            type="button"
                            onClick={clearPreferredPlaces}
                            className="text-slate-400 hover:text-rose-400 transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Clear all</span>
                          </button>
                        </div>

                        {/* List of Preferred Places rendered using Google Places UI Kit Advanced Place Details */}
                        <div className="space-y-2.5 py-1">
                          {preferredPlaces.map((item, idx) => (
                            <div
                              key={`${item.id}-${item.placeId}`}
                              className={`w-full p-2 rounded-xl border flex items-center justify-between gap-2.5 cursor-pointer transition-all ${
                                isDarkControls
                                  ? 'bg-black/40 border-white/10 hover:border-cyan-500/40 hover:bg-white/5'
                                  : 'bg-slate-50 border-slate-200 hover:border-cyan-400 hover:bg-white'
                              }`}
                              onClick={() => {
                                setShowPreferredListModal(false);
                                setPlacesListMode('preferred');
                                const prefLm = preferredPlaceToLandmark(item, idx);
                                if (selectAndFlyToLandmarkRef.current) {
                                  selectAndFlyToLandmarkRef.current(prefLm);
                                }
                                setShowMobilePlaceModal(true);
                              }}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-xs font-bold shrink-0 self-center">
                                  {idx + 1}
                                </span>
                                <div className="min-w-0 flex-1 pointer-events-none">
                                  <PlacesErrorBoundary
                                    fallback={
                                      <div className="py-1">
                                        <div className="font-bold text-xs sm:text-sm truncate">{item.name}</div>
                                        <div className="text-[10px] text-slate-400 truncate">{item.cityName || item.description}</div>
                                      </div>
                                    }
                                  >
                                    <gmp-advanced-place-details-compact
                                      key={`pref-item-${item.placeId}`}
                                      orientation="HORIZONTAL"
                                      truncation-preferred=""
                                      style={{
                                        width: '100%',
                                        minHeight: '65px',
                                        padding: 0,
                                        margin: 0,
                                        border: 'none',
                                        backgroundColor: 'transparent',
                                        colorScheme: isDarkControls ? 'dark' : 'light',
                                        '--gmp-details-background': 'transparent',
                                        '--gmp-details-color': isDarkControls ? '#f1f5f9' : '#0f172a',
                                      } as React.CSSProperties}
                                    >
                                      <gmp-place-details-place-request
                                        place={item.placeId.startsWith('places/') ? item.placeId : `places/${item.placeId}`}
                                      />
                                      <gmp-place-media lightbox-preferred="true" />
                                      <gmp-place-name />
                                      <gmp-place-rating />
                                      <gmp-place-address />
                                      <gmp-place-attribution
                                        light-scheme-color={isDarkControls ? 'WHITE' : 'BLACK'}
                                        dark-scheme-color="GRAY"
                                      />
                                    </gmp-advanced-place-details-compact>
                                  </PlacesErrorBoundary>
                                </div>
                              </div>

                              {/* Right Actions: Dedicated Clear Button on the Right */}
                              <div className="flex items-center gap-1 shrink-0 self-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removePreferredPlace(item.id, item.placeId);
                                  }}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                  title={`Remove ${item.name} from preferred places`}
                                  aria-label={`Remove ${item.name} from preferred places`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowPreferredListModal(false);
                                    setPlacesListMode('preferred');
                                    const prefLm = preferredPlaceToLandmark(item, idx);
                                    if (selectAndFlyToLandmarkRef.current) {
                                      selectAndFlyToLandmarkRef.current(prefLm);
                                    }
                                    setShowMobilePlaceModal(true);
                                  }}
                                  className="p-1.5 rounded-lg text-cyan-400 hover:bg-cyan-500/10 transition-colors cursor-pointer"
                                  title="Fly to this place"
                                >
                                  <Navigation className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full">
                    <PlacesErrorBoundary
                      key={`err-city-list-${selectedCityId}`}
                      fallback={
                        <div className="space-y-2 py-2">
                          {landmarksList.map((loc, idx) => (
                            <button
                              key={loc.id}
                              onClick={() => {
                                selectAndFlyToLandmark(loc);
                                setShowPreferredListModal(false);
                                setShowMobilePlaceModal(true);
                              }}
                              className={`w-full text-left p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                                isDarkControls ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-xs sm:text-sm truncate">#{idx + 1} {loc.name}</div>
                                <div className="text-[11px] text-slate-400 truncate">{loc.category || selectedCity.name}</div>
                              </div>
                              <Navigation className="w-4 h-4 text-cyan-400 shrink-0" />
                            </button>
                          ))}
                        </div>
                      }
                    >
                      <PlacesAdvancedList
                        places={landmarksList.map((l) => l.placeId)}
                        isDark={isDarkControls}
                        onPlaceSelect={handlePlaceSelect}
                      />
                    </PlacesErrorBoundary>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className={`p-3 border-t flex items-center justify-between text-xs ${
                isDarkControls ? 'border-white/10 bg-white/5' : 'border-slate-100 bg-slate-50/70'
              }`}>
                <span className="flex items-center gap-1.5 text-[11px] text-cyan-400 font-medium">
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Click any place to fly 3D camera to location</span>
                </span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
