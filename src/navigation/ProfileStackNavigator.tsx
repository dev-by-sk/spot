import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSpotColors } from '../theme/colors';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { FollowListScreen } from '../screens/friends/FollowListScreen';
import type { ProfileStackParamList } from './types';

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export function ProfileStackNavigator() {
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
      <Stack.Screen name="ProfileHome" component={ProfileScreen} options={{ headerShown: false, title: 'Profile' }} />
      <Stack.Screen name="FollowList" component={FollowListScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
