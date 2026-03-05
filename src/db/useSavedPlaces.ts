import { useState, useCallback, useRef } from 'react';
import { fetchLocalSavedPlaces } from './database';
import type { SavedPlaceLocal } from '../types';

interface UseSavedPlacesReturn {
  places: SavedPlaceLocal[];
  isLoading: boolean;
  refresh: (userId: string) => Promise<void>;
}

export function useSavedPlaces(): UseSavedPlacesReturn {
  const [places, setPlaces] = useState<SavedPlaceLocal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedOnce = useRef(false);

  const refresh = useCallback(async (userId: string) => {
    if (!hasLoadedOnce.current) {
      setIsLoading(true);
    }
    try {
      const rows = await fetchLocalSavedPlaces(userId);
      setPlaces(rows);
      hasLoadedOnce.current = true;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { places, isLoading, refresh };
}
