import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getAvatarColor, getAvatarInitials } from '../utils/avatar';

interface AvatarProps {
  username: string;
  displayName: string | null;
  size?: number;
}

export const Avatar = React.memo(function Avatar({
  username,
  displayName,
  size = 40,
}: AvatarProps) {
  const color = getAvatarColor(username);
  const initials = getAvatarInitials(displayName, username);
  const fontSize = Math.round(size * 0.38);

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
      ]}
    >
      <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  circle: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    includeFontPadding: false,
  },
});
