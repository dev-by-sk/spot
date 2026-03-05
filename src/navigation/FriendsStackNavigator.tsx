import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSpotColors } from '../theme/colors';
import { FriendsHomeScreen } from '../screens/friends/FriendsHomeScreen';
import { FriendProfileScreen } from '../screens/friends/FriendProfileScreen';
import { FriendPlaceDetailScreen } from '../screens/friends/FriendPlaceDetailScreen';
import { FollowListScreen } from '../screens/friends/FollowListScreen';
import { FollowRequestsScreen } from '../screens/friends/FollowRequestsScreen';
import type { FriendsStackParamList } from './types';

const Stack = createNativeStackNavigator<FriendsStackParamList>();

export function FriendsStackNavigator() {
  const colors = useSpotColors();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.spotBackground },
        headerTintColor: colors.spotTextPrimary,
        headerTitleStyle: { fontFamily: 'PlusJakartaSans_600SemiBold' },
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen
        name="FriendsHome"
        component={FriendsHomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="FriendProfile"
        component={FriendProfileScreen}
        options={{ title: '' }}
      />
      <Stack.Screen
        name="FriendPlaceDetail"
        component={FriendPlaceDetailScreen}
        options={{ title: 'Spot Details' }}
      />
      <Stack.Screen
        name="FollowList"
        component={FollowListScreen}
        options={{ title: '' }}
      />
      <Stack.Screen
        name="FollowRequests"
        component={FollowRequestsScreen}
        options={{ title: 'Follow Requests' }}
      />
    </Stack.Navigator>
  );
}
