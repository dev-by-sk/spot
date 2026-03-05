import type { NavigatorScreenParams } from '@react-navigation/native';
import type { SavedPlaceLocal } from '../types';
import type { UserProfilePublic } from '../types/social';

export type ListStackParamList = {
  SavedPlacesList: undefined;
  PlaceDetail: { place: SavedPlaceLocal };
};

export type FriendsStackParamList = {
  FriendsHome: undefined;
  FriendProfile: { user: UserProfilePublic } | { username: string };
  FriendPlaceDetail: { place: SavedPlaceLocal; friendUsername: string };
  FollowList: { userId: string; initialTab?: 'followers' | 'following' };
  FollowRequests: undefined;
};

export type MainTabParamList = {
  List: NavigatorScreenParams<ListStackParamList>;
  Search: undefined;
  Friends: NavigatorScreenParams<FriendsStackParamList>;
  Profile: undefined;
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
