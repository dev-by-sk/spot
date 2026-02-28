import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import * as SupabaseService from '../../services/supabaseService';
import { useSpotColors } from '../../theme/colors';
import { SpotTypography } from '../../theme/typography';
import { spotEmerald } from '../../theme/colors';
import { useTheme, type ThemePreference } from '../../context/ThemeContext';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '../../config/constants';

const THEME_OPTIONS: { value: ThemePreference; icon: string; label: string }[] = [
  { value: 'light', icon: 'sunny-outline',  label: 'Light' },
  { value: 'system', icon: 'phone-portrait-outline', label: 'Auto'  },
  { value: 'dark',  icon: 'moon-outline',   label: 'Dark'  },
];

export function ProfileScreen() {
  const { userEmail, signOut, deleteAccount } = useAuth();
  const colors = useSpotColors();
  const { preference, setPreference } = useTheme();
  const [isPrivateProfile, setIsPrivateProfile] = useState(true);
  const [isTogglingPrivacy, setIsTogglingPrivacy] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const userInitial = userEmail ? userEmail.charAt(0).toUpperCase() : 'U';

  useEffect(() => {
    (async () => {
      try {
        const profile = await SupabaseService.getUserProfile();
        if (profile) {
          setIsPrivateProfile(profile.profile_private);
        }
      } catch (error) {
        console.warn('[Profile] Failed to load profile:', error);
      }
    })();
  }, []);

  const handlePrivacyToggle = async (value: boolean) => {
    if (isTogglingPrivacy) return;
    setIsPrivateProfile(value);
    setIsTogglingPrivacy(true);
    try {
      await SupabaseService.updateProfilePrivacy(value);
    } catch {
      setIsPrivateProfile(!value);
    } finally {
      setIsTogglingPrivacy(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Your account will be scheduled for deletion. You have 30 days to sign back in to cancel this request.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: deleteAccount,
        },
      ],
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.spotBackground }]}
      contentContainerStyle={styles.content}
    >
      {/* User info section */}
      <View style={styles.section}>
        <View style={styles.userRow}>
          <View style={[styles.avatar, { backgroundColor: colors.spotEmerald }]}>
            <Text style={styles.avatarText}>{userInitial}</Text>
          </View>
          <Text
            style={[styles.email, { color: colors.spotTextPrimary }]}
            numberOfLines={1}
          >
            {userEmail ?? 'User'}
          </Text>
        </View>
      </View>

      {/* Appearance section */}
      <View style={styles.section}>
        <Text style={[styles.sectionHeader, { color: colors.spotTextSecondary }]}>
          APPEARANCE
        </Text>
        <View style={[styles.segmentedRow, { backgroundColor: colors.spotCardBackground, borderColor: colors.spotDivider }]}>
          {THEME_OPTIONS.map((opt) => {
            const active = preference === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setPreference(opt.value)}
                activeOpacity={0.7}
                style={[
                  styles.segment,
                  active && { backgroundColor: colors.spotEmerald },
                ]}
              >
                <Ionicons
                  name={opt.icon as any}
                  size={14}
                  color={active ? '#FFFFFF' : colors.spotTextSecondary}
                />
                <Text style={[
                  styles.segmentLabel,
                  { color: active ? '#FFFFFF' : colors.spotTextSecondary },
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Privacy section */}
      <View style={styles.section}>
        <Text style={[styles.sectionHeader, { color: colors.spotTextSecondary }]}>
          PRIVACY
        </Text>
        <View style={[styles.row, { borderColor: colors.spotDivider }]}>
          <Text style={[styles.rowLabel, { color: colors.spotTextPrimary }]}>
            Private Profile
          </Text>
          {isTogglingPrivacy ? (
            <ActivityIndicator size="small" color={spotEmerald} />
          ) : (
            <Switch
              value={isPrivateProfile}
              onValueChange={handlePrivacyToggle}
              trackColor={{ true: spotEmerald }}
            />
          )}
        </View>
      </View>

      {/* Account section */}
      <View style={styles.section}>
        <Text style={[styles.sectionHeader, { color: colors.spotTextSecondary }]}>
          ACCOUNT
        </Text>
        <TouchableOpacity
          style={[styles.row, { borderColor: colors.spotDivider }]}
          onPress={handleDeleteAccount}
        >
          <Text style={[styles.rowLabel, { color: colors.spotDanger }]}>
            Delete Account
          </Text>
        </TouchableOpacity>
      </View>

      {/* Legal section */}
      <View style={styles.section}>
        <Text style={[styles.sectionHeader, { color: colors.spotTextSecondary }]}>
          LEGAL
        </Text>
        <TouchableOpacity
          style={[styles.row, { borderColor: colors.spotDivider }]}
          onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
        >
          <Text style={[styles.rowLabel, { color: colors.spotTextPrimary }]}>
            Privacy Policy
          </Text>
          <Ionicons name="open-outline" size={16} color={colors.spotTextSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.row, { borderColor: colors.spotDivider }]}
          onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}
        >
          <Text style={[styles.rowLabel, { color: colors.spotTextPrimary }]}>
            Terms of Service
          </Text>
          <Ionicons name="open-outline" size={16} color={colors.spotTextSecondary} />
        </TouchableOpacity>
      </View>

      {/* Log out */}
      <View style={styles.section}>
        <TouchableOpacity
          onPress={handleSignOut}
          disabled={isSigningOut}
          activeOpacity={0.7}
          style={[styles.logoutButton, { borderColor: colors.spotEmerald, opacity: isSigningOut ? 0.6 : 1 }]}
        >
          {isSigningOut ? (
            <ActivityIndicator size="small" color={colors.spotEmerald} />
          ) : (
            <Text style={[styles.logoutText, { color: colors.spotEmerald }]}>
              Log out
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingVertical: 16,
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    ...SpotTypography.caption,
    marginBottom: 8,
    paddingLeft: 4,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    ...SpotTypography.title3,
    color: '#FFFFFF',
  },
  email: {
    ...SpotTypography.headline,
    flex: 1,
  },
  segmentedRow: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 9,
  },
  segmentLabel: {
    ...SpotTypography.footnote,
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    ...SpotTypography.body,
  },
  logoutButton: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: {
    ...SpotTypography.headline,
  },
});
