import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SavedPlacesListScreen } from '../screens/list/SavedPlacesListScreen';
import { SpotDetailScreen } from '../screens/list/SpotDetailScreen';
import { useSpotColors } from '../theme/colors';
import type { ListStackParamList } from './types';

const Stack = createNativeStackNavigator<ListStackParamList>();

export function ListStackNavigator() {
  const colors = useSpotColors();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.spotBackground },
        headerTintColor: colors.spotEmerald,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="SavedPlacesList"
        component={SavedPlacesListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PlaceDetail"
        component={SpotDetailScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
