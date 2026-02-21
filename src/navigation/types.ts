import type { NavigatorScreenParams } from '@react-navigation/native';
import type { SavedPlaceLocal } from '../types';

export type ListStackParamList = {
  SavedPlacesList: undefined;
  PlaceDetail: { place: SavedPlaceLocal };
};

export type MainTabParamList = {
  List: NavigatorScreenParams<ListStackParamList>;
  Search: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Splash: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList>;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
