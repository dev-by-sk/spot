import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSpotColors } from '../theme/colors';
import { FriendsHomeScreen } from '../screens/friends/FriendsHomeScreen';
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
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="FriendsHome" component={FriendsHomeScreen} options={{ headerShown: false, title: 'Friends' }} />
      <Stack.Screen name="FollowRequests" component={FollowRequestsScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
