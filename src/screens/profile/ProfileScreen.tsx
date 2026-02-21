import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import * as SupabaseService from '../../services/supabaseService';
import { useSpotColors } from '../../theme/colors';
import { SpotTypography } from '../../theme/typography';
import { spotEmerald } from '../../theme/colors';

export function ProfileScreen() {
  const { userEmail, signOut, deleteAccount } = useAuth();
  const colors = useSpotColors();
  const [isPrivateProfile, setIsPrivateProfile] = useState(true);

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
    setIsPrivateProfile(value);
    try {
      await SupabaseService.updateProfilePrivacy(value);
    } catch {
      // revert on error
      setIsPrivateProfile(!value);
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

      {/* Privacy section */}
      <View style={styles.section}>
        <Text style={[styles.sectionHeader, { color: colors.spotTextSecondary }]}>
          PRIVACY
        </Text>
        <View style={[styles.row, { borderColor: colors.spotDivider }]}>
          <Text style={[styles.rowLabel, { color: colors.spotTextPrimary }]}>
            Private Profile
          </Text>
          <Switch
            value={isPrivateProfile}
            onValueChange={handlePrivacyToggle}
            trackColor={{ true: spotEmerald }}
          />
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

      {/* Log out */}
      <View style={styles.section}>
        <TouchableOpacity
          onPress={signOut}
          activeOpacity={0.7}
          style={[styles.logoutButton, { borderColor: colors.spotEmerald }]}
        >
          <Text style={[styles.logoutText, { color: colors.spotEmerald }]}>
            Log out
          </Text>
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
