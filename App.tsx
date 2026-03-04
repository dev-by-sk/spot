import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { ShareIntentProvider } from 'expo-share-intent';
import * as Linking from 'expo-linking';
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
import { navigationRef } from './src/navigation/navigationRef';
import { analytics } from './src/services/analyticsService';

// Deep linking configuration
// getInitialURL and subscribe filter out share intent URLs (containing "dataUrl=")
// so React Navigation doesn't consume them — expo-share-intent handles those instead.
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
  async getInitialURL() {
    const url = await Linking.getInitialURL();
    console.log('[Linking] getInitialURL:', url);
    if (url && url.includes('dataUrl=')) {
      console.log('[Linking] Filtered share intent URL from React Navigation');
      return null;
    }
    return url;
  },
  subscribe(listener: (url: string) => void) {
    const sub = Linking.addEventListener('url', ({ url }) => {
      console.log('[Linking] Incoming URL:', url);
      if (url.includes('dataUrl=')) {
        console.log('[Linking] Filtered share intent URL from React Navigation');
      } else {
        listener(url);
      }
    });
    return () => sub.remove();
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
    <NavigationContainer ref={navigationRef} theme={navTheme} linking={linking}>
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
