import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FriendsService from '../../services/friendsService';
import { useFriends } from '../../hooks/useFriends';
import { Avatar } from '../../components/Avatar';
import { useSpotColors } from '../../theme/colors';
import { SpotTypography } from '../../theme/typography';
import type { FollowRequest } from '../../types/social';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function FollowRequestsScreen() {
  const navigation = useNavigation();
  const { refreshPendingCount } = useFriends();
  const colors = useSpotColors();
  const insets = useSafeAreaInsets();
  const [requests, setRequests] = useState<FollowRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const data = await FriendsService.getFollowRequests();
      setRequests(data);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const handleAccept = useCallback(async (req: FollowRequest) => {
    setActioningId(req.id);
    try {
      await FriendsService.acceptFollowRequest(req.id);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setRequests(prev => prev.filter(r => r.id !== req.id));
      refreshPendingCount();
    } catch {
      // silent
    } finally {
      setActioningId(null);
    }
  }, [refreshPendingCount]);

  const handleReject = useCallback(async (req: FollowRequest) => {
    setActioningId(req.id);
    try {
      await FriendsService.rejectFollowRequest(req.id);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setRequests(prev => prev.filter(r => r.id !== req.id));
      refreshPendingCount();
    } catch {
      // silent
    } finally {
      setActioningId(null);
    }
  }, [refreshPendingCount]);

  if (isLoading) {
    return (
      <View style={[{ flex: 1, backgroundColor: colors.spotBackground }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={28} color={colors.spotTextPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.spotTextPrimary }]}>Follow Requests</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.spotEmerald} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.spotBackground }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={28} color={colors.spotTextPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.spotTextPrimary }]}>Follow Requests</Text>
        <View style={styles.backButton} />
      </View>
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={[
        styles.list,
        styles.listGrow,
        requests.length === 0 && styles.listEmpty,
        { paddingBottom: insets.bottom + 16 },
      ]}
      data={requests}
      keyExtractor={r => r.id}
      onRefresh={() => load(true)}
      refreshing={isRefreshing}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="checkmark-circle-outline" size={44} color={colors.spotTextSecondary} style={{ opacity: 0.4 }} />
          <Text style={[styles.emptyText, { color: colors.spotTextSecondary }]}>No pending requests</Text>
        </View>
      }
      renderItem={({ item }) => {
        const isActioning = actioningId === item.id;
        return (
          <View style={[styles.row, { borderBottomColor: colors.spotDivider }]}>
            <Avatar username={item.follower.username} displayName={item.follower.display_name} size={44} />
            <View style={styles.info}>
              <Text style={[styles.name, { color: colors.spotTextPrimary }]} numberOfLines={1}>
                {item.follower.display_name ?? item.follower.username}
              </Text>
              <Text style={[styles.username, { color: colors.spotTextSecondary }]} numberOfLines={1}>
                @{item.follower.username}
              </Text>
            </View>
            {isActioning ? (
              <ActivityIndicator size="small" color={colors.spotEmerald} style={styles.spinner} />
            ) : (
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.acceptBtn, { backgroundColor: colors.spotEmerald }]}
                  onPress={() => handleAccept(item)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.acceptText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.rejectBtn, { borderColor: colors.spotDivider }]}
                  onPress={() => handleReject(item)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={18} color={colors.spotTextSecondary} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      }}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backButton: {
    padding: 4,
    width: 36,
  },
  headerTitle: {
    ...SpotTypography.headline,
    flex: 1,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  list: { paddingTop: 8 },
  listGrow: { flexGrow: 1 },
  listEmpty: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { ...SpotTypography.body },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  info: { flex: 1 },
  name: { ...SpotTypography.headline },
  username: { ...SpotTypography.footnote },
  spinner: { width: 44 },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  acceptBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  acceptText: {
    ...SpotTypography.footnote,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#fff',
  },
  rejectBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
