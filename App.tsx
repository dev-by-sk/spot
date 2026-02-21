import React, { useEffect } from 'react';
import { Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { DatabaseProvider } from './src/db/database';
import { AuthProvider } from './src/context/AuthContext';
import { PlacesProvider } from './src/context/PlacesContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { analytics } from './src/services/analyticsService';

// Deep linking configuration for share extension
const linking = {
  prefixes: ['spot://'],
  config: {
    screens: {
      MainTabs: {
        screens: {
          Search: 'share',
        },
      },
    },
  },
};

export default function App() {
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    analytics.configure();

    // Handle deep link when app is opened via share extension
    const handleDeepLink = (event: { url: string }) => {
      if (event.url === 'spot://share') {
        console.log('[Share] Deep link received — extraction handled by share context');
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => subscription.remove();
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <DatabaseProvider>
            <AuthProvider>
              <PlacesProvider>
                <NavigationContainer linking={linking}>
                  <RootNavigator />
                  <StatusBar style="auto" />
                </NavigationContainer>
              </PlacesProvider>
            </AuthProvider>
          </DatabaseProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
