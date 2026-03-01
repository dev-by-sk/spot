import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { ShareIntentProvider } from 'expo-share-intent';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { DatabaseProvider } from './src/db/database';
import { AuthProvider } from './src/context/AuthContext';
import { PlacesProvider } from './src/context/PlacesContext';
import { ShareProvider } from './src/context/ShareContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { ToastProvider } from './src/context/ToastContext';
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

function ThemedApp() {
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: isDark ? '#000000' : '#F2F0EC',
      card: isDark ? '#1C1C1E' : '#FFFFFF',
      border: isDark ? '#38383A' : '#E0DDD7',
      text: isDark ? '#FFFFFF' : '#111827',
    },
  };

  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      <RootNavigator />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </NavigationContainer>
  );
}

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
          <ThemeProvider>
            <ToastProvider>
            <ShareIntentProvider>
              <DatabaseProvider>
                <AuthProvider>
                  <PlacesProvider>
                    <ShareProvider>
                      <ThemedApp />
                    </ShareProvider>
                  </PlacesProvider>
                </AuthProvider>
              </DatabaseProvider>
            </ShareIntentProvider>
            </ToastProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
