/**
 * Tests for AuthContext.tsx
 *
 * Targets medium-severity bugs from docs/test-scenarios.md:
 * - 6.1.9  [SECURITY] handleSignOut — local SQLite data NOT cleared
 *   (AuthContext.tsx:174-191)
 * - 6.1.11 [SECURITY] deleteAccount — local SQLite data NOT cleared
 *   (AuthContext.tsx:193-213)
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { AuthProvider, AuthContext } from '../AuthContext';

// ── Mocks ──

const mockSignOut = jest.fn().mockResolvedValue(undefined);
const mockSoftDeleteAccount = jest.fn().mockResolvedValue(undefined);
const mockGetCurrentSession = jest.fn().mockResolvedValue({
  userId: 'user-1',
  email: 'test@example.com',
  provider: 'google',
});

jest.mock('../../services/supabaseService', () => ({
  getCurrentSession: (...args: any[]) => mockGetCurrentSession(...args),
  signOut: (...args: any[]) => mockSignOut(...args),
  softDeleteAccount: (...args: any[]) => mockSoftDeleteAccount(...args),
  getUserProfile: jest.fn().mockResolvedValue(null),
  cancelDeleteAccount: jest.fn().mockResolvedValue(undefined),
}));

const mockLocalSignOut = jest.fn().mockResolvedValue(undefined);

jest.mock('../../config/supabase', () => ({
  supabase: {
    auth: {
      signOut: (...args: any[]) => mockLocalSignOut(...args),
      signInWithOAuth: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
  },
}));

// Track whether any SQLite-clearing functions are called
const mockDeleteLocalSavedPlace = jest.fn();
const mockExecAsync = jest.fn();

jest.mock('../../db/database', () => ({
  getDatabase: jest.fn().mockResolvedValue({
    execAsync: (...args: any[]) => mockExecAsync(...args),
    runAsync: jest.fn(),
    getAllAsync: jest.fn().mockResolvedValue([]),
  }),
  deleteLocalSavedPlace: (...args: any[]) => mockDeleteLocalSavedPlace(...args),
}));

jest.mock('../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => true,
}));

jest.mock('../ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock('../../services/analyticsService', () => ({
  analytics: { track: jest.fn(), identify: jest.fn(), reset: jest.fn() },
  AnalyticsEvent: {
    SignedOut: 'signed_out',
    AccountDeleteRequested: 'account_delete_requested',
    SignInCompleted: 'sign_in_completed',
  },
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  digestStringAsync: jest.fn(),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
}));

// ── Helpers ──

function useContextValue() {
  return React.useContext(AuthContext);
}

function renderAuthHook() {
  return renderHook(() => useContextValue(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    ),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AuthContext', () => {
  /**
   * Scenario 6.1.9 — [SECURITY] handleSignOut does NOT clear local SQLite data
   *
   * When the user signs out (AuthContext.tsx:174-191), `handleSignOut` clears
   * the Supabase auth session and resets React state, but does NOT delete
   * data from SQLite tables: saved_places, place_cache, pending_deletions.
   *
   * This means:
   * - A different user signing in on the same device can see cached place
   *   data from the previous user (place_cache has no user_id column)
   * - The saved_places are technically user-scoped, but place_cache is not
   */
  it('6.1.9: signOut does not clear local SQLite data', async () => {
    const { result } = renderAuthHook();

    // Establish an authenticated session
    await act(async () => {
      await result.current.checkSession();
    });

    expect(result.current.isAuthenticated).toBe(true);

    // Sign out
    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.currentUserId).toBeNull();

    // BUG: No SQLite cleanup was performed.
    // Neither getDatabase().execAsync("DELETE FROM ...") nor any
    // individual delete functions were called.
    expect(mockExecAsync).not.toHaveBeenCalled();
    expect(mockDeleteLocalSavedPlace).not.toHaveBeenCalled();

    // The sign-out only clears the Supabase auth session
    expect(mockSignOut).toHaveBeenCalled();
  });

  /**
   * Scenario 6.1.11 — [SECURITY] deleteAccount does NOT clear local SQLite data
   *
   * When the user deletes their account (AuthContext.tsx:193-213),
   * `deleteAccount` calls `softDeleteAccount()` (which marks the account
   * as deleted server-side and signs out), then resets React state.
   * But local SQLite data is never wiped.
   *
   * This is worse than sign-out because the user explicitly expects
   * their data to be gone after account deletion.
   */
  it('6.1.11: deleteAccount does not clear local SQLite data', async () => {
    const { result } = renderAuthHook();

    // Establish authenticated session
    await act(async () => {
      await result.current.checkSession();
    });

    expect(result.current.isAuthenticated).toBe(true);

    // Delete account
    await act(async () => {
      await result.current.deleteAccount();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.currentUserId).toBeNull();

    // BUG: No local SQLite data was deleted after account deletion.
    // saved_places, place_cache, and pending_deletions all still contain
    // the deleted user's data.
    expect(mockExecAsync).not.toHaveBeenCalled();
    expect(mockDeleteLocalSavedPlace).not.toHaveBeenCalled();

    // Only the server-side soft delete was performed
    expect(mockSoftDeleteAccount).toHaveBeenCalled();
  });
});
