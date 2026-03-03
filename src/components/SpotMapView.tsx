import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Animated, Easing, Dimensions, StyleSheet } from 'react-native';
import ClusteredMapView from 'react-native-map-clustering';
import MapView, { Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import type { SavedPlaceLocal } from '../types';
import { SpotMarker } from './SpotMarker';
import { PinPreviewCard, type PinPreviewCardHandle } from './PinPreviewCard';
import { spotEmerald } from '../theme/colors';

type DisplayedPlace = { place: SavedPlaceLocal; leaving: boolean };

interface SpotMapViewProps {
  places: SavedPlaceLocal[];
  userLocation: { lat: number; lng: number } | null;
  locationReady: boolean;
  onSelectPlace: (place: SavedPlaceLocal) => void;
}

const DEFAULT_REGION: Region = {
  latitude: 39.8283,
  longitude: -98.5795,
  latitudeDelta: 50,
  longitudeDelta: 50,
};

function spotsRegion(
  coords: { latitude: number; longitude: number }[],
): Region {
  if (coords.length === 0) {
    return DEFAULT_REGION;
  }
  const lats = coords.map((c) => c.latitude);
  const lngs = coords.map((c) => c.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latDelta = Math.max((maxLat - minLat) * 1.5, 0.02);
  const lngDelta = Math.max((maxLng - minLng) * 1.5, 0.02);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

export function SpotMapView({ places, userLocation, locationReady, onSelectPlace }: SpotMapViewProps) {
  const innerMapRef = useRef<MapView>(null);
  const previewCardRef = useRef<PinPreviewCardHandle>(null);
  const [selectedPlace, setSelectedPlace] = useState<SavedPlaceLocal | null>(null);
  const suppressNextMapPress = useRef(false);
  const buttonTranslateY = useRef(new Animated.Value(0)).current;
  const currentRegionRef = useRef<Region | undefined>(undefined);

  const placesWithCoords = useMemo(
    () => places.filter((p) => p.lat != null && p.lng != null),
    [places],
  );

  const [displayedPlaces, setDisplayedPlaces] = useState<DisplayedPlace[]>(() =>
    placesWithCoords.map((p) => ({ place: p, leaving: false })),
  );
  const leavingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const currentIds = new Set(placesWithCoords.map((p) => p.id));

    setDisplayedPlaces((prev) => {
      const prevIds = new Set(prev.map((dp) => dp.place.id));
      const updated = prev.map((dp) => ({
        ...dp,
        leaving: !currentIds.has(dp.place.id),
      }));
      const added = placesWithCoords
        .filter((p) => !prevIds.has(p.id))
        .map((p) => ({ place: p, leaving: false }));
      return [...updated, ...added];
    });

    if (leavingTimerRef.current) clearTimeout(leavingTimerRef.current);
    leavingTimerRef.current = setTimeout(() => {
      setDisplayedPlaces((prev) => prev.filter((dp) => !dp.leaving));
    }, 350);

    return () => {
      if (leavingTimerRef.current) clearTimeout(leavingTimerRef.current);
    };
  }, [placesWithCoords]);

  const initialRegion = useMemo((): Region | undefined => {
    if (userLocation) {
      return {
        latitude: userLocation.lat,
        longitude: userLocation.lng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    if (placesWithCoords.length > 0) {
      return spotsRegion(
        placesWithCoords.map((p) => ({ latitude: p.lat!, longitude: p.lng! })),
      );
    }
    return DEFAULT_REGION;
  }, []); // intentionally only on mount

  const handleMapRef = useCallback((ref: React.Ref<MapView>) => {
    (innerMapRef as React.MutableRefObject<MapView | null>).current =
      ref as MapView | null;
  }, []);

  const animateButtonUp = useCallback(() => {
    Animated.timing(buttonTranslateY, {
      toValue: -196,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [buttonTranslateY]);

  const animateButtonDown = useCallback(() => {
    Animated.timing(buttonTranslateY, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [buttonTranslateY]);

  const handleRegionChangeComplete = useCallback((region: Region) => {
    currentRegionRef.current = region;
  }, []);


  const handleMarkerPress = useCallback((place: SavedPlaceLocal) => {
    suppressNextMapPress.current = true;
    setSelectedPlace(place);
    animateButtonUp();

    // Pan so the pin is centered in the visible area above the preview card
    const latDelta = currentRegionRef.current?.latitudeDelta ?? 0.05;
    const lngDelta = currentRegionRef.current?.longitudeDelta ?? 0.05;
    const { height } = Dimensions.get('window');
    const CARD_HEIGHT = 220;
    const latOffset = (CARD_HEIGHT / 2 / height) * latDelta;
    innerMapRef.current?.animateToRegion(
      {
        latitude: place.lat! - latOffset,
        longitude: place.lng!,
        latitudeDelta: latDelta,
        longitudeDelta: lngDelta,
      },
      300,
    );
  }, [animateButtonUp]);

  const handleMapPress = useCallback(() => {
    if (suppressNextMapPress.current) {
      suppressNextMapPress.current = false;
      return;
    }
    previewCardRef.current?.dismiss();
  }, []);

  const handleViewDetails = useCallback(() => {
    if (selectedPlace) {
      animateButtonDown();
      onSelectPlace(selectedPlace);
      setSelectedPlace(null);
    }
  }, [selectedPlace, onSelectPlace, animateButtonDown]);

  const handleNearMe = useCallback(async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      innerMapRef.current?.animateToRegion(
        {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        },
        400,
      );
    } catch {
      // permission denied or unavailable — silently no-op
    }
  }, []);

  if (!locationReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={spotEmerald} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ClusteredMapView
        mapRef={handleMapRef as any}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={handleMapPress}
        onRegionChangeComplete={handleRegionChangeComplete}
        clusterColor={spotEmerald}
        clusterTextColor="#FFFFFF"
        clusterFontFamily="PlusJakartaSans_700Bold"
        radius={40}
        animationEnabled={false}
      >
        {displayedPlaces.map(({ place, leaving }) => (
          <SpotMarker
            key={place.id}
            place={place}
            onPress={handleMarkerPress}
            isLeaving={leaving}
          />
        ))}
      </ClusteredMapView>

      {placesWithCoords.length === 0 && (
        <View style={styles.emptyOverlay} pointerEvents="none">
          <Text style={styles.emptyText}>No spots matched</Text>
        </View>
      )}

      {/* Near me button */}
      {userLocation && (
        <Animated.View style={[styles.nearMeButton, { transform: [{ translateY: buttonTranslateY }] }]}>
          <TouchableOpacity
            style={styles.nearMeButtonInner}
            onPress={handleNearMe}
            activeOpacity={0.8}
          >
            <Ionicons name="locate" size={20} color={spotEmerald} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {selectedPlace && (
        <PinPreviewCard
          ref={previewCardRef}
          place={selectedPlace}
          onViewDetails={handleViewDetails}
          onDismiss={() => setSelectedPlace(null)}
          onWillDismiss={animateButtonDown}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  map: {
    flex: 1,
  },
  emptyOverlay: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  emptyText: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    color: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
  },
  nearMeButton: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  nearMeButtonInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
