import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useSpotColors } from '../../theme/colors';
import { SpotTypography } from '../../theme/typography';

export function LoginScreen() {
  const { signInWithApple, signInWithGoogle, isLoading, errorMessage } = useAuth();
  const colors = useSpotColors();

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

      {/* Auth buttons */}
      <View style={styles.authSection}>
        {/* Apple Sign-In (iOS only) */}
        {Platform.OS === 'ios' && (
          <View style={[styles.appleButtonWrapper, { borderColor: colors.spotDivider }]}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
              cornerRadius={11}
              style={styles.appleButton}
              onPress={signInWithApple}
            />
          </View>
        )}

        {/* Google Sign-In */}
        <TouchableOpacity
          onPress={signInWithGoogle}
          disabled={isLoading}
          activeOpacity={0.7}
          style={[
            styles.googleButton,
            {
              borderColor: colors.spotDivider,
              opacity: isLoading ? 0.6 : 1,
            },
          ]}
        >
          <Ionicons name="logo-google" size={20} color={colors.spotTextPrimary} />
          <Text style={[styles.googleText, { color: colors.spotTextPrimary }]}>
            Sign in with Google
          </Text>
        </TouchableOpacity>
      </View>

      {/* Loading indicator */}
      {isLoading && (
        <ActivityIndicator
          color={colors.spotEmerald}
          style={styles.loader}
        />
      )}

      {/* Error message */}
      {errorMessage && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={13} color={colors.spotDanger} />
          <Text style={[styles.errorText, { color: colors.spotDanger }]}>
            {errorMessage}
          </Text>
        </View>
      )}

      {/* Terms */}
      <Text style={[styles.terms, { color: colors.spotTextSecondary }]}>
        By continuing, you agree to our Terms of Service and Privacy Policy
      </Text>
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
  authSection: {
    paddingHorizontal: 24,
    gap: 12,
  },
  appleButtonWrapper: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  appleButton: {
    height: 52,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  googleText: {
    ...SpotTypography.headline,
  },
  loader: {
    marginTop: 16,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 12,
    paddingHorizontal: 24,
  },
  errorText: {
    ...SpotTypography.footnote,
  },
  terms: {
    ...SpotTypography.caption,
    textAlign: 'center',
    paddingHorizontal: 40,
    paddingTop: 24,
    paddingBottom: 48,
  },
});
