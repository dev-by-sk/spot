/**
 * Tests for AuthContext.tsx
 *
 * Targets medium-severity bugs from docs/test-scenarios.md:
 * - 6.1.9  [FIXED] handleSignOut now clears local SQLite data
 *   (AuthContext.tsx:174-191)
 * - 6.1.11 [FIXED] deleteAccount now clears local SQLite data
 *   (AuthContext.tsx:193-213)
 */
import React from "react";
import { renderHook, act } from "@testing-library/react-native";
import { AuthProvider, AuthContext } from "../../src/context/AuthContext";

// ── Mocks ──

const mockSignOut = jest.fn().mockResolvedValue(undefined);
const mockSoftDeleteAccount = jest.fn().mockResolvedValue(undefined);
const mockGetCurrentSession = jest.fn().mockResolvedValue({
  userId: "user-1",
  email: "test@example.com",
  provider: "google",
});

jest.mock("../../src/services/supabaseService", () => ({
  getCurrentSession: (...args: any[]) => mockGetCurrentSession(...args),
  signOut: (...args: any[]) => mockSignOut(...args),
  softDeleteAccount: (...args: any[]) => mockSoftDeleteAccount(...args),
  getUserProfile: jest.fn().mockResolvedValue(null),
  cancelDeleteAccount: jest.fn().mockResolvedValue(undefined),
}));

const mockLocalSignOut = jest.fn().mockResolvedValue(undefined);

jest.mock("../../src/config/supabase", () => ({
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

// Track whether SQLite-clearing functions are called
const mockClearAllLocalData = jest.fn().mockResolvedValue(undefined);
const mockDeleteLocalSavedPlace = jest.fn();
const mockExecAsync = jest.fn();

jest.mock("../../src/db/database", () => ({
  getDatabase: jest.fn().mockResolvedValue({
    execAsync: (...args: any[]) => mockExecAsync(...args),
    runAsync: jest.fn(),
    getAllAsync: jest.fn().mockResolvedValue([]),
  }),
  deleteLocalSavedPlace: (...args: any[]) => mockDeleteLocalSavedPlace(...args),
  clearAllLocalData: (...args: any[]) => mockClearAllLocalData(...args),
}));

jest.mock("../../src/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => true,
}));

jest.mock("../../src/context/ToastContext", () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock("../../src/services/analyticsService", () => ({
  analytics: { track: jest.fn(), identify: jest.fn(), reset: jest.fn() },
  AnalyticsEvent: {
    SignedOut: "signed_out",
    AccountDeleteRequested: "account_delete_requested",
    SignInCompleted: "sign_in_completed",
  },
}));

jest.mock("expo-auth-session", () => ({
  makeRedirectUri: jest.fn(),
}));

jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));

jest.mock("expo-crypto", () => ({
  digestStringAsync: jest.fn(),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  CryptoEncoding: { HEX: "hex" },
}));

jest.mock("@react-native-community/netinfo", () => ({
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

describe("AuthContext", () => {
  /**
   * Scenario 6.1.9 — [FIXED] handleSignOut now clears local SQLite data
   *
   * When the user signs out, handleSignOut now calls clearAllLocalData()
   * to wipe saved_places, place_cache, and pending_deletions tables,
   * preventing data leakage to the next user on the same device.
   */
  it("6.1.9: signOut clears local SQLite data", async () => {
    const { result } = renderAuthHook();

    await act(async () => {
      await result.current.checkSession();
    });

    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.currentUserId).toBeNull();

    // FIXED: clearAllLocalData is called to wipe all SQLite tables
    expect(mockClearAllLocalData).toHaveBeenCalledTimes(1);

    // The Supabase auth session is also cleared
    expect(mockSignOut).toHaveBeenCalled();
  });

  /**
   * Scenario 6.1.11 — [FIXED] deleteAccount now clears local SQLite data
   *
   * When the user deletes their account, deleteAccount now calls
   * clearAllLocalData() after the server-side soft delete, ensuring
   * no user data persists on the device.
   */
  it("6.1.11: deleteAccount clears local SQLite data", async () => {
    const { result } = renderAuthHook();

    await act(async () => {
      await result.current.checkSession();
    });

    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.deleteAccount();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.currentUserId).toBeNull();

    // FIXED: clearAllLocalData is called to wipe all SQLite tables
    expect(mockClearAllLocalData).toHaveBeenCalledTimes(1);

    // The server-side soft delete was also performed
    expect(mockSoftDeleteAccount).toHaveBeenCalled();
  });
});
