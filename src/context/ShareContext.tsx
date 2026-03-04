import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useShareIntentContext } from 'expo-share-intent';
import { extractPlaceFromURL } from '../services/shareExtractionService';
import * as GooglePlacesService from '../services/googlePlacesService';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useToast } from './ToastContext';
import { AuthContext } from './AuthContext';
import { navigationRef, navigateToSearch } from '../navigation/navigationRef';
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
  const isOnline = useNetworkStatus();
  const { showToast } = useToast();
  const { isAuthenticated, isLoading: isAuthLoading } = useContext(AuthContext);
  const extractingUrlRef = useRef<string | null>(null);

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
    if (!isOnline) {
      setExtractionError("You're offline. Share extraction unavailable.");
      showToast({ text: "You're offline. Share extraction unavailable.", type: 'error' });
      return;
    }
    setIsExtracting(true);
    setExtractionError(null);
    setPendingPlace(null);
    showToast({ text: 'Extracting place from link...', type: 'info' });

    try {
      const searchResult = await extractPlaceFromURL(url);

      if (!searchResult) {
        setExtractionError("Couldn't find a place from that link.");
        showToast({ text: "Couldn't find a place from that link.", type: 'error' });
        return;
      }

      const details = await GooglePlacesService.getPlaceDetails(searchResult.id);
      setPendingPlace(details);
    } catch (error) {
      console.warn('[Share] Test extraction failed:', error);
      setExtractionError("Something went wrong extracting the place.");
      showToast({ text: "Something went wrong extracting the place.", type: 'error' });
    } finally {
      setIsExtracting(false);
    }
  }, [isOnline, showToast]);

  useEffect(() => {
    if (!hasShareIntent) return;
    // Wait for auth to finish loading before attempting extraction
    if (isAuthLoading || !isAuthenticated) return;

    const url = shareIntent.webUrl ?? (shareIntent.text ? extractURLFromText(shareIntent.text) : null);

    if (!url) {
      setExtractionError('No URL found in the shared content.');
      showToast({ text: 'No URL found in the shared content.', type: 'error' });
      return;
    }

    // Prevent duplicate extraction for the same URL
    if (extractingUrlRef.current === url) return;
    extractingUrlRef.current = url;

    if (!isOnline) {
      extractingUrlRef.current = null;
      setExtractionError("You're offline. Share extraction unavailable.");
      showToast({ text: "You're offline. Share extraction unavailable.", type: 'error' });
      return;
    }

    let cancelled = false;

    async function extract() {
      setIsExtracting(true);
      setExtractionError(null);
      setPendingPlace(null);
      showToast({ text: 'Extracting place from link...', type: 'info' });

      try {
        const searchResult = await extractPlaceFromURL(url!);
        if (cancelled) return;

        if (!searchResult) {
          setExtractionError("Couldn't find a place from that link.");
          showToast({ text: "Couldn't find a place from that link.", type: 'error' });
          return;
        }

        const details = await GooglePlacesService.getPlaceDetails(searchResult.id);
        if (cancelled) return;

        setPendingPlace(details);
      } catch (error) {
        if (cancelled) return;
        console.warn('[Share] Extraction failed:', error);
        setExtractionError("Something went wrong extracting the place.");
        showToast({ text: "Something went wrong extracting the place.", type: 'error' });
      } finally {
        if (!cancelled) {
          setIsExtracting(false);
          extractingUrlRef.current = null;
        }
      }
    }

    extract();

    return () => {
      cancelled = true;
      extractingUrlRef.current = null;
    };
  }, [hasShareIntent, shareIntent, isOnline, isAuthLoading, isAuthenticated, showToast]);

  // Auto-navigate to SearchScreen when a place is extracted
  useEffect(() => {
    if (!pendingPlace) return;
    if (navigationRef.isReady()) {
      navigateToSearch();
      return;
    }
    // Cold start: poll until navigator is ready
    const interval = setInterval(() => {
      if (navigationRef.isReady()) {
        navigateToSearch();
        clearInterval(interval);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [pendingPlace]);

  return (
    <ShareContext.Provider value={{ pendingPlace, isExtracting, extractionError, clearShare, testExtract }}>
      {children}
    </ShareContext.Provider>
  );
}
