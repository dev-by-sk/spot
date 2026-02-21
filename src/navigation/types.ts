import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  List: undefined;
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
