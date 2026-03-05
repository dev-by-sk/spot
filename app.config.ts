import 'dotenv/config';
import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'spot.',
  slug: 'spot-react-native',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  scheme: 'spot',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.spot.app',
    // usesAppleSignIn: true,
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'spot. uses your location to filter saved places by distance.',
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    edgeToEdgeEnabled: true,
    package: 'com.spot.app',
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
  },
  plugins: [
    // 'expo-apple-authentication',
    'expo-location',
    'expo-sqlite',
    'expo-screen-orientation',
    'expo-web-browser',
    'expo-secure-store',
    './plugins/withAsyncShareExtension',
    [
      'expo-share-intent',
      {
        iosActivationRules: {
          NSExtensionActivationSupportsWebURLWithMaxCount: 1,
          NSExtensionActivationSupportsText: true,
        },
      },
    ],
  ],
  extra: {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID,
    posthogApiKey: process.env.POSTHOG_API_KEY,
    sentryDsn: process.env.SENTRY_DSN,
  },
});
