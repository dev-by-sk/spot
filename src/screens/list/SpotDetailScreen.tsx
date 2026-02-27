import React, { useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
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

  const openInMaps = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { lat, lng, name, address } = place;
    let url: string;

    if (lat != null && lng != null) {
      const label = encodeURIComponent(name ?? address ?? 'Place');
      url = Platform.OS === 'ios'
        ? `maps://?q=${label}&ll=${lat},${lng}`
        : `geo:${lat},${lng}?q=${lat},${lng}(${label})`;
    } else if (address) {
      const query = encodeURIComponent(address);
      url = Platform.OS === 'ios'
        ? `maps://?q=${query}`
        : `geo:0,0?q=${query}`;
    } else {
      return;
    }

    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      Linking.openURL(url);
    } else {
      const query = lat != null && lng != null
        ? `${lat},${lng}`
        : encodeURIComponent(address ?? '');
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
    }
  }, [place]);

  const openWebsite = useCallback(() => {
    if (!place.website) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(place.website);
  }, [place.website]);

  const callPhone = useCallback(() => {
    if (!place.phone_number) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(`tel:${place.phone_number}`);
  }, [place.phone_number]);

  return (
    <View style={[styles.container, { backgroundColor: colors.spotBackground }]}>
      {/* Header */}
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
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Name */}
        <Text style={[styles.name, { color: colors.spotTextPrimary }]}>
          {place.name ?? 'Unknown'}
        </Text>

        {/* Category + cuisine */}
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

        {/* Info card */}
        <View style={[styles.card, { backgroundColor: colors.spotCardBackground, borderColor: colors.spotDivider }]}>
          {place.rating != null && place.rating > 0 ? (
            <>
              <View style={styles.cardRow}>
                <View style={[styles.iconWrap, { backgroundColor: `${colors.spotEmerald}15` }]}>
                  <Ionicons name="star" size={15} color="#F59E0B" />
                </View>
                <Text style={[styles.cardRowLabel, { color: colors.spotTextSecondary }]}>Rating</Text>
                <Text style={[styles.cardRowValue, { color: colors.spotTextPrimary }]}>
                  {place.rating.toFixed(1)}
                </Text>
              </View>
              {(priceLabel || place.address) ? (
                <View style={[styles.cardDivider, { backgroundColor: colors.spotDivider }]} />
              ) : null}
            </>
          ) : null}

          {priceLabel ? (
            <>
              <View style={styles.cardRow}>
                <View style={[styles.iconWrap, { backgroundColor: `${colors.spotEmerald}15` }]}>
                  <Ionicons name="cash-outline" size={15} color={colors.spotEmerald} />
                </View>
                <Text style={[styles.cardRowLabel, { color: colors.spotTextSecondary }]}>Price</Text>
                <Text style={[styles.cardRowValue, { color: colors.spotTextPrimary }]}>
                  {priceLabel}
                </Text>
              </View>
              {place.address ? (
                <View style={[styles.cardDivider, { backgroundColor: colors.spotDivider }]} />
              ) : null}
            </>
          ) : null}

          {place.address ? (
            <TouchableOpacity style={styles.cardRow} onPress={openInMaps} activeOpacity={0.6}>
              <View style={[styles.iconWrap, { backgroundColor: `${colors.spotEmerald}15` }]}>
                <Ionicons name="location-outline" size={15} color={colors.spotEmerald} />
              </View>
              <Text style={[styles.cardRowValue, { color: colors.spotEmerald, flex: 1 }]} numberOfLines={2}>
                {place.address}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.spotEmerald} />
            </TouchableOpacity>
          ) : null}

          <View style={[styles.cardDivider, { backgroundColor: colors.spotDivider }]} />

          <TouchableOpacity
            style={styles.cardRow}
            onPress={callPhone}
            activeOpacity={place.phone_number ? 0.6 : 1}
            disabled={!place.phone_number}
          >
            <View style={[styles.iconWrap, { backgroundColor: `${colors.spotEmerald}15` }]}>
              <Ionicons name="call-outline" size={15} color={colors.spotEmerald} />
            </View>
            <Text
              style={[styles.cardRowValue, { flex: 1, color: place.phone_number ? colors.spotEmerald : colors.spotTextSecondary }]}
              numberOfLines={1}
            >
              {place.phone_number ?? '—'}
            </Text>
            {place.phone_number ? <Ionicons name="chevron-forward" size={14} color={colors.spotEmerald} /> : null}
          </TouchableOpacity>

          <View style={[styles.cardDivider, { backgroundColor: colors.spotDivider }]} />

          <TouchableOpacity
            style={styles.cardRow}
            onPress={openWebsite}
            activeOpacity={place.website ? 0.6 : 1}
            disabled={!place.website}
          >
            <View style={[styles.iconWrap, { backgroundColor: `${colors.spotEmerald}15` }]}>
              <Ionicons name="globe-outline" size={15} color={colors.spotEmerald} />
            </View>
            <Text
              style={[styles.cardRowValue, { flex: 1, color: place.website ? colors.spotEmerald : colors.spotTextSecondary }]}
              numberOfLines={1}
            >
              {place.website ? place.website.replace(/^https?:\/\//, '').replace(/\/$/, '') : '—'}
            </Text>
            {place.website ? <Ionicons name="chevron-forward" size={14} color={colors.spotEmerald} /> : null}
          </TouchableOpacity>
        </View>

        {/* Note card */}
        <Text style={[styles.sectionLabel, { color: colors.spotTextSecondary }]}>YOUR NOTE</Text>
        <View style={[styles.card, { backgroundColor: colors.spotCardBackground, borderColor: colors.spotDivider }]}>
          <Text style={[
            styles.noteText,
            { color: place.note_text ? colors.spotTextPrimary : colors.spotTextSecondary,
              fontStyle: place.note_text ? 'normal' : 'italic' }
          ]}>
            {place.note_text || 'No note added yet'}
          </Text>
        </View>

        {/* Footer meta */}
        <View style={[styles.card, { backgroundColor: colors.spotCardBackground, borderColor: colors.spotDivider }]}>
          {place.date_visited ? (
            <>
              <View style={styles.cardRow}>
                <View style={[styles.iconWrap, { backgroundColor: `${colors.spotEmerald}15` }]}>
                  <Ionicons name="calendar-outline" size={15} color={colors.spotEmerald} />
                </View>
                <Text style={[styles.cardRowLabel, { color: colors.spotTextSecondary }]}>Visited</Text>
                <Text style={[styles.cardRowValue, { color: colors.spotTextPrimary }]}>
                  {relativeDate(place.date_visited)}
                </Text>
              </View>
              <View style={[styles.cardDivider, { backgroundColor: colors.spotDivider }]} />
            </>
          ) : null}
          <View style={styles.cardRow}>
            <View style={[styles.iconWrap, { backgroundColor: `${colors.spotEmerald}15` }]}>
              <Ionicons name="bookmark-outline" size={15} color={colors.spotEmerald} />
            </View>
            <Text style={[styles.cardRowLabel, { color: colors.spotTextSecondary }]}>Saved</Text>
            <Text style={[styles.cardRowValue, { color: colors.spotTextPrimary }]}>
              {relativeDate(place.saved_at)}
            </Text>
          </View>
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
    paddingHorizontal: 16,
    gap: 12,
  },
  name: {
    ...SpotTypography.largeTitle,
    marginTop: 4,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 52,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardRowLabel: {
    ...SpotTypography.subheadline,
    flex: 1,
  },
  cardRowValue: {
    ...SpotTypography.subheadline,
    textAlign: 'right',
    flexShrink: 1,
  },
  sectionLabel: {
    ...SpotTypography.caption,
    fontWeight: '600',
    letterSpacing: 0.6,
    marginTop: 4,
    marginLeft: 4,
  },
  noteText: {
    ...SpotTypography.body,
    lineHeight: 24,
    padding: 14,
  },
});
