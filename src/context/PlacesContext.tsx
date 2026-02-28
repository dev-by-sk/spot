import React, { createContext, useState, useCallback, useRef, useEffect } from 'react';
import * as Crypto from 'expo-crypto';
import * as GooglePlacesService from '../services/googlePlacesService';
import * as SupabaseService from '../services/supabaseService';
import {
  upsertLocalPlaceCache,
  insertLocalSavedPlace,
  deleteLocalSavedPlace,
  markPendingDeletion,
  clearPendingDeletion,
  updateLocalSavedPlaceNote,
  isDuplicatePlace,
} from '../db/database';
import { useSavedPlaces } from '../db/useSavedPlaces';
import { analytics, AnalyticsEvent } from '../services/analyticsService';
import { requestLocationPermission, getCurrentLocation } from '../services/locationService';
import { pullFromRemote, pushToRemote } from '../services/syncService';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import type {
  PlaceSearchResult,
  PlaceCacheDTO,
  SavedPlaceLocal,
  PlaceCategory,
} from '../types';
import { SpotError } from '../types';

export interface PlacesContextValue {
  // Network
  isOnline: boolean;

  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchResults: PlaceSearchResult[];
  isSearching: boolean;
  search: (query: string) => Promise<void>;
  getPlaceDetails: (placeId: string) => Promise<PlaceCacheDTO | null>;

  // Saved places
  savedPlaces: SavedPlaceLocal[];
  isLoadingPlaces: boolean;
  refreshPlaces: (userId: string) => Promise<void>;
  savePlace: (dto: PlaceCacheDTO, note: string, userId: string, dateVisited?: string | null) => Promise<void>;
  deletePlaceById: (id: string, placeName: string) => Promise<void>;
  updateNote: (id: string, note: string, placeName: string, dateVisited?: string | null) => Promise<void>;

  // Filter
  selectedFilter: PlaceCategory | null;
  setSelectedFilter: (f: PlaceCategory | null) => void;

  // Sync
  isSyncing: boolean;
  syncPlaces: (userId: string) => Promise<void>;

  // Error
  errorMessage: string | null;
}

export const PlacesContext = createContext<PlacesContextValue>({
  isOnline: true,
  searchQuery: '',
  setSearchQuery: () => {},
  searchResults: [],
  isSearching: false,
  search: async () => {},
  getPlaceDetails: async () => null,
  savedPlaces: [],
  isLoadingPlaces: false,
  refreshPlaces: async () => {},
  savePlace: async () => {},
  deletePlaceById: async () => {},
  updateNote: async () => {},
  selectedFilter: null,
  setSelectedFilter: () => {},
  isSyncing: false,
  syncPlaces: async () => {},
  errorMessage: null,
});

