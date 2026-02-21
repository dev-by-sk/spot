import { useColorScheme } from 'react-native';

// ── Brand ──
export const spotEmerald = '#047857';
export const spotEmeraldLight = '#059669';
export const spotEmeraldDark = '#065F46';

// ── Semantic ──
export const spotDanger = '#DC2626';

// ── Adaptive colors (light / dark) ──
const lightColors = {
  spotTextPrimary: '#000000',
  spotTextSecondary: '#6B7280',
  spotBackground: '#FFFFFF',
  spotCardBackground: '#F3F4F6',
  spotDivider: '#D1D5DB',
  spotSearchBar: '#F3F4F6',
};

const darkColors = {
  spotTextPrimary: '#FFFFFF',
  spotTextSecondary: '#9CA3AF',
  spotBackground: '#000000',
  spotCardBackground: '#1C1C1E',
  spotDivider: '#38383A',
  spotSearchBar: '#1C1C1E',
};

export type SpotColors = typeof lightColors & {
  spotEmerald: string;
  spotEmeraldLight: string;
  spotEmeraldDark: string;
  spotDanger: string;
};

export function useSpotColors(): SpotColors {
  const scheme = useColorScheme();
  const adaptive = scheme === 'dark' ? darkColors : lightColors;
  return {
    ...adaptive,
    spotEmerald,
    spotEmeraldLight,
    spotEmeraldDark,
    spotDanger,
  };
}
