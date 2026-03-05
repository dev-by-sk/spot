import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSpotColors } from '../../theme/colors';
import { SpotTypography } from '../../theme/typography';
import { Avatar } from '../../components/Avatar';
import { usePlaces } from '../../hooks/usePlaces';
import { useAuth } from '../../hooks/useAuth';
import { useFriends } from '../../context/FriendsContext';
import { useToast } from '../../context/ToastContext';
import { CATEGORY_CONFIG } from '../../theme/categoryColors';
import type { FriendsStackParamList } from '../../navigation/types';
import type { SavedPlaceLocal } from '../../types';

export function FriendPlaceDetailScreen() {
  const route = useRoute<RouteProp<FriendsStackParamList, 'FriendPlaceDetail'>>();
  const { place, friendUsername } = route.params;
  const colors = useSpotColors();
  const { savedPlaces, savePlace, getPlaceDetails } = usePlaces();
  const { currentUserId } = useAuth();
  const { socialIndicators } = useFriends();
  const { showToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const isAlreadySaved = useMemo(
    () => savedPlaces.some((p) => p.google_place_id === place.google_place_id),
    [savedPlaces, place.google_place_id],
  );

  const friendsWhoSaved = socialIndicators[place.google_place_id] ?? [];

  const config = place.category
    ? (CATEGORY_CONFIG[place.category as keyof typeof CATEGORY_CONFIG] ?? CATEGORY_CONFIG.Other)
    : CATEGORY_CONFIG.Other;

  const handleSave = useCallback(async () => {
    if (isAlreadySaved || !currentUserId) return;
    setIsSaving(true);
    try {
      // Fetch full place details then save
      const details = await getPlaceDetails(place.google_place_id);
      if (!details) {
        showToast({ text: 'Could not fetch place details', type: 'error' });
        return;
      }
      await savePlace(details, '', currentUserId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ text: 'Saved to your spots', type: 'success' });
    } catch (err: any) {
      if (err?.code === 'DUPLICATE_PLACE') {
        showToast({ text: 'Already in your spots', type: 'info' });
      } else {
        showToast({ text: 'Failed to save', type: 'error' });
      }
    } finally {
      setIsSaving(false);
    }
  }, [isAlreadySaved, currentUserId, place.google_place_id, getPlaceDetails, savePlace, showToast]);

  const handleOpenInMaps = useCallback(() => {
    if (place.lat == null || place.lng == null) return;
    const label = encodeURIComponent(place.name ?? 'Place');
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${place.lat},${place.lng}`,
      default: `geo:${place.lat},${place.lng}?q=${label}`,
    });
    Linking.openURL(url);
  }, [place]);

  return (
    <View style={[styles.container, { backgroundColor: colors.spotBackground }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Place info */}
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: config.bg }]}>
            <Ionicons name={config.icon} size={config.iconSize} color={config.color} />
          </View>
          <View style={styles.headerInfo}>
            <Text style={[styles.placeName, { color: colors.spotTextPrimary }]}>
              {place.name ?? 'Unknown'}
            </Text>
            {place.cuisine ? (
              <Text style={[styles.cuisine, { color: colors.spotTextSecondary }]}>
                {place.cuisine}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Details */}
        {place.address ? (
          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={18} color={colors.spotTextSecondary} />
            <Text style={[styles.detailText, { color: colors.spotTextPrimary }]}>
              {place.address}
            </Text>
          </View>
        ) : null}

        {place.rating != null && place.rating > 0 ? (
          <View style={styles.detailRow}>
            <Ionicons name="star" size={18} color="#F59E0B" />
            <Text style={[styles.detailText, { color: colors.spotTextPrimary }]}>
              {place.rating.toFixed(1)}
            </Text>
          </View>
        ) : null}

        {place.phone_number ? (
          <View style={styles.detailRow}>
            <Ionicons name="call-outline" size={18} color={colors.spotTextSecondary} />
            <Text style={[styles.detailText, { color: colors.spotTextPrimary }]}>
              {place.phone_number}
            </Text>
          </View>
        ) : null}

        {/* Open in Maps */}
        {place.lat != null && place.lng != null ? (
          <TouchableOpacity
            style={[styles.mapsButton, { borderColor: colors.spotDivider }]}
            onPress={handleOpenInMaps}
            activeOpacity={0.7}
          >
            <Ionicons name="navigate-outline" size={18} color={colors.spotEmerald} />
            <Text style={[styles.mapsButtonText, { color: colors.spotEmerald }]}>
              Open in Maps
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Also saved by */}
        {friendsWhoSaved.length > 0 ? (
          <View style={styles.socialSection}>
            <Text style={[styles.socialTitle, { color: colors.spotTextSecondary }]}>
              ALSO SAVED BY
            </Text>
            {friendsWhoSaved.map((friend) => (
              <View key={friend.user_id} style={styles.socialRow}>
                <Avatar
                  username={friend.username}
                  displayName={friend.display_name}
                  size={32}
                />
                <Text style={[styles.socialName, { color: colors.spotTextPrimary }]}>
                  {friend.display_name || friend.username}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* Bottom save button */}
      <View style={[styles.bottomBar, { borderTopColor: colors.spotDivider }]}>
        <TouchableOpacity
          style={[
            styles.saveButton,
            { backgroundColor: isAlreadySaved ? colors.spotDivider : colors.spotEmerald },
          ]}
          onPress={handleSave}
          disabled={isAlreadySaved || isSaving}
          activeOpacity={0.8}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons
                name={isAlreadySaved ? 'checkmark-circle' : 'bookmark-outline'}
                size={20}
                color={isAlreadySaved ? colors.spotTextSecondary : '#FFFFFF'}
              />
              <Text
                style={[
                  styles.saveButtonText,
                  { color: isAlreadySaved ? colors.spotTextSecondary : '#FFFFFF' },
                ]}
              >
                {isAlreadySaved ? 'Already saved' : 'Save to my spots'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 20,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: { flex: 1, gap: 4 },
  placeName: { ...SpotTypography.title2 },
  cuisine: { ...SpotTypography.subheadline },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  detailText: { ...SpotTypography.body, flex: 1 },
  mapsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    marginTop: 12,
  },
  mapsButtonText: { ...SpotTypography.headline },
  socialSection: { marginTop: 24, gap: 10 },
  socialTitle: {
    ...SpotTypography.caption,
    marginBottom: 4,
    paddingLeft: 2,
  },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  socialName: { ...SpotTypography.body },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  saveButtonText: { ...SpotTypography.headline },
});
