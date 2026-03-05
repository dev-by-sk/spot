import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSpotColors } from '../../theme/colors';
import { SpotTypography } from '../../theme/typography';
import { Avatar } from '../../components/Avatar';
import { PlaceCard } from '../../components/PlaceCard';
import { FilterBar } from '../../components/FilterBar';
import { useFriends } from '../../context/FriendsContext';
import { usePlaces } from '../../hooks/usePlaces';
import { useToast } from '../../context/ToastContext';
import * as FriendsService from '../../services/friendsService';
import type { FriendsStackParamList } from '../../navigation/types';
import type { UserProfilePublic, FollowStatus } from '../../types/social';
import type { SavedPlaceLocal, PlaceCategory } from '../../types';

type RouteParams = { user: UserProfilePublic } | { username: string };

export function FriendProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<FriendsStackParamList>>();
  const route = useRoute<RouteProp<FriendsStackParamList, 'FriendProfile'>>();
  const colors = useSpotColors();
  const insets = useSafeAreaInsets();
  const { optimisticFollowState, follow, unfollow } = useFriends();
  const { savedPlaces } = usePlaces();
  const { showToast } = useToast();

  const params = route.params as RouteParams;
  const userFromParams = 'user' in params ? params.user : null;

  const [user, setUser] = useState<UserProfilePublic | null>(userFromParams);
  const [followStatus, setFollowStatus] = useState<FollowStatus>('none');
  const [counts, setCounts] = useState({ followers_count: 0, following_count: 0 });
  const [places, setPlaces] = useState<SavedPlaceLocal[]>([]);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false);
  const [isPrivateBlocked, setIsPrivateBlocked] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<PlaceCategory | null>(null);

  const savedGooglePlaceIds = useMemo(
    () => new Set(savedPlaces.map((p) => p.google_place_id)),
    [savedPlaces],
  );

  const effectiveStatus = user ? (optimisticFollowState[user.id] ?? followStatus) : 'none';

  useEffect(() => {
    if (!user) return;

    // Fetch follow status + counts
    FriendsService.getFollowStatus(user.id)
      .then(setFollowStatus)
      .catch(() => {});

    FriendsService.getSocialCounts(user.id)
      .then(setCounts)
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;

    setIsLoadingPlaces(true);
    FriendsService.getFriendPlaces(user.id)
      .then((data) => {
        // Map to SavedPlaceLocal shape
        const mapped: SavedPlaceLocal[] = data.map((p: any) => ({
          id: p.id,
          user_id: p.user_id,
          google_place_id: p.google_place_id,
          note_text: '',
          date_visited: p.date_visited,
          saved_at: p.saved_at,
          name: p.place_cache?.name ?? null,
          address: p.place_cache?.address ?? null,
          lat: p.place_cache?.lat ?? null,
          lng: p.place_cache?.lng ?? null,
          rating: p.place_cache?.rating ?? null,
          price_level: p.place_cache?.price_level ?? null,
          category: p.place_cache?.category ?? null,
          cuisine: p.place_cache?.cuisine ?? null,
          last_refreshed: p.place_cache?.last_refreshed ?? null,
          website: p.place_cache?.website ?? null,
          phone_number: p.place_cache?.phone_number ?? null,
          opening_hours: p.place_cache?.opening_hours ?? null,
          opening_hours_periods: p.place_cache?.opening_hours_periods ?? null,
        }));
        setPlaces(mapped);
        setIsPrivateBlocked(false);
      })
      .catch((err: any) => {
        if (err?.message?.includes('403') || err?.context?.status === 403) {
          setIsPrivateBlocked(true);
        }
        setPlaces([]);
      })
      .finally(() => setIsLoadingPlaces(false));
  }, [user, effectiveStatus]);

  const filteredPlaces = useMemo(() => {
    if (!selectedFilter) return places;
    return places.filter((p) => p.category === selectedFilter);
  }, [places, selectedFilter]);

  const handleFollow = useCallback(async () => {
    if (!user) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await follow(user);
    } catch {
      showToast({ text: 'Failed to follow', type: 'error' });
    }
  }, [user, follow, showToast]);

  const handleUnfollow = useCallback(async () => {
    if (!user) return;
    try {
      await unfollow(user.id);
    } catch {
      showToast({ text: 'Failed to unfollow', type: 'error' });
    }
  }, [user, unfollow, showToast]);

  const handleQuickSave = useCallback((place: SavedPlaceLocal) => {
    if (savedGooglePlaceIds.has(place.google_place_id)) {
      showToast({ text: 'Already in your spots', type: 'info' });
      return;
    }
    // Navigate to save confirmation (reuse Search flow)
    navigation.navigate('FriendPlaceDetail', {
      place,
      friendUsername: user?.username ?? '',
    });
  }, [savedGooglePlaceIds, navigation, user, showToast]);

  const renderFollowButton = () => {
    if (effectiveStatus === 'accepted') {
      return (
        <TouchableOpacity
          style={[styles.followButton, { backgroundColor: colors.spotDivider }]}
          onPress={handleUnfollow}
          activeOpacity={0.7}
        >
          <Text style={[styles.followButtonText, { color: colors.spotTextPrimary }]}>Following</Text>
        </TouchableOpacity>
      );
    }
    if (effectiveStatus === 'pending') {
      return (
        <TouchableOpacity
          style={[styles.followButton, { backgroundColor: colors.spotDivider }]}
          onPress={handleUnfollow}
          activeOpacity={0.7}
        >
          <Text style={[styles.followButtonText, { color: colors.spotTextSecondary }]}>Requested</Text>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity
        style={[styles.followButton, { backgroundColor: colors.spotEmerald }]}
        onPress={handleFollow}
        activeOpacity={0.7}
      >
        <Text style={[styles.followButtonText, { color: '#FFFFFF' }]}>Follow</Text>
      </TouchableOpacity>
    );
  };

  if (!user) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.spotBackground }]}>
        <ActivityIndicator color={colors.spotEmerald} />
      </View>
    );
  }

  const renderItem = useCallback(({ item }: { item: SavedPlaceLocal }) => {
    const isSaved = savedGooglePlaceIds.has(item.google_place_id);
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigation.navigate('FriendPlaceDetail', { place: item, friendUsername: user?.username ?? '' })}
        style={styles.cardContainer}
      >
        <View>
          <PlaceCard place={item} />
          <TouchableOpacity
            style={[styles.bookmarkButton, { backgroundColor: isSaved ? colors.spotDivider : colors.spotEmerald }]}
            onPress={() => handleQuickSave(item)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isSaved ? 'bookmark' : 'bookmark-outline'}
              size={16}
              color={isSaved ? colors.spotTextSecondary : '#FFFFFF'}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }, [savedGooglePlaceIds, navigation, user, colors, handleQuickSave]);

  return (
    <View style={[styles.container, { backgroundColor: colors.spotBackground }]}>
      <FlatList
        data={isPrivateBlocked ? [] : filteredPlaces}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, filteredPlaces.length === 0 && { flex: 1 }]}
        ListHeaderComponent={
          <View>
            {/* Profile card */}
            <View style={styles.profileCard}>
              <Avatar username={user.username} displayName={user.display_name} size={64} />
              {user.display_name ? (
                <Text style={[styles.profileDisplayName, { color: colors.spotTextPrimary }]}>
                  {user.display_name}
                </Text>
              ) : null}
              <Text style={[styles.profileUsername, { color: colors.spotTextSecondary }]}>
                @{user.username}
              </Text>

              {/* Stats row */}
              <View style={styles.statsRow}>
                <TouchableOpacity
                  onPress={() => navigation.navigate('FollowList', { userId: user.id, initialTab: 'followers' })}
                  style={styles.statItem}
                >
                  <Text style={[styles.statCount, { color: colors.spotTextPrimary }]}>
                    {places.length}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.spotTextSecondary }]}>spots</Text>
                </TouchableOpacity>
                <Text style={[styles.statDot, { color: colors.spotTextSecondary }]}>·</Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('FollowList', { userId: user.id, initialTab: 'followers' })}
                  style={styles.statItem}
                >
                  <Text style={[styles.statCount, { color: colors.spotTextPrimary }]}>
                    {counts.followers_count}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.spotTextSecondary }]}>followers</Text>
                </TouchableOpacity>
                <Text style={[styles.statDot, { color: colors.spotTextSecondary }]}>·</Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('FollowList', { userId: user.id, initialTab: 'following' })}
                  style={styles.statItem}
                >
                  <Text style={[styles.statCount, { color: colors.spotTextPrimary }]}>
                    {counts.following_count}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.spotTextSecondary }]}>following</Text>
                </TouchableOpacity>
              </View>

              {renderFollowButton()}
            </View>

            {/* Private blocked state */}
            {isPrivateBlocked ? null : (
              <View style={styles.filterRow}>
                <FilterBar selectedFilter={selectedFilter} onFilterChange={setSelectedFilter} />
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          isLoadingPlaces ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.spotEmerald} />
            </View>
          ) : isPrivateBlocked ? (
            <View style={styles.privateContainer}>
              <Ionicons name="lock-closed-outline" size={44} color={colors.spotTextSecondary} style={{ opacity: 0.4 }} />
              <Text style={[styles.emptyTitle, { color: colors.spotTextPrimary }]}>
                This account is private
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.spotTextSecondary }]}>
                Follow this user to see their spots
              </Text>
            </View>
          ) : (
            <View style={styles.privateContainer}>
              <Text style={[styles.emptySubtitle, { color: colors.spotTextSecondary }]}>
                No spots yet
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  profileCard: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 6,
  },
  profileDisplayName: { ...SpotTypography.title2, marginTop: 8 },
  profileUsername: { ...SpotTypography.subheadline },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    marginBottom: 16,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statCount: { ...SpotTypography.headline },
  statLabel: { ...SpotTypography.footnote },
  statDot: { ...SpotTypography.body },
  followButton: {
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 10,
  },
  followButtonText: {
    ...SpotTypography.headline,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 8,
  },
  listContent: { paddingBottom: 16 },
  cardContainer: {
    marginHorizontal: 16,
    marginVertical: 6,
  },
  bookmarkButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  privateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 12,
    paddingTop: 60,
  },
  emptyTitle: { ...SpotTypography.title2, textAlign: 'center' },
  emptySubtitle: { ...SpotTypography.body, textAlign: 'center', lineHeight: 24 },
});
