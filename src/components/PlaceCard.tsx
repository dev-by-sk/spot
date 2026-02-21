import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSpotColors } from '../theme/colors';
import { SpotTypography } from '../theme/typography';
import { relativeDate } from '../utils/relativeDate';
import type { SavedPlaceLocal } from '../types';

interface PlaceCardProps {
  place: SavedPlaceLocal;
}

export function PlaceCard({ place }: PlaceCardProps) {
  const colors = useSpotColors();

  const accessibilityParts: string[] = [];
  if (place.name) accessibilityParts.push(place.name);
  if (place.category) accessibilityParts.push(place.category);
  if (place.cuisine) accessibilityParts.push(place.cuisine);
  if (place.rating && place.rating > 0) accessibilityParts.push(`${place.rating.toFixed(1)} stars`);
  if (place.address) accessibilityParts.push(place.address);
  if (place.note_text) accessibilityParts.push(`Note: ${place.note_text}`);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.spotCardBackground,
        },
      ]}
      accessibilityLabel={accessibilityParts.join(', ')}
    >
      {/* Name + category badge */}
      <View style={styles.nameRow}>
        <Text
          style={[styles.name, { color: colors.spotTextPrimary }]}
          numberOfLines={1}
        >
          {place.name ?? 'Unknown'}
        </Text>
        {place.category ? (
          <View style={[styles.badge, { backgroundColor: `${colors.spotEmerald}1A` }]}>
            <Text style={[styles.badgeText, { color: colors.spotEmerald }]}>
              {place.category}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Cuisine */}
      {place.cuisine ? (
        <Text style={[styles.cuisine, { color: colors.spotTextSecondary }]}>
          {place.cuisine}
        </Text>
      ) : null}

      {/* Rating + price + address */}
      <View style={styles.metaRow}>
        {place.rating != null && place.rating > 0 ? (
          <View style={styles.ratingContainer}>
            <Ionicons name="star" size={11} color="#F59E0B" />
            <Text style={[styles.metaText, { color: colors.spotTextSecondary }]}>
              {place.rating.toFixed(1)}
            </Text>
          </View>
        ) : null}
        {place.address ? (
          <>
            <Text style={[styles.dot, { color: colors.spotTextSecondary }]}>&middot;</Text>
            <Text
              style={[styles.metaText, { color: colors.spotTextSecondary }]}
              numberOfLines={1}
            >
              {place.address}
            </Text>
          </>
        ) : null}
      </View>

      {/* Note preview */}
      {place.note_text ? (
        <Text
          style={[styles.note, { color: colors.spotTextSecondary }]}
          numberOfLines={1}
        >
          {place.note_text}
        </Text>
      ) : null}

      {/* Saved date */}
      <Text style={[styles.date, { color: colors.spotTextSecondary, opacity: 0.7 }]}>
        Saved {relativeDate(place.saved_at)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    gap: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    ...SpotTypography.headline,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    marginLeft: 8,
  },
  badgeText: {
    ...SpotTypography.caption,
  },
  cuisine: {
    ...SpotTypography.subheadline,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  metaText: {
    ...SpotTypography.footnote,
  },
  dot: {
    ...SpotTypography.footnote,
    marginHorizontal: 4,
  },
  note: {
    ...SpotTypography.footnote,
    fontStyle: 'italic',
  },
  date: {
    ...SpotTypography.caption,
  },
});
