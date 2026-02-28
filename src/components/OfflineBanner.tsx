import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { SpotTypography } from '../theme/typography';

const TAB_BAR_HEIGHT = 49;

export function OfflineBanner() {
  const isOnline = useNetworkStatus();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: isOnline ? 0 : 1,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [isOnline, anim]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [40, 0],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pill,
        {
          bottom: TAB_BAR_HEIGHT + insets.bottom + 20,
          opacity: anim,
          transform: [{ translateY }],
        },
      ]}
    >
      <Ionicons name="wifi-outline" size={13} color="#FFFFFF" />
      <Text style={styles.text}>No internet connection</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(17, 24, 39, 0.88)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 100,
  },
  text: {
    ...SpotTypography.footnote,
    color: '#FFFFFF',
    fontWeight: '500',
  },
});
