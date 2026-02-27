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

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const CATEGORY_CONFIG: Record<string, { icon: IoniconName; size: number; bg: string; color: string }> = {
  Restaurant:    { icon: 'restaurant-outline', size: 18, bg: 'rgba(251, 146, 60,  0.12)', color: '#EA7C2A' },
  Cafe:          { icon: 'cafe-outline',        size: 21, bg: 'rgba(161, 95,  55,  0.12)', color: '#A15F37' },
  Bar:           { icon: 'wine-outline',         size: 21, bg: 'rgba(139, 92,  246, 0.12)', color: '#7C3AED' },
  Dessert:       { icon: 'ice-cream-outline',    size: 21, bg: 'rgba(236, 72,  153, 0.12)', color: '#DB2777' },
  Activity:      { icon: 'bicycle-outline',      size: 20, bg: 'rgba(59,  130, 246, 0.12)', color: '#2563EB' },
  Entertainment: { icon: 'film-outline',         size: 20, bg: 'rgba(20,  184, 166, 0.12)', color: '#0D9488' },
  Other:         { icon: 'grid-outline',         size: 20, bg: 'rgba(107, 114, 128, 0.10)', color: '#6B7280' },
};

export function PlaceCard({ place }: PlaceCardProps) {
  const colors = useSpotColors();

  const config = place.category
    ? (CATEGORY_CONFIG[place.category] ?? CATEGORY_CONFIG.Other)
    : CATEGORY_CONFIG.Other;

  const accessibilityParts: string[] = [];
  if (place.name) accessibilityParts.push(place.name);
  if (place.category) accessibilityParts.push(place.category);
  if (place.cuisine) accessibilityParts.push(place.cuisine);
  if (place.rating && place.rating > 0) accessibilityParts.push(`${place.rating.toFixed(1)} stars`);
  if (place.address) accessibilityParts.push(place.address);
  if (place.note_text) accessibilityParts.push(`Note: ${place.note_text}`);

  return (
    <View
      style={[styles.card, { backgroundColor: colors.spotCardBackground, borderLeftColor: colors.spotEmerald }]}
      accessibilityLabel={accessibilityParts.join(', ')}
    >
      {/* Icon */}
      <View style={[styles.iconContainer, { backgroundColor: config.bg }]}>
        <Ionicons name={config.icon} size={config.size} color={config.color} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={[styles.name, { color: colors.spotTextPrimary }]} numberOfLines={1}>
          {place.name ?? 'Unknown'}
        </Text>

        {place.cuisine ? (
          <Text style={[styles.cuisine, { color: colors.spotTextSecondary }]} numberOfLines={1}>
            {place.cuisine}
          </Text>
        ) : null}

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
              {place.rating != null && place.rating > 0 ? (
                <Text style={[styles.dot, { color: colors.spotTextSecondary }]}>&middot;</Text>
              ) : null}
              <Text style={[styles.metaText, { color: colors.spotTextSecondary, flex: 1 }]} numberOfLines={1}>
                {place.address}
              </Text>
            </>
          ) : null}
        </View>

        {place.note_text ? (
          <Text style={[styles.note, { color: colors.spotTextSecondary }]} numberOfLines={1}>
            {place.note_text}
          </Text>
        ) : null}

        <Text style={[styles.date, { color: colors.spotTextSecondary }]}>
          {place.date_visited
            ? `Visited ${relativeDate(place.date_visited)}`
            : `Saved ${relativeDate(place.saved_at)}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    padding: 14,
    borderRadius: 12,
    borderLeftWidth: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  iconContainer: {
    width: 46,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  name: {
    ...SpotTypography.headline,
  },
  cuisine: {
    ...SpotTypography.subheadline,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    opacity: 0.6,
  },
});
