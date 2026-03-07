/**
 * Tests for SearchScreen.tsx
 *
 * Covers high-severity bugs from docs/test-scenarios.md:
 * - 8.3.1 [BUG] getPlaceDetails returns null — silent failure, no error shown
 *   (SearchScreen.tsx:104-109)
 * - 8.3.2 [FIXED] getPlaceDetails throws — loadingItemId now reset via try/finally
 *   (SearchScreen.tsx:100-112)
 */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { SearchScreen } from '../../src/screens/search/SearchScreen';

// ── Mocks ──

const mockGetPlaceDetails = jest.fn();
const mockSearch = jest.fn().mockResolvedValue(undefined);
const mockSavePlace = jest.fn();
const mockSetSearchQuery = jest.fn();

jest.mock('../../src/hooks/usePlaces', () => ({
  usePlaces: () => ({
    isOnline: true,
    searchQuery: 'pizza',
    setSearchQuery: mockSetSearchQuery,
    searchResults: [
      { id: 'place-1', name: 'Pizza Palace', address: '123 Main St', category: 'Restaurant' },
      { id: 'place-2', name: 'Pizza Hut', address: '456 Oak Ave', category: 'Restaurant' },
    ],
    isSearching: false,
    search: mockSearch,
    getPlaceDetails: mockGetPlaceDetails,
    savePlace: mockSavePlace,
  }),
}));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ currentUserId: 'user-123' }),
}));

// Return empty string so pendingDispatch is false (debouncedQuery.trim().length > 0 fails),
// while searchQuery ('pizza') is still truthy so FlatList renders with searchResults.
jest.mock('../../src/hooks/useDebounce', () => ({
  useDebounce: () => '',
}));

jest.mock('../../src/context/ShareContext', () => ({
  useShare: () => ({
    pendingPlace: null,
    isExtracting: false,
    extractionError: null,
    clearShare: jest.fn(),
    testExtract: jest.fn(),
  }),
}));

jest.mock('../../src/theme/colors', () => ({
  useSpotColors: () => ({
    spotBackground: '#fff',
    spotSearchBar: '#f0f0f0',
    spotTextPrimary: '#000',
    spotTextSecondary: '#666',
    spotEmerald: '#047857',
  }),
}));

jest.mock('../../src/theme/typography', () => ({
  SpotTypography: {
    body: { fontSize: 16 },
    headline: { fontSize: 18, fontWeight: '600' },
    footnote: { fontSize: 12 },
  },
}));

jest.mock('../../src/config/constants', () => ({
  SEARCH_DEBOUNCE_MS: 0,
}));

jest.mock('../../src/screens/search/SaveConfirmationModal', () => ({
  SaveConfirmationModal: () => null,
}));

beforeEach(() => {
  jest.clearAllMocks();
});

const placeDetailsResult = {
  google_place_id: 'place-2',
  name: 'Pizza Hut',
  address: '456 Oak Ave',
  lat: 40.7,
  lng: -74.0,
  rating: 3.5,
  price_level: 1,
  category: 'Restaurant',
  cuisine: 'Pizza',
  last_refreshed: new Date().toISOString(),
};

describe('SearchScreen', () => {
  /**
   * Scenario 8.3.2 — [FIXED] getPlaceDetails throws → loadingItemId reset via finally
   *
   * handleResultPress now wraps the await in try/finally, so setLoadingItemId(null)
   * always runs — even when getPlaceDetails rejects. Subsequent taps are no longer blocked.
   */
  it('8.3.2: getPlaceDetails exception resets loadingItemId (taps not blocked)', async () => {
    mockGetPlaceDetails.mockRejectedValueOnce(new Error('Network timeout'));

    const { getByText } = render(<SearchScreen />);

    // Tap first result — getPlaceDetails rejects, but catch+finally resets loadingItemId
    fireEvent.press(getByText('Pizza Palace'));
    expect(mockGetPlaceDetails).toHaveBeenCalledWith('place-1');

    // Let the rejected promise settle (catch → finally → setLoadingItemId(null))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // FIXED: second tap now works because loadingItemId was reset in finally block
    mockGetPlaceDetails.mockClear();
    mockGetPlaceDetails.mockResolvedValueOnce(placeDetailsResult);

    fireEvent.press(getByText('Pizza Hut'));

    await waitFor(() => {
      expect(mockGetPlaceDetails).toHaveBeenCalledWith('place-2');
    });
  }, 15000);

  /**
   * Scenario 8.3.1 — getPlaceDetails returns null — loadingItemId correctly reset
   */
  it('8.3.1: getPlaceDetails returning null resets loadingItemId (no permanent block)', async () => {
    mockGetPlaceDetails.mockResolvedValueOnce(null);

    const { getByText } = render(<SearchScreen />);

    fireEvent.press(getByText('Pizza Palace'));

    await waitFor(() => {
      expect(mockGetPlaceDetails).toHaveBeenCalledWith('place-1');
    });

    // After null return, loadingItemId is reset — second tap works
    mockGetPlaceDetails.mockClear();
    mockGetPlaceDetails.mockResolvedValueOnce(placeDetailsResult);

    fireEvent.press(getByText('Pizza Hut'));

    await waitFor(() => {
      expect(mockGetPlaceDetails).toHaveBeenCalledWith('place-2');
    });
  });

  /**
   * Happy path: getPlaceDetails succeeds → loadingItemId resets, modal opens
   */
  it('happy path: successful getPlaceDetails resets loading state', async () => {
    const placeDetails = {
      google_place_id: 'place-1',
      name: 'Pizza Palace',
      address: '123 Main St',
      lat: 40.7,
      lng: -74.0,
      rating: 4.5,
      price_level: 2,
      category: 'Restaurant',
      cuisine: 'Pizza',
      last_refreshed: new Date().toISOString(),
    };
    mockGetPlaceDetails.mockResolvedValueOnce(placeDetails);

    const { getByText } = render(<SearchScreen />);

    fireEvent.press(getByText('Pizza Palace'));

    await waitFor(() => {
      expect(mockGetPlaceDetails).toHaveBeenCalledWith('place-1');
    });

    // After success, can tap another result
    mockGetPlaceDetails.mockClear();
    mockGetPlaceDetails.mockResolvedValueOnce(placeDetails);

    fireEvent.press(getByText('Pizza Hut'));

    await waitFor(() => {
      expect(mockGetPlaceDetails).toHaveBeenCalledWith('place-2');
    });
  });
});
