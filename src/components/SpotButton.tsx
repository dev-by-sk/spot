import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
} from 'react-native';
import { spotEmerald } from '../theme/colors';
import { SpotTypography } from '../theme/typography';

interface SpotButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'outline';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function SpotButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: SpotButtonProps) {
  const isPrimary = variant === 'primary';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={[
        styles.base,
        isPrimary ? styles.primary : styles.outline,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#FFFFFF' : spotEmerald} />
      ) : (
        <Text style={[styles.text, isPrimary ? styles.primaryText : styles.outlineText]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primary: {
    backgroundColor: spotEmerald,
  },
  outline: {
    borderWidth: 1.5,
    borderColor: spotEmerald,
  },
  disabled: {
    opacity: 0.6,
  },
  text: {
    ...SpotTypography.headline,
  },
  primaryText: {
    color: '#FFFFFF',
  },
  outlineText: {
    color: spotEmerald,
  },
});
