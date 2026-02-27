import { useTheme } from '../context/ThemeContext';

// ── Brand ──
export const spotEmerald = '#047857';
export const spotEmeraldLight = '#059669';
export const spotEmeraldDark = '#065F46';

// ── Semantic ──
export const spotDanger = '#DC2626';

// ── Adaptive colors (light / dark) ──
const lightColors = {
  spotTextPrimary: '#111827',
  spotTextSecondary: '#6B7280',
  spotBackground: '#F2F0EC',
  spotCardBackground: '#FFFFFF',
  spotDivider: '#E0DDD7',
  spotSearchBar: '#EBE9E4',
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
  const { resolvedScheme } = useTheme();
  const adaptive = resolvedScheme === 'dark' ? darkColors : lightColors;
  return {
    ...adaptive,
    spotEmerald,
    spotEmeraldLight,
    spotEmeraldDark,
    spotDanger,
  };
}
