import type { NavigatorScreenParams } from '@react-navigation/native';
import type { SavedPlaceLocal } from '../types';

export type ListStackParamList = {
  SavedPlacesList: undefined;
  PlaceDetail: { place: SavedPlaceLocal };
};

export type FriendsStackParamList = {
  FriendsHome: undefined;
  FollowRequests: undefined;
};

export type ProfileStackParamList = {
  ProfileHome: undefined;
  FollowList: { userId: string; initialTab?: 'followers' | 'following' };
};

export type MainTabParamList = {
  List: NavigatorScreenParams<ListStackParamList>;
  Search: undefined;
  Friends: NavigatorScreenParams<FriendsStackParamList>;
  Profile: NavigatorScreenParams<ProfileStackParamList>;
};

export type RootStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Splash: undefined;
  UsernameSetup: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList>;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
