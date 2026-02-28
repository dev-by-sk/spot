import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useSpotColors } from '../../theme/colors';
import { SpotTypography } from '../../theme/typography';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '../../config/constants';

// Required on Android for LayoutAnimation
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function LoginScreen() {
  const { signInWithGoogle, isLoading, errorMessage } = useAuth();
  const colors = useSpotColors();

  // Keep a local copy of the error so it remains visible during the fade-out
  const [visibleError, setVisibleError] = useState<string | null>(null);
  const errorOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (errorMessage) {
      // Show: snap opacity to 0, then animate layout in + fade in
      errorOpacity.setValue(0);
      setVisibleError(errorMessage);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      Animated.timing(errorOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else if (visibleError) {
      // Hide: fade out first, then animate layout collapse
      Animated.timing(errorOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setVisibleError(null);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorMessage]);

  return (
    <View style={[styles.container, { backgroundColor: colors.spotBackground }]}>
      <View style={styles.spacer} />

      {/* Logo */}
      <View style={styles.logoSection}>
        <Text style={[styles.logo, { color: colors.spotEmerald }]}>spot.</Text>
        <Text style={[styles.tagline, { color: colors.spotTextSecondary }]}>
          Save every spot worth visiting
        </Text>
      </View>

      <View style={styles.spacer} />

      {/* Error message — sits above the button so it pushes it down */}
      {visibleError && (
        <Animated.View style={[styles.errorContainer, { opacity: errorOpacity }]}>
          <Ionicons name="alert-circle" size={13} color={colors.spotDanger} />
          <Text style={[styles.errorText, { color: colors.spotDanger }]}>
            {visibleError}
          </Text>
        </Animated.View>
      )}

      {/* Auth buttons */}
      <View style={styles.authSection}>
        <TouchableOpacity
          onPress={signInWithGoogle}
          disabled={isLoading}
          activeOpacity={0.7}
          style={[
            styles.googleButton,
            {
              backgroundColor: colors.spotEmerald,
              opacity: isLoading ? 0.6 : 1,
            },
          ]}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="logo-google" size={20} color="#FFFFFF" />
              <Text style={[styles.googleText, { color: '#FFFFFF' }]}>
                Sign in with Google
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Terms */}
      <View style={styles.termsRow}>
        <Text style={[styles.terms, { color: colors.spotTextSecondary }]}>By continuing, you agree to our </Text>
        <TouchableOpacity onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)} activeOpacity={0.6}>
          <Text style={[styles.terms, styles.termsLink, { color: colors.spotTextSecondary }]}>Terms of Service</Text>
        </TouchableOpacity>
        <Text style={[styles.terms, { color: colors.spotTextSecondary }]}> and </Text>
        <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_POLICY_URL)} activeOpacity={0.6}>
          <Text style={[styles.terms, styles.termsLink, { color: colors.spotTextSecondary }]}>Privacy Policy</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  spacer: {
    flex: 1,
  },
  logoSection: {
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  tagline: {
    ...SpotTypography.body,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 12,
    paddingHorizontal: 24,
  },
  errorText: {
    ...SpotTypography.footnote,
  },
  authSection: {
    paddingHorizontal: 24,
    gap: 12,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  googleText: {
    ...SpotTypography.headline,
  },
  termsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 24,
    paddingBottom: 48,
  },
  terms: {
    ...SpotTypography.caption,
    textAlign : 'center',
  },
  termsLink: {
    textDecorationLine: 'underline',
  },
});
