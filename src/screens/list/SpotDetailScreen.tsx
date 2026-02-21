import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSpotColors } from '../../theme/colors';
import { SpotTypography } from '../../theme/typography';
import { relativeDate } from '../../utils/relativeDate';
import type { ListStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ListStackParamList, 'PlaceDetail'>;

export function SpotDetailScreen({ route, navigation }: Props) {
  const { place } = route.params;
  const colors = useSpotColors();
  const insets = useSafeAreaInsets();

  const priceLabel = place.price_level
    ? '$'.repeat(place.price_level)
    : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.spotBackground }]}>
      {/* Custom header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={28} color={colors.spotEmerald} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Name */}
        <Text style={[styles.name, { color: colors.spotTextPrimary }]}>
          {place.name ?? 'Unknown'}
        </Text>

        {/* Category + cuisine row */}
        <View style={styles.tagRow}>
          {place.category ? (
            <View style={[styles.badge, { backgroundColor: `${colors.spotEmerald}1A` }]}>
              <Text style={[styles.badgeText, { color: colors.spotEmerald }]}>
                {place.category}
              </Text>
            </View>
          ) : null}
          {place.cuisine ? (
            <Text style={[styles.cuisine, { color: colors.spotTextSecondary }]}>
              {place.cuisine}
            </Text>
          ) : null}
        </View>

        {/* Meta info */}
        <View style={styles.metaSection}>
          {place.rating != null && place.rating > 0 ? (
            <View style={styles.metaRow}>
              <Ionicons name="star" size={16} color="#F59E0B" />
              <Text style={[styles.metaText, { color: colors.spotTextPrimary }]}>
                {place.rating.toFixed(1)}
              </Text>
            </View>
          ) : null}

          {priceLabel ? (
            <View style={styles.metaRow}>
              <Ionicons name="cash-outline" size={16} color={colors.spotEmerald} />
              <Text style={[styles.metaText, { color: colors.spotTextPrimary }]}>
                {priceLabel}
              </Text>
            </View>
          ) : null}

          {place.address ? (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={16} color={colors.spotEmerald} />
              <Text style={[styles.metaText, { color: colors.spotTextPrimary, flex: 1 }]}>
                {place.address}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.spotDivider }]} />

        {/* Note */}
        <Text style={[styles.sectionTitle, { color: colors.spotTextPrimary }]}>
          Your note
        </Text>
        {place.note_text ? (
          <Text style={[styles.noteText, { color: colors.spotTextPrimary }]}>
            {place.note_text}
          </Text>
        ) : (
          <Text style={[styles.noteText, { color: colors.spotTextSecondary, fontStyle: 'italic' }]}>
            No note added yet
          </Text>
        )}

        {/* Date visited */}
        {place.date_visited ? (
          <>
            <View style={[styles.divider, { backgroundColor: colors.spotDivider }]} />
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={16} color={colors.spotEmerald} />
              <Text style={[styles.metaText, { color: colors.spotTextPrimary }]}>
                Visited {relativeDate(place.date_visited)}
              </Text>
            </View>
          </>
        ) : null}

        {/* Saved on */}
        <View style={[styles.divider, { backgroundColor: colors.spotDivider }]} />
        <View style={styles.metaRow}>
          <Ionicons name="bookmark-outline" size={16} color={colors.spotEmerald} />
          <Text style={[styles.metaText, { color: colors.spotTextSecondary }]}>
            Saved {relativeDate(place.saved_at)}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backButton: {
    padding: 4,
  },
  content: {
    paddingHorizontal: 20,
  },
  name: {
    ...SpotTypography.largeTitle,
    marginBottom: 12,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: {
    ...SpotTypography.caption,
    fontWeight: '600',
  },
  cuisine: {
    ...SpotTypography.subheadline,
  },
  metaSection: {
    gap: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    ...SpotTypography.body,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 20,
  },
  sectionTitle: {
    ...SpotTypography.title3,
    marginBottom: 8,
  },
  noteText: {
    ...SpotTypography.body,
    lineHeight: 24,
  },
});
