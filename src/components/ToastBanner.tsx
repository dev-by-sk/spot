import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useToast, ToastType } from '../context/ToastContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { SpotTypography } from '../theme/typography';

const TAB_BAR_HEIGHT = 49;
const OFFLINE_BANNER_HEIGHT = 44;

const ICON_MAP: Record<ToastType, keyof typeof Ionicons.glyphMap> = {
  error: 'alert-circle',
  success: 'checkmark-circle',
  info: 'information-circle',
};

export function ToastBanner() {
  const { current, dismiss } = useToast();
  const isOnline = useNetworkStatus();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: current ? 1 : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [current, anim]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [40, 0],
  });

  const offlineOffset = !isOnline ? OFFLINE_BANNER_HEIGHT : 0;
  const isError = current?.type === 'error';

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.pill,
        {
          bottom: TAB_BAR_HEIGHT + insets.bottom + 20 + offlineOffset,
          opacity: anim,
          transform: [{ translateY }],
          backgroundColor: isError
            ? 'rgba(220, 38, 38, 0.92)'
            : 'rgba(17, 24, 39, 0.88)',
        },
      ]}
    >
      {current && (
        <>
          <Ionicons
            name={ICON_MAP[current.type]}
            size={15}
            color="#FFFFFF"
          />
          <Text style={styles.text} numberOfLines={2}>
            {current.text}
          </Text>
          {current.action && (
            <TouchableOpacity
              onPress={() => {
                current.action!.onPress();
                dismiss();
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.actionButton}
            >
              <Text style={styles.actionText}>{current.action.label}</Text>
            </TouchableOpacity>
          )}
        </>
      )}
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
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 101,
    maxWidth: '90%',
  },
  text: {
    ...SpotTypography.footnote,
    color: '#FFFFFF',
    fontWeight: '500',
    flexShrink: 1,
  },
  actionButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 2,
  },
  actionText: {
    ...SpotTypography.footnote,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
