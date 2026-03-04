import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateToSearch() {
  if (navigationRef.isReady()) {
    navigationRef.navigate('MainTabs', { screen: 'Search' });
  }
}
