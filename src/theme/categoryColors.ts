import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { PlaceCategory } from '../types';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface CategoryConfig {
  icon: IoniconName;
  iconSize: number;
  color: string;
  bg: string;
}

export const CATEGORY_CONFIG: Record<PlaceCategory, CategoryConfig> = {
  [PlaceCategory.Restaurant]:    { icon: 'restaurant-outline', iconSize: 18, color: '#EA7C2A', bg: 'rgba(251,146,60,0.12)' },
  [PlaceCategory.Cafe]:          { icon: 'cafe-outline',        iconSize: 21, color: '#A15F37', bg: 'rgba(161,95,55,0.12)'  },
  [PlaceCategory.Bar]:           { icon: 'wine-outline',         iconSize: 21, color: '#7C3AED', bg: 'rgba(139,92,246,0.12)' },
  [PlaceCategory.Dessert]:       { icon: 'ice-cream-outline',    iconSize: 21, color: '#DB2777', bg: 'rgba(236,72,153,0.12)' },
  [PlaceCategory.Activity]:      { icon: 'bicycle-outline',      iconSize: 20, color: '#2563EB', bg: 'rgba(59,130,246,0.12)' },
  [PlaceCategory.Entertainment]: { icon: 'film-outline',         iconSize: 20, color: '#0D9488', bg: 'rgba(20,184,166,0.12)' },
  [PlaceCategory.Gym]:           { icon: 'barbell-outline',      iconSize: 20, color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
  [PlaceCategory.Other]:         { icon: 'grid-outline',         iconSize: 20, color: '#6B7280', bg: 'rgba(107,114,128,0.10)'},
};
