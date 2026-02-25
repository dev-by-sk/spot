import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useShareIntentContext } from 'expo-share-intent';
import { extractPlaceFromURL } from '../services/shareExtractionService';
import * as GooglePlacesService from '../services/googlePlacesService';
import type { PlaceCacheDTO } from '../types';

interface ShareContextState {
  pendingPlace: PlaceCacheDTO | null;
  isExtracting: boolean;
  extractionError: string | null;
  clearShare: () => void;
  testExtract: (url: string) => void;
}

const ShareContext = createContext<ShareContextState>({
  pendingPlace: null,
  isExtracting: false,
  extractionError: null,
  clearShare: () => {},
  testExtract: () => {},
});

export function useShare() {
  return useContext(ShareContext);
}

function extractURLFromText(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

export function ShareProvider({ children }: { children: React.ReactNode }) {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  const [pendingPlace, setPendingPlace] = useState<PlaceCacheDTO | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  const clearShare = useCallback(() => {
    setPendingPlace(null);
    setIsExtracting(false);
    setExtractionError(null);
    resetShareIntent();
  }, [resetShareIntent]);

  const testExtract = useCallback(async (url: string) => {
    setIsExtracting(true);
    setExtractionError(null);
    setPendingPlace(null);

    try {
      const searchResult = await extractPlaceFromURL(url);

      if (!searchResult) {
        setExtractionError("Couldn't find a place from that link.");
        return;
      }

      const details = await GooglePlacesService.getPlaceDetails(searchResult.id);
      setPendingPlace(details);
    } catch (error) {
      console.warn('[Share] Test extraction failed:', error);
      setExtractionError("Something went wrong extracting the place.");
    } finally {
      setIsExtracting(false);
    }
  }, []);

  useEffect(() => {
    if (!hasShareIntent) return;

    const url = shareIntent.webUrl ?? (shareIntent.text ? extractURLFromText(shareIntent.text) : null);

    if (!url) {
      setExtractionError('No URL found in the shared content.');
      return;
    }

    let cancelled = false;

    async function extract() {
      setIsExtracting(true);
      setExtractionError(null);
      setPendingPlace(null);

      try {
        const searchResult = await extractPlaceFromURL(url!);
        if (cancelled) return;

        if (!searchResult) {
          setExtractionError("Couldn't find a place from that link.");
          return;
        }

        const details = await GooglePlacesService.getPlaceDetails(searchResult.id);
        if (cancelled) return;

        setPendingPlace(details);
      } catch (error) {
        if (cancelled) return;
        console.warn('[Share] Extraction failed:', error);
        setExtractionError("Something went wrong extracting the place.");
      } finally {
        if (!cancelled) setIsExtracting(false);
      }
    }

    extract();

    return () => {
      cancelled = true;
    };
  }, [hasShareIntent, shareIntent]);

  return (
    <ShareContext.Provider value={{ pendingPlace, isExtracting, extractionError, clearShare, testExtract }}>
      {children}
    </ShareContext.Provider>
  );
}
