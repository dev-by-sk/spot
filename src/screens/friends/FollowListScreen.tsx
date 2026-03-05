import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSpotColors } from '../../theme/colors';
import { SpotTypography } from '../../theme/typography';
import { Avatar } from '../../components/Avatar';
import * as FriendsService from '../../services/friendsService';
import type { FriendsStackParamList } from '../../navigation/types';
import type { UserProfilePublic } from '../../types/social';

export function FollowListScreen() {
  const route = useRoute<RouteProp<FriendsStackParamList, 'FollowList'>>();
  const navigation = useNavigation<NativeStackNavigationProp<FriendsStackParamList>>();
  const colors = useSpotColors();
  const { userId, initialTab = 'followers' } = route.params;

  const [activeTab, setActiveTab] = useState<'followers' | 'following'>(initialTab);
  const [followers, setFollowers] = useState<UserProfilePublic[]>([]);
  const [followingList, setFollowingList] = useState<UserProfilePublic[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const fetchData = activeTab === 'followers'
      ? FriendsService.getFollowers()
      : FriendsService.getFollowing();

    fetchData
      .then((data) => {
        if (activeTab === 'followers') {
          setFollowers(data);
        } else {
          setFollowingList(data);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [activeTab, userId]);

  const data = activeTab === 'followers' ? followers : followingList;

  const renderItem = useCallback(({ item }: { item: UserProfilePublic }) => (
    <TouchableOpacity
      style={styles.userRow}
      onPress={() => navigation.push('FriendProfile', { user: item })}
      activeOpacity={0.7}
    >
      <Avatar username={item.username} displayName={item.display_name} size={40} />
      <View style={styles.userInfo}>
        {item.display_name ? (
          <Text style={[styles.displayName, { color: colors.spotTextPrimary }]} numberOfLines={1}>
            {item.display_name}
          </Text>
        ) : null}
        <Text style={[styles.username, { color: item.display_name ? colors.spotTextSecondary : colors.spotTextPrimary }]} numberOfLines={1}>
          @{item.username}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.spotTextSecondary} />
    </TouchableOpacity>
  ), [navigation, colors]);

  return (
    <View style={[styles.container, { backgroundColor: colors.spotBackground }]}>
      {/* Segmented control */}
      <View style={[styles.segmentedRow, { backgroundColor: colors.spotCardBackground, borderColor: colors.spotDivider }]}>
        {(['followers', 'following'] as const).map((tab) => {
          const active = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
              style={[styles.segment, active && { backgroundColor: colors.spotEmerald }]}
            >
              <Text style={[styles.segmentLabel, { color: active ? '#FFFFFF' : colors.spotTextSecondary }]}>
                {tab === 'followers' ? 'Followers' : 'Following'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.spotEmerald} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, data.length === 0 && { flex: 1 }]}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={[styles.emptyText, { color: colors.spotTextSecondary }]}>
                No {activeTab} yet
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  segmentedRow: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    gap: 3,
    marginHorizontal: 16,
    marginVertical: 12,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
  },
  segmentLabel: {
    ...SpotTypography.footnote,
    fontWeight: '500',
    fontFamily: 'PlusJakartaSans_500Medium',
  },
  listContent: { paddingVertical: 4 },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  userInfo: { flex: 1, gap: 1 },
  displayName: { ...SpotTypography.headline },
  username: { ...SpotTypography.footnote },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { ...SpotTypography.body },
});
