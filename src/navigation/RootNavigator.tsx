import React, { useEffect, useRef, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../hooks/useAuth';
import { SplashScreen } from '../screens/splash/SplashScreen';
import { OnboardingScreen } from '../screens/onboarding/OnboardingScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { UsernameSetupScreen } from '../screens/onboarding/UsernameSetupScreen';
import { MainTabNavigator } from './MainTabNavigator';
import type { RootStackParamList } from './types';

const ONBOARDING_KEY = 'hasSeenOnboarding';
const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { isAuthenticated, isLoading, hasUsername, checkSession } = useAuth();
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);

  // Track whether auth state has been resolved at least once and whether
  // the user was ever authenticated this session, so we can distinguish:
  //  - app open with no session  → reset onboarding
  //  - sign-in failure           → stay on login (no reset)
  //  - sign-out                  → reset onboarding
  const initialCheckDone = useRef(false);
  const wasAuthenticated = useRef(false);

  useEffect(() => {
    (async () => {
      const seen = await AsyncStorage.getItem(ONBOARDING_KEY);
      setHasSeenOnboarding(seen === 'true');
      await checkSession();
    })();
  }, [checkSession]);

  useEffect(() => {
    if (isLoading) return;

    if (!initialCheckDone.current) {
      // First resolution after app open
      initialCheckDone.current = true;
      if (isAuthenticated) {
        wasAuthenticated.current = true;
      } else {
        // No valid session on startup → restart from onboarding
        AsyncStorage.setItem(ONBOARDING_KEY, 'false');
        setHasSeenOnboarding(false);
      }
      return;
    }

    if (isAuthenticated) {
      wasAuthenticated.current = true;
    } else if (wasAuthenticated.current) {
      // Transitioned from authenticated → unauthenticated: genuine sign-out
      wasAuthenticated.current = false;
      AsyncStorage.setItem(ONBOARDING_KEY, 'false');
      setHasSeenOnboarding(false);
    }
    // else: was never authenticated this session → sign-in failed → do nothing
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
      ) : isAuthenticated && !hasUsername ? (
        <Stack.Screen name="UsernameSetup" component={UsernameSetupScreen} />
      ) : isAuthenticated ? (
        <Stack.Screen name="MainTabs" component={MainTabNavigator} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}