export function PlacesProvider({ children }: { children: React.ReactNode }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFilter, setSelectedFilterState] = useState<PlaceCategory | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const isOnline = useNetworkStatus();
  const { places: savedPlaces, isLoading: isLoadingPlaces, refresh: refreshPlaces } = useSavedPlaces();
  const currentUserIdRef = useRef<string | null>(null);
  const isSyncInProgressRef = useRef(false);
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    (async () => {
      const granted = await requestLocationPermission();
      if (!granted) return;
      const location = await getCurrentLocation();
      if (location) {
        userLocationRef.current = {
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        };
      }
    })();
  }, []);

  const setSelectedFilter = useCallback((f: PlaceCategory | null) => {
    setSelectedFilterState(f);
    if (f) {
      analytics.track(AnalyticsEvent.FilterUsed, { category: f });
    }
  }, []);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    if (!isOnline) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await GooglePlacesService.autocomplete(
        query,
        userLocationRef.current?.lat,
        userLocationRef.current?.lng,
      );
      setSearchResults(results);
      analytics.track(AnalyticsEvent.SearchPerformed, {
        query,
        result_count: results.length,
      });
    } catch (error: any) {
      console.log('[Search] Error:', error.message ?? error);
      setErrorMessage(error.message ?? 'Search failed');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [isOnline]);

  const getPlaceDetails = useCallback(async (placeId: string): Promise<PlaceCacheDTO | null> => {
    if (!isOnline) {
      setErrorMessage("You're offline. Place details unavailable.");
      return null;
    }
    try {
      const details = await GooglePlacesService.getPlaceDetails(placeId);
      analytics.track(AnalyticsEvent.SearchResultTapped, {
        place_name: details.name,
        category: details.category,
      });
      return details;
    } catch (error: any) {
      setErrorMessage(error.message ?? 'Failed to load place details');
      return null;
    }
  }, [isOnline]);

  const savePlace = useCallback(
    async (dto: PlaceCacheDTO, note: string, userId: string, dateVisited?: string | null) => {
      // Check for duplicate
      const duplicate = await isDuplicatePlace(userId, dto.google_place_id);
      if (duplicate) {
        analytics.track(AnalyticsEvent.DuplicateBlocked, { place_name: dto.name });
        throw SpotError.duplicatePlace();
      }

      const placeId = Crypto.randomUUID();
      const now = new Date().toISOString();

      // Insert cache locally
      await upsertLocalPlaceCache(dto);

      // Insert saved place locally
      await insertLocalSavedPlace({
        id: placeId,
        user_id: userId,
        google_place_id: dto.google_place_id,
        note_text: note,
        date_visited: dateVisited ?? null,
        saved_at: now,
      });

      analytics.track(AnalyticsEvent.PlaceSaved, {
        place_name: dto.name,
        category: dto.category,
        cuisine: dto.cuisine,
        has_note: note.length > 0,
      });

      // Refresh local list
      await refreshPlaces(userId);

      // Async push to Supabase
      try {
        await SupabaseService.upsertPlaceCache(dto);
        await SupabaseService.uploadSavedPlace({
          id: placeId,
          user_id: userId,
          google_place_id: dto.google_place_id,
          note_text: note,
          date_visited: dateVisited ?? null,
          saved_at: now,
        });
      } catch (error) {
        console.warn('[Sync] Background save push failed:', error);
      }
    },
    [refreshPlaces],
  );

  const deletePlaceById = useCallback(
    async (id: string, placeName: string) => {
      await deleteLocalSavedPlace(id);
      await markPendingDeletion(id);

      analytics.track(AnalyticsEvent.PlaceDeleted, { place_name: placeName });

      // Refresh local list
      if (currentUserIdRef.current) {
        await refreshPlaces(currentUserIdRef.current);
      }

      // Async delete from Supabase — clear pending deletion only on success
      try {
        await SupabaseService.deleteSavedPlace(id);
        await clearPendingDeletion(id);
      } catch (error) {
        console.warn('[Sync] Background delete push failed — will retry on reconnect:', error);
      }
    },
    [refreshPlaces],
  );

  const updateNote = useCallback(
    async (id: string, note: string, placeName: string, dateVisited?: string | null) => {
      await updateLocalSavedPlaceNote(id, note, dateVisited);

      analytics.track(AnalyticsEvent.NoteEdited, { place_name: placeName });

      // Refresh local list
      if (currentUserIdRef.current) {
        await refreshPlaces(currentUserIdRef.current);
      }

      // Async update on Supabase
      try {
        await SupabaseService.updateSavedPlaceNote(id, note, dateVisited);
      } catch (error) {
        console.warn('[Sync] Background note update push failed:', error);
      }
    },
    [refreshPlaces],
  );

  const syncPlaces = useCallback(
    async (userId: string) => {
      if (isSyncInProgressRef.current) return;
      isSyncInProgressRef.current = true;
      currentUserIdRef.current = userId;
      setIsSyncing(true);
      try {
        await pushToRemote(userId, isOnline);
        await pullFromRemote(userId, isOnline);
        await refreshPlaces(userId);
        analytics.track(AnalyticsEvent.SyncCompleted);
      } finally {
        setIsSyncing(false);
        isSyncInProgressRef.current = false;
      }
    },
    [isOnline, refreshPlaces],
  );

  // Auto-sync when connectivity is restored (silent — no isSyncing UI indicator)
  const prevIsOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !prevIsOnlineRef.current && currentUserIdRef.current) {
      if (isSyncInProgressRef.current) return;
      isSyncInProgressRef.current = true;
      const userId = currentUserIdRef.current;
      pushToRemote(userId, true)
        .then(() => pullFromRemote(userId, true))
        .then(() => refreshPlaces(userId))
        .catch((err) => console.warn('[Sync] Reconnect sync failed:', err))
        .finally(() => { isSyncInProgressRef.current = false; });
    }
    prevIsOnlineRef.current = isOnline;
  }, [isOnline, refreshPlaces]);

  return (
    <PlacesContext.Provider
      value={{
        isOnline,
        searchQuery,
        setSearchQuery,
        searchResults,
        isSearching,
        search,
        getPlaceDetails,
        savedPlaces,
        isLoadingPlaces,
        refreshPlaces,
        savePlace,
        deletePlaceById,
        updateNote,
        selectedFilter,
        setSelectedFilter,
        isSyncing,
        syncPlaces,
        errorMessage,
      }}
    >
      {children}
    </PlacesContext.Provider>
  );
}
