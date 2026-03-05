import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  LayoutAnimation,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSpotColors } from '../../theme/colors';
import { SpotTypography } from '../../theme/typography';
import { Avatar } from '../../components/Avatar';
import { useFriends } from '../../context/FriendsContext';
import * as FriendsService from '../../services/friendsService';
import type { FollowRequest } from '../../types/social';

export function FollowRequestsScreen() {
  const colors = useSpotColors();
  const { refreshPendingCount, refreshFollowing } = useFriends();
  const [requests, setRequests] = useState<FollowRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    FriendsService.getFollowRequests()
      .then(setRequests)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const handleAccept = useCallback(async (request: FollowRequest) => {
    setProcessingIds((prev) => new Set(prev).add(request.id));
    try {
      await FriendsService.acceptFollowRequest(request.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
      refreshPendingCount();
      refreshFollowing();
    } catch {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(request.id);
        return next;
      });
    }
  }, [refreshPendingCount, refreshFollowing]);

  const handleReject = useCallback(async (request: FollowRequest) => {
    setProcessingIds((prev) => new Set(prev).add(request.id));
    try {
      await FriendsService.rejectFollowRequest(request.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
      refreshPendingCount();
    } catch {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(request.id);
        return next;
      });
    }
  }, [refreshPendingCount]);

  const renderItem = useCallback(({ item }: { item: FollowRequest }) => {
    const isProcessing = processingIds.has(item.id);
    return (
      <View style={[styles.requestRow, { opacity: isProcessing ? 0.5 : 1 }]}>
        <Avatar
          username={item.follower.username}
          displayName={item.follower.display_name}
          size={44}
        />
        <View style={styles.requestInfo}>
          {item.follower.display_name ? (
            <Text style={[styles.displayName, { color: colors.spotTextPrimary }]} numberOfLines={1}>
              {item.follower.display_name}
            </Text>
          ) : null}
          <Text style={[styles.username, { color: item.follower.display_name ? colors.spotTextSecondary : colors.spotTextPrimary }]} numberOfLines={1}>
            @{item.follower.username}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.acceptButton, { backgroundColor: colors.spotEmerald }]}
          onPress={() => handleAccept(item)}
          disabled={isProcessing}
          activeOpacity={0.7}
        >
          <Text style={styles.acceptText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.rejectButton, { backgroundColor: colors.spotDivider }]}
          onPress={() => handleReject(item)}
          disabled={isProcessing}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={18} color={colors.spotTextSecondary} />
        </TouchableOpacity>
      </View>
    );
  }, [processingIds, colors, handleAccept, handleReject]);

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.spotBackground }]}>
        <ActivityIndicator color={colors.spotEmerald} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.spotBackground }]}>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, requests.length === 0 && { flex: 1 }]}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Ionicons name="checkmark-circle-outline" size={44} color={colors.spotTextSecondary} style={{ opacity: 0.4 }} />
            <Text style={[styles.emptyText, { color: colors.spotTextSecondary }]}>
              No pending requests
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  listContent: { paddingVertical: 8 },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  requestInfo: { flex: 1, gap: 1 },
  displayName: { ...SpotTypography.headline },
  username: { ...SpotTypography.footnote },
  acceptButton: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
  },
  acceptText: {
    ...SpotTypography.footnote,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#FFFFFF',
  },
  rejectButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: { ...SpotTypography.body },
});
