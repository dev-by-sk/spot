import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSpotColors } from '../../theme/colors';

export function SplashScreen() {
  const colors = useSpotColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.spotBackground }]}>
      <Text style={[styles.logo, { color: colors.spotEmerald }]}>spot.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 48,
    fontWeight: 'bold',
  },
});
