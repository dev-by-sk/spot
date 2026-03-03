import React from 'react';
import { render } from '@testing-library/react-native';
import { ActivityIndicator } from 'react-native';
import { SpotMapView } from '@/components/SpotMapView';
import type { SavedPlaceLocal } from '@/types';

/**
 * SpotMapView test scenarios:
 *
 * === Default region fallback (Fix 1) ===
 * 1. spotsRegion returns default when no places have coordinates
 * 2. Map renders (no crash) with 0 places and no user location
 * 3. Map renders with user location but 0 places
 * 4. Map renders with places but no user location
 *
 * === Loading state ===
 * 5. Shows ActivityIndicator when locationReady is false
 * 6. Shows map when locationReady is true
 *
 * === Empty overlay ===
 * 7. Shows "No spots matched" overlay when no places have coords
 * 8. Does not show overlay when places have coords
 *
 * === Near me button ===
 * 9. Shows near-me button when userLocation is provided
 * 10. Hides near-me button when userLocation is null
 */

// ── Mocks ──

const mockAnimateToRegion = jest.fn();

jest.mock('react-native-map-clustering', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, initialRegion, ...props }: any) => (
      <View testID="clustered-map" {...props}>
        {initialRegion && (
          <View
            testID="initial-region"
            accessibilityLabel={JSON.stringify(initialRegion)}
          />
        )}
        {children}
      </View>
    ),
  };
});

jest.mock('react-native-maps', () => {
  const { View } = require('react-native');
  const MapView = ({ children, ...props }: any) => (
    <View testID="map-view" {...props}>{children}</View>
  );
  return {
    __esModule: true,
    default: MapView,
  };
});

jest.mock('@/components/SpotMarker', () => {
  const { View } = require('react-native');
  return {
    SpotMarker: ({ place }: any) => (
      <View testID={`marker-${place.id}`} />
    ),
  };
});

jest.mock('@/components/PinPreviewCard', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    PinPreviewCard: React.forwardRef((_props: any, _ref: any) => (
      <View testID="pin-preview" />
    )),
  };
});

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, ...props }: any) => <Text {...props}>{name}</Text>,
  };
});

