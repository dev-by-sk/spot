import { StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { spotEmerald } from './colors';
import { SpotTypography } from './typography';

export const spotCardStyle: ViewStyle = {
  padding: 16,
  borderRadius: 12,
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};

export const spotPrimaryButtonStyle = StyleSheet.create({
  container: {
    backgroundColor: spotEmerald,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  } as ViewStyle,
  text: {
    ...SpotTypography.headline,
    color: '#FFFFFF',
  } as TextStyle,
});

export const spotOutlineButtonStyle = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: spotEmerald,
    paddingVertical: 14,
    alignItems: 'center',
  } as ViewStyle,
  text: {
    ...SpotTypography.headline,
    color: spotEmerald,
  } as TextStyle,
});
