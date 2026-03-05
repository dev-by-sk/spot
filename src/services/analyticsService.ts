export enum AnalyticsEvent {
  // Auth
  SignUpCompleted = 'sign_up_completed',
  SignInCompleted = 'sign_in_completed',
  SignedOut = 'signed_out',
  AccountDeleteRequested = 'account_delete_requested',
  // Places
  PlaceSaved = 'place_saved',
  PlaceDeleted = 'place_deleted',
  NoteEdited = 'note_edited',
  DuplicateBlocked = 'duplicate_blocked',
  // Search
  SearchPerformed = 'search_performed',
  SearchResultTapped = 'search_result_tapped',
  // Filters
  FilterUsed = 'filter_used',
  // Navigation
  TabSwitched = 'tab_switched',
  OnboardingCompleted = 'onboarding_completed',
  // Sync
  SyncCompleted = 'sync_completed',
  // Social
  UsernameSet = 'username_set',
  UserFollowed = 'user_followed',
  UserUnfollowed = 'user_unfollowed',
  FollowRequestAccepted = 'follow_request_accepted',
  FollowRequestRejected = 'follow_request_rejected',
  FriendPlaceViewed = 'friend_place_viewed',
  FriendPlaceSaved = 'friend_place_saved',
  PrivacyToggled = 'privacy_toggled',
}

class AnalyticsService {
  private static instance: AnalyticsService;

  private constructor() {}

  static shared(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  configure(): void {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    const extra = Constants.expoConfig?.extra;

    if (extra?.posthogApiKey) {
      // TODO: PostHogSDK.setup(extra.posthogApiKey);
      if (__DEV__) console.log('[Analytics] PostHog API key found — uncomment SDK integration to enable');
    } else if (__DEV__) {
      console.log('[Analytics] PostHog not configured — add POSTHOG_API_KEY to .env');
    }

    if (extra?.sentryDsn) {
      // TODO: Sentry.init({ dsn: extra.sentryDsn });
      if (__DEV__) console.log('[Analytics] Sentry DSN found — uncomment SDK integration to enable');
    } else if (__DEV__) {
      console.log('[Analytics] Sentry not configured — add SENTRY_DSN to .env');
    }
  }

  track(event: AnalyticsEvent, properties: Record<string, unknown> = {}): void {
    const props = {
      ...properties,
      timestamp: new Date().toISOString(),
    };

    if (__DEV__) {
      console.log(`[Analytics] ${event}`, props);
    }

    // TODO: PostHogSDK.capture(event, props);
  }

  identify(userId: string, traits: Record<string, unknown> = {}): void {
    if (__DEV__) {
      console.log(`[Analytics] identify: ${userId}`, traits);
    }

    // TODO: PostHogSDK.identify(userId, traits);
    // TODO: Sentry.setUser({ id: userId });
  }

  reset(): void {
    if (__DEV__) {
      console.log('[Analytics] reset');
    }

    // TODO: PostHogSDK.reset();
    // TODO: Sentry.setUser(null);
  }
}

export const analytics = AnalyticsService.shared();
