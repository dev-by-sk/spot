/**
 * Tests for PlacesContext.tsx
 *
 * Targets bugs from docs/test-scenarios.md:
 * - 7.1.3 [BUG] TOCTOU race — concurrent saves bypass duplicate check
 *   (PlacesContext.tsx:204-219)
 * - 7.2.2 [BUG] deletePlaceById doesn't refresh UI when currentUserIdRef is null
 *   (PlacesContext.tsx:264-266)
 * - 7.3.2 [BUG] updateNote doesn't refresh UI when currentUserIdRef is null
 *   (PlacesContext.tsx:293-295)
 */
import React from "react";
import { renderHook, act } from "@testing-library/react-native";
import { PlacesProvider, PlacesContext } from "../../src/context/PlacesContext";

// ── Mocks ──

const mockRefreshPlaces = jest.fn().mockResolvedValue(undefined);

jest.mock("../../src/db/useSavedPlaces", () => ({
  useSavedPlaces: () => ({
    places: [],
    isLoading: false,
    refresh: mockRefreshPlaces,
  }),
}));

const mockDeleteLocalSavedPlace = jest.fn().mockResolvedValue(undefined);
const mockMarkPendingDeletion = jest.fn().mockResolvedValue(undefined);
const mockUpdateLocalSavedPlaceNote = jest.fn().mockResolvedValue(undefined);
const mockIsDuplicatePlace = jest.fn().mockResolvedValue(false);
const mockUpsertLocalPlaceCache = jest.fn().mockResolvedValue(undefined);
const mockInsertLocalSavedPlace = jest.fn().mockResolvedValue(undefined);

jest.mock("../../src/db/database", () => ({
  deleteLocalSavedPlace: (...args: any[]) => mockDeleteLocalSavedPlace(...args),
  markPendingDeletion: (...args: any[]) => mockMarkPendingDeletion(...args),
  updateLocalSavedPlaceNote: (...args: any[]) =>
    mockUpdateLocalSavedPlaceNote(...args),
  isDuplicatePlace: (...args: any[]) => mockIsDuplicatePlace(...args),
  upsertLocalPlaceCache: (...args: any[]) => mockUpsertLocalPlaceCache(...args),
  insertLocalSavedPlace: (...args: any[]) => mockInsertLocalSavedPlace(...args),
  clearPendingDeletion: jest.fn().mockResolvedValue(undefined),
}));

const mockGetCurrentSession = jest.fn().mockResolvedValue({
  userId: "session-user-1",
  email: "test@example.com",
  provider: "google",
});

jest.mock("../../src/services/supabaseService", () => ({
  getCurrentSession: (...args: any[]) => mockGetCurrentSession(...args),
  deleteSavedPlace: jest.fn().mockResolvedValue(undefined),
  updateSavedPlaceNote: jest.fn().mockResolvedValue(undefined),
  upsertPlaceCache: jest.fn().mockResolvedValue(undefined),
  uploadSavedPlace: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/services/syncService", () => ({
  pullFromRemote: jest.fn().mockResolvedValue(undefined),
  pushToRemote: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/services/googlePlacesService", () => ({
  autocomplete: jest.fn().mockResolvedValue([]),
  getPlaceDetails: jest.fn().mockResolvedValue({}),
}));

jest.mock("../../src/services/analyticsService", () => ({
  analytics: { track: jest.fn() },
  AnalyticsEvent: {
    PlaceDeleted: "place_deleted",
    NoteEdited: "note_edited",
    PlaceSaved: "place_saved",
    DuplicateBlocked: "duplicate_blocked",
    SearchPerformed: "search_performed",
    SearchResultTapped: "search_result_tapped",
    SyncCompleted: "sync_completed",
    FilterUsed: "filter_used",
  },
}));

jest.mock("../../src/services/locationService", () => ({
  requestLocationPermission: jest.fn().mockResolvedValue(false),
  getCurrentLocation: jest.fn().mockResolvedValue(null),
}));

jest.mock("../../src/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => true,
}));

jest.mock("../../src/context/ToastContext", () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
}));

// ── Helpers ──

function useContextValue() {
  return React.useContext(PlacesContext);
}

