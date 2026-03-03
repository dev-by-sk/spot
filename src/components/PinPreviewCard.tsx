import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  PanResponder,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SavedPlaceLocal } from '../types';
import { PlaceCategory } from '../types';
import { CATEGORY_CONFIG } from '../theme/categoryColors';
import { useSpotColors, spotEmerald } from '../theme/colors';
import { SpotTypography } from '../theme/typography';

interface PinPreviewCardProps {
  place: SavedPlaceLocal;
  onViewDetails: () => void;
  onDismiss: () => void;
  onWillDismiss?: () => void;
}

function getConfig(place: SavedPlaceLocal) {
  const cat = place.category as PlaceCategory | null;
  return cat && cat in CATEGORY_CONFIG
    ? CATEGORY_CONFIG[cat]
    : CATEGORY_CONFIG[PlaceCategory.Other];
}

export interface PinPreviewCardHandle {
  dismiss: () => void;
}

export const PinPreviewCard = forwardRef<PinPreviewCardHandle, PinPreviewCardProps>(
function PinPreviewCard({ place, onViewDetails, onDismiss, onWillDismiss }, ref) {
  const colors = useSpotColors();
  const translateY = useRef(new Animated.Value(180)).current;

  const slideOut = () => {
    onWillDismiss?.();
    Animated.timing(translateY, {
      toValue: 300,
      duration: 200,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(onDismiss);
  };

  useImperativeHandle(ref, () => ({ dismiss: slideOut }));

  const config = getConfig(place);
  const category = place.category ?? 'Other';

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 60) {
          slideOut();
        } else {
          Animated.timing(translateY, {
            toValue: 0,
            duration: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  const ratingStars = place.rating != null ? `★ ${place.rating.toFixed(1)}` : null;
  const shortAddress = place.address?.split(',').slice(0, 2).join(',') ?? null;

  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: colors.spotCardBackground,
          shadowColor: '#000',
          transform: [{ translateY }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      {/* Drag handle */}
      <View style={[styles.handle, { backgroundColor: colors.spotDivider }]} />

      <View style={styles.content}>
        <View style={styles.accentRow}>
          <View style={[styles.accentIcon, { backgroundColor: config.bg }]}>
            <Ionicons name={config.icon} size={12} color={config.color} />
          </View>
          <Text style={[styles.categoryText, { color: config.color }]}>
            {category}
          </Text>
          {ratingStars && (
            <Text style={[styles.ratingText, { color: colors.spotTextSecondary }]}>
              {ratingStars}
            </Text>
          )}
        </View>

        <Text style={[styles.placeName, { color: colors.spotTextPrimary }]} numberOfLines={2}>
          {place.name ?? 'Unknown spot'}
        </Text>

        {shortAddress && (
          <Text style={[styles.address, { color: colors.spotTextSecondary }]} numberOfLines={1}>
            {shortAddress}
          </Text>
        )}

        <TouchableOpacity
          style={[styles.ctaButton, { backgroundColor: spotEmerald }]}
          onPress={onViewDetails}
          activeOpacity={0.8}
        >
          <Text style={styles.ctaText}>View Details →</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 12,
    paddingBottom: 32,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
  },
  accentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accentIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryText: {
    ...SpotTypography.footnote,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    flex: 1,
  },
  ratingText: {
    ...SpotTypography.footnote,
  },
  placeName: {
    ...SpotTypography.title3,
  },
  address: {
    ...SpotTypography.footnote,
  },
  ctaButton: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaText: {
    ...SpotTypography.headline,
    color: '#FFFFFF',
  },
});
