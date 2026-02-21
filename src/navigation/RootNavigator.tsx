import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../hooks/useAuth';
import { SplashScreen } from '../screens/splash/SplashScreen';
import { OnboardingScreen } from '../screens/onboarding/OnboardingScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { MainTabNavigator } from './MainTabNavigator';
import type { RootStackParamList } from './types';

const ONBOARDING_KEY = 'hasSeenOnboarding';
const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { isAuthenticated, isLoading, checkSession } = useAuth();
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const seen = await AsyncStorage.getItem(ONBOARDING_KEY);
      setHasSeenOnboarding(seen === 'true');
      await checkSession();
    })();
  }, [checkSession]);

  // Reset onboarding for unauthenticated users (matches Swift behavior)
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      AsyncStorage.setItem(ONBOARDING_KEY, 'false');
      setHasSeenOnboarding(false);
    }
  }, [isLoading, isAuthenticated]);

  const handleOnboardingComplete = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    setHasSeenOnboarding(true);
  };

  // Still loading onboarding flag
  if (hasSeenOnboarding === null) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!hasSeenOnboarding ? (
        <Stack.Screen name="Onboarding">
          {() => <OnboardingScreen onComplete={handleOnboardingComplete} />}
        </Stack.Screen>
      ) : isLoading ? (
        <Stack.Screen name="Splash" component={SplashScreen} />
      ) : isAuthenticated ? (
        <Stack.Screen name="MainTabs" component={MainTabNavigator} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}
