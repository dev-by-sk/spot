import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Marker } from 'react-native-maps';
import type { SavedPlaceLocal } from '../types';
import { PlaceCategory } from '../types';
import { CATEGORY_CONFIG } from '../theme/categoryColors';

interface SpotMarkerProps {
  place: SavedPlaceLocal;
  onPress: (place: SavedPlaceLocal) => void;
  isLeaving?: boolean;
}

function getConfig(place: SavedPlaceLocal) {
  const cat = place.category as PlaceCategory | null;
  return cat && cat in CATEGORY_CONFIG
    ? CATEGORY_CONFIG[cat]
    : CATEGORY_CONFIG[PlaceCategory.Other];
}

export const SpotMarker = React.memo(function SpotMarker({
  place,
  onPress,
  isLeaving,
}: SpotMarkerProps) {
  const handlePress = useCallback(() => onPress(place), [onPress, place]);
  const opacity = useRef(new Animated.Value(0)).current;
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setTracksViewChanges(false));
  }, []);

  useEffect(() => {
    if (isLeaving) {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [isLeaving]);

  if (place.lat == null || place.lng == null) return null;

  const config = getConfig(place);

  return (
    <Marker
      coordinate={{ latitude: place.lat, longitude: place.lng }}
      tracksViewChanges={tracksViewChanges}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
        <Animated.View style={[styles.marker, { backgroundColor: config.color, opacity }]}>
          <Ionicons name={config.icon} size={config.iconSize - 2} color="#FFFFFF" />
        </Animated.View>
      </TouchableOpacity>
    </Marker>
  );
});

const styles = StyleSheet.create({
  marker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
});
