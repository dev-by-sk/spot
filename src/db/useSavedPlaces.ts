import { useState, useCallback } from 'react';
import { fetchLocalSavedPlaces } from './database';
import type { SavedPlaceLocal } from '../types';

interface UseSavedPlacesReturn {
  places: SavedPlaceLocal[];
  isLoading: boolean;
  refresh: (userId: string) => Promise<void>;
}

export function useSavedPlaces(): UseSavedPlacesReturn {
  const [state, setState] = useState<{ places: SavedPlaceLocal[]; isLoading: boolean }>({
    places: [],
    isLoading: true,
  });

  const refresh = useCallback(async (userId: string) => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const rows = await fetchLocalSavedPlaces(userId);
      setState({ places: rows, isLoading: false });
    } catch {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  return { places: state.places, isLoading: state.isLoading, refresh };
}