jest.mock('expo-location', () => ({
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

jest.mock('@/theme/colors', () => ({
  spotEmerald: '#047857',
  useSpotColors: () => ({
    spotEmerald: '#047857',
  }),
}));

// ── Helpers ──

function makePlace(overrides: Partial<SavedPlaceLocal> = {}): SavedPlaceLocal {
  return {
    id: `place-${Math.random().toString(36).slice(2, 8)}`,
    user_id: 'user-1',
    google_place_id: 'gp-1',
    note_text: '',
    date_visited: null,
    saved_at: '2025-01-01T00:00:00Z',
    name: 'Test Place',
    address: '123 Main St',
    lat: 40.7128,
    lng: -74.006,
    rating: 4.5,
    price_level: 2,
    category: 'Restaurant',
    cuisine: 'Italian',
    last_refreshed: '2025-01-01T00:00:00Z',
    website: null,
    phone_number: null,
    opening_hours: null,
    opening_hours_periods: null,
    ...overrides,
  };
}

// ── Tests ──

describe('SpotMapView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Default region fallback (Fix 1) ──

  describe('default region fallback', () => {
    it('does not crash with 0 places and no user location', () => {
      const { getByTestId } = render(
        <SpotMapView
          places={[]}
          userLocation={null}
          locationReady={true}
          onSelectPlace={jest.fn()}
        />,
      );
      expect(getByTestId('clustered-map')).toBeTruthy();
    });

    it('uses default region when no places and no user location', () => {
      const { getByTestId } = render(
        <SpotMapView
          places={[]}
          userLocation={null}
          locationReady={true}
          onSelectPlace={jest.fn()}
        />,
      );
      const regionEl = getByTestId('initial-region');
      const region = JSON.parse(regionEl.props.accessibilityLabel);
      // Default region: center of North America
      expect(region.latitude).toBe(39.8283);
      expect(region.longitude).toBe(-98.5795);
      expect(region.latitudeDelta).toBe(50);
      expect(region.longitudeDelta).toBe(50);
    });

    it('uses user location for initial region when available', () => {
      const { getByTestId } = render(
        <SpotMapView
          places={[]}
          userLocation={{ lat: 45.5, lng: -73.5 }}
          locationReady={true}
          onSelectPlace={jest.fn()}
        />,
      );
      const regionEl = getByTestId('initial-region');
      const region = JSON.parse(regionEl.props.accessibilityLabel);
      expect(region.latitude).toBe(45.5);
      expect(region.longitude).toBe(-73.5);
    });

    it('uses spots region when places exist but no user location', () => {
      const { getByTestId } = render(
        <SpotMapView
          places={[
            makePlace({ id: '1', lat: 40.0, lng: -74.0 }),
            makePlace({ id: '2', lat: 41.0, lng: -73.0 }),
          ]}
          userLocation={null}
          locationReady={true}
          onSelectPlace={jest.fn()}
        />,
      );
      const regionEl = getByTestId('initial-region');
      const region = JSON.parse(regionEl.props.accessibilityLabel);
      // Should be centered between the two places
      expect(region.latitude).toBeCloseTo(40.5, 1);
      expect(region.longitude).toBeCloseTo(-73.5, 1);
    });

    it('filters out places with null coords before computing region', () => {
      // If all places have null coords, should fall back to default region
      const { getByTestId } = render(
        <SpotMapView
          places={[
            makePlace({ id: '1', lat: null, lng: null }),
            makePlace({ id: '2', lat: null, lng: null }),
          ]}
          userLocation={null}
          locationReady={true}
          onSelectPlace={jest.fn()}
        />,
      );
      const regionEl = getByTestId('initial-region');
      const region = JSON.parse(regionEl.props.accessibilityLabel);
      expect(region.latitude).toBe(39.8283);
      expect(region.longitude).toBe(-98.5795);
    });
  });

  // ── Loading state ──

  describe('loading state', () => {
    it('shows ActivityIndicator when locationReady is false', () => {
      const { UNSAFE_getByType } = render(
        <SpotMapView
          places={[]}
          userLocation={null}
          locationReady={false}
          onSelectPlace={jest.fn()}
        />,
      );
      expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    });

    it('shows map when locationReady is true', () => {
      const { getByTestId, UNSAFE_queryByType } = render(
        <SpotMapView
          places={[]}
          userLocation={null}
          locationReady={true}
          onSelectPlace={jest.fn()}
        />,
      );
      expect(getByTestId('clustered-map')).toBeTruthy();
      expect(UNSAFE_queryByType(ActivityIndicator)).toBeNull();
    });
  });

  // ── Empty overlay ──

  describe('empty overlay', () => {
    it('shows "No spots matched" when no places have coordinates', () => {
      const { getByText } = render(
        <SpotMapView
          places={[]}
          userLocation={{ lat: 40.7, lng: -74.0 }}
          locationReady={true}
          onSelectPlace={jest.fn()}
        />,
      );
      expect(getByText('No spots matched')).toBeTruthy();
    });

    it('does not show empty overlay when places have coordinates', () => {
      const { queryByText } = render(
        <SpotMapView
          places={[makePlace({ id: '1', lat: 40.7, lng: -74.0 })]}
          userLocation={null}
          locationReady={true}
          onSelectPlace={jest.fn()}
        />,
      );
      expect(queryByText('No spots matched')).toBeNull();
    });

    it('shows empty overlay when all places have null coords', () => {
      const { getByText } = render(
        <SpotMapView
          places={[makePlace({ id: '1', lat: null, lng: null })]}
          userLocation={null}
          locationReady={true}
          onSelectPlace={jest.fn()}
        />,
      );
      expect(getByText('No spots matched')).toBeTruthy();
    });
  });

  // ── Near me button ──

  describe('near me button', () => {
    it('shows near-me button when userLocation is provided', () => {
      const { getByText } = render(
        <SpotMapView
          places={[]}
          userLocation={{ lat: 40.7, lng: -74.0 }}
          locationReady={true}
          onSelectPlace={jest.fn()}
        />,
      );
      // Our Ionicons mock renders the icon name as text
      expect(getByText('locate')).toBeTruthy();
    });

    it('hides near-me button when userLocation is null', () => {
      const { queryByText } = render(
        <SpotMapView
          places={[]}
          userLocation={null}
          locationReady={true}
          onSelectPlace={jest.fn()}
        />,
      );
      expect(queryByText('locate')).toBeNull();
    });
  });

  // ── Markers ──

  describe('markers', () => {
    it('renders a marker for each place with coordinates', () => {
      const { getByTestId } = render(
        <SpotMapView
          places={[
            makePlace({ id: 'p1', lat: 40.7, lng: -74.0 }),
            makePlace({ id: 'p2', lat: 41.0, lng: -73.5 }),
          ]}
          userLocation={null}
          locationReady={true}
          onSelectPlace={jest.fn()}
        />,
      );
      expect(getByTestId('marker-p1')).toBeTruthy();
      expect(getByTestId('marker-p2')).toBeTruthy();
    });

    it('does not render markers for places with null coordinates', () => {
      const { queryByTestId } = render(
        <SpotMapView
          places={[
            makePlace({ id: 'p1', lat: null, lng: null }),
            makePlace({ id: 'p2', lat: 40.7, lng: -74.0 }),
          ]}
          userLocation={null}
          locationReady={true}
          onSelectPlace={jest.fn()}
        />,
      );
      expect(queryByTestId('marker-p1')).toBeNull();
      expect(queryByTestId('marker-p2')).toBeTruthy();
    });
  });
});
