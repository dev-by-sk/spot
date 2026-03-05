import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ListStackNavigator } from './ListStackNavigator';
import { FriendsStackNavigator } from './FriendsStackNavigator';
import { SearchScreen } from '../screens/search/SearchScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { useAuth } from '../hooks/useAuth';
import { usePlaces } from '../hooks/usePlaces';
import { useFriends } from '../context/FriendsContext';
import { analytics, AnalyticsEvent } from '../services/analyticsService';
import { useSpotColors } from '../theme/colors';
import { OfflineBanner } from '../components/OfflineBanner';
import { ToastBanner } from '../components/ToastBanner';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_NAMES: Record<string, string> = {
  List: 'list',
  Search: 'search',
  Friends: 'friends',
  Profile: 'profile',
};

export function MainTabNavigator() {
  const { currentUserId } = useAuth();
  const { syncPlaces } = usePlaces();
  const { pendingRequestCount } = useFriends();
  const colors = useSpotColors();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (currentUserId && !hasSynced.current) {
      hasSynced.current = true;
      syncPlaces(currentUserId).catch(() => {});
    }
  }, [currentUserId, syncPlaces]);

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.spotEmerald,
        tabBarInactiveTintColor: colors.spotTextSecondary,
        tabBarStyle: { backgroundColor: colors.spotBackground },
        headerStyle: { backgroundColor: colors.spotBackground },
        headerTintColor: colors.spotTextPrimary,
        tabBarLabelStyle: {
          fontFamily: 'PlusJakartaSans_500Medium',
          fontSize: 11,
        },
      }}
      screenListeners={{
        tabPress: (e) => {
          const tabName = TAB_NAMES[e.target?.split('-')[0] ?? ''] ?? '';
          if (tabName) {
            analytics.track(AnalyticsEvent.TabSwitched, { tab: tabName });
          }
        },
      }}
    >
      <Tab.Screen
        name="List"
        component={ListStackNavigator}
        options={{
          headerShown: false,
          title: 'My spots',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'bookmark' : 'bookmark-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Friends"
        component={FriendsStackNavigator}
        options={{
          headerShown: false,
          title: 'Friends',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={size} color={color} />
          ),
          tabBarBadge: pendingRequestCount > 0 ? pendingRequestCount : undefined,
          tabBarBadgeStyle: pendingRequestCount > 0 ? {
            backgroundColor: colors.spotEmerald,
            fontSize: 10,
            fontFamily: 'PlusJakartaSans_700Bold',
          } : undefined,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
      <OfflineBanner />
      <ToastBanner />
    </View>
  );
}
