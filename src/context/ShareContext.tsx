import React, {
  createContext,
  useContext,
  useState,
  useCallback,
} from "react";
import { extractPlaceFromURL } from "../services/shareExtractionService";
import * as GooglePlacesService from "../services/googlePlacesService";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { useToast } from "./ToastContext";
import type { PlaceCacheDTO } from "../types";

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

export function ShareProvider({ children }: { children: React.ReactNode }) {
  const isOnline = useNetworkStatus();
  const { showToast } = useToast();

  const [pendingPlace, setPendingPlace] = useState<PlaceCacheDTO | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  const clearShare = useCallback(() => {
    setPendingPlace(null);
    setIsExtracting(false);
    setExtractionError(null);
  }, []);

  const testExtract = useCallback(
    async (url: string) => {
      if (!isOnline) {
        setExtractionError("You're offline — can't find spots right now");
        showToast({
          text: "You're offline — can't find spots right now",
          type: "error",
        });
        return;
      }
      setIsExtracting(true);
      setExtractionError(null);
      setPendingPlace(null);
      showToast({ text: "Finding spot", type: "info" });

      try {
        const searchResult = await extractPlaceFromURL(url);

        if (!searchResult) {
          setExtractionError("Couldn't find a spot from that link");
          showToast({
            text: "Couldn't find a spot from that link",
            type: "error",
          });
          return;
        }

        const details = await GooglePlacesService.getPlaceDetails(
          searchResult.id,
        );
        setPendingPlace(details);
      } catch (error) {
        console.warn("[Share] Test extraction failed:", error);
        setExtractionError("Something went wrong, try again");
        showToast({
          text: "Something went wrong, try again",
          type: "error",
        });
      } finally {
        setIsExtracting(false);
      }
    },
    [isOnline, showToast],
  );

  return (
    <ShareContext.Provider
      value={{
        pendingPlace,
        isExtracting,
        extractionError,
        clearShare,
        testExtract,
      }}
    >
      {children}
    </ShareContext.Provider>
  );
}
