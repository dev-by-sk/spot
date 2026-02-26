import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { ShareIntentProvider } from 'expo-share-intent';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { DatabaseProvider } from './src/db/database';
import { AuthProvider } from './src/context/AuthContext';
import { PlacesProvider } from './src/context/PlacesContext';
import { ShareProvider } from './src/context/ShareContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { analytics } from './src/services/analyticsService';

// Deep linking configuration
const linking = {
  prefixes: ['spot://'],
  config: {
    screens: {
      MainTabs: {
        screens: {
          Search: 'search',
        },
      },
    },
  },
};

export default function App() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    analytics.configure();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ShareIntentProvider>
            <DatabaseProvider>
              <AuthProvider>
                <PlacesProvider>
                  <ShareProvider>
                    <NavigationContainer linking={linking}>
                      <RootNavigator />
                      <StatusBar style="auto" />
                    </NavigationContainer>
                  </ShareProvider>
                </PlacesProvider>
              </AuthProvider>
            </DatabaseProvider>
          </ShareIntentProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