function renderPlacesHook() {
  return renderHook(() => useContextValue(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <PlacesProvider>{children}</PlacesProvider>
    ),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("PlacesContext", () => {
  /**
   * Scenario 7.2.2 — [FIXED] deletePlaceById refreshes even before first sync
   *
   * Previously, currentUserIdRef was only set in syncPlaces(), so deletePlaceById
   * skipped refreshPlaces if no sync had occurred. Now it falls back to looking
   * up the userId from the Supabase session.
   */
  it("7.2.2: deletePlaceById calls refreshPlaces even without prior sync (via session fallback)", async () => {
    const { result } = renderPlacesHook();

    // Delete without calling syncPlaces first (currentUserIdRef is null)
    await act(async () => {
      await result.current.deletePlaceById("place-1", "Test Place");
    });

    // Local delete and pending mark happen correctly
    expect(mockDeleteLocalSavedPlace).toHaveBeenCalledWith("place-1");
    expect(mockMarkPendingDeletion).toHaveBeenCalledWith("place-1");

    // FIXED: refreshPlaces IS called using the userId from getCurrentSession()
    expect(mockRefreshPlaces).toHaveBeenCalledWith("session-user-1");
  });

  /**
   * Verify that deletePlaceById DOES call refreshPlaces after syncPlaces sets the ref.
   */
  it("7.2.2 (control): deletePlaceById refreshes after syncPlaces has been called", async () => {
    const { result } = renderPlacesHook();

    // First sync sets currentUserIdRef
    await act(async () => {
      await result.current.syncPlaces("user-123");
    });

    mockRefreshPlaces.mockClear();

    // Now delete — should refresh
    await act(async () => {
      await result.current.deletePlaceById("place-1", "Test Place");
    });

    expect(mockRefreshPlaces).toHaveBeenCalledWith("user-123");
  });

  /**
   * Scenario 7.3.2 — [FIXED] updateNote refreshes even before first sync
   *
   * Same fix as 7.2.2: falls back to session userId when currentUserIdRef is null.
   */
  it("7.3.2: updateNote calls refreshPlaces even without prior sync (via session fallback)", async () => {
    const { result } = renderPlacesHook();

    // Update note without prior sync
    await act(async () => {
      await result.current.updateNote("place-1", "Great food!", "Test Place");
    });

    // Local update happens
    expect(mockUpdateLocalSavedPlaceNote).toHaveBeenCalledWith(
      "place-1",
      "Great food!",
      undefined,
    );

    // FIXED: refreshPlaces IS called using the userId from getCurrentSession()
    expect(mockRefreshPlaces).toHaveBeenCalledWith("session-user-1");
  });

  /**
   * Verify that updateNote DOES call refreshPlaces after syncPlaces sets the ref.
   */
  it("7.3.2 (control): updateNote refreshes after syncPlaces has been called", async () => {
    const { result } = renderPlacesHook();

    // First sync
    await act(async () => {
      await result.current.syncPlaces("user-123");
    });

    mockRefreshPlaces.mockClear();

    // Now update note — should refresh
    await act(async () => {
      await result.current.updateNote("place-1", "Great food!", "Test Place");
    });

    expect(mockRefreshPlaces).toHaveBeenCalledWith("user-123");
  });

  /**
   * Scenario 7.1.3 — [FIXED] TOCTOU race prevented by in-progress guard
   *
   * savePlace now uses a Set-based mutex keyed on google_place_id.
   * The second concurrent save for the same place is immediately rejected
   * with SpotError.duplicatePlace() before it can reach isDuplicatePlace.
   */
  it("7.1.3: concurrent savePlace calls — second is blocked by in-progress guard", async () => {
    const mockUploadSavedPlace =
      require("../../src/services/supabaseService").uploadSavedPlace;

    // isDuplicatePlace returns false (place not in DB yet)
    mockIsDuplicatePlace.mockResolvedValue(false);

    const { result } = renderPlacesHook();

    const dto = {
      google_place_id: "ChIJ123",
      name: "Test Cafe",
      address: "123 Main St",
      lat: 40.7,
      lng: -74.0,
      rating: 4.5,
      price_level: 2,
      category: "Restaurant",
      cuisine: "Italian",
      last_refreshed: new Date().toISOString(),
    };

    // Fire two concurrent saves for the SAME place
    const results = await act(async () => {
      return Promise.allSettled([
        result.current.savePlace(dto, "First note", "user-1", null),
        result.current.savePlace(dto, "Second note", "user-1", null),
      ]);
    });

    // FIXED: One succeeds, one is rejected with duplicatePlace error
    const fulfilled = results.filter((r: any) => r.status === "fulfilled");
    const rejected = results.filter((r: any) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as any).reason.code).toBe("DUPLICATE_PLACE");

    // Only ONE call made it through to isDuplicatePlace and insert
    expect(mockIsDuplicatePlace).toHaveBeenCalledTimes(1);
    expect(mockInsertLocalSavedPlace).toHaveBeenCalledTimes(1);

    // Only ONE push to Supabase
    expect(mockUploadSavedPlace).toHaveBeenCalledTimes(1);
  });
});
