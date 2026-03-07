/**
 * Tests for AuthContext shared token storage (iOS Share Extension support)
 *
 * The auth context stores/clears an access token in shared storage
 * (UserDefaults via App Group on iOS) so the native Share Extension
 * can authenticate with the Supabase edge function.
 */
import React from "react";
import { Platform } from "react-native";
import { renderHook, act } from "@testing-library/react-native";
import { AuthProvider, AuthContext } from "../../src/context/AuthContext";

// ── SharedStorage mock ──
const mockSetItem = jest.fn();
const mockRemoveItem = jest.fn();

jest.mock("../../modules/shared-storage", () => ({
  setItem: (...args: any[]) => mockSetItem(...args),
  getItem: jest.fn(),
  removeItem: (...args: any[]) => mockRemoveItem(...args),
}));

// ── Supabase & service mocks ──
const mockGetCurrentSession = jest.fn().mockResolvedValue({
  userId: "user-1",
  email: "test@example.com",
  provider: "google",
  accessToken: "session-token-abc",
});

let authStateCallback: ((event: string, session: any) => void) | null = null;

jest.mock("../../src/services/supabaseService", () => ({
  getCurrentSession: (...args: any[]) => mockGetCurrentSession(...args),
  signOut: jest.fn().mockResolvedValue(undefined),
  softDeleteAccount: jest.fn().mockResolvedValue(undefined),
  getUserProfile: jest.fn().mockResolvedValue(null),
  cancelDeleteAccount: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/config/supabase", () => ({
  supabase: {
    auth: {
      signOut: jest.fn().mockResolvedValue(undefined),
      signInWithOAuth: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: "session-token-abc" } },
      }),
      onAuthStateChange: jest.fn((cb: any) => {
        authStateCallback = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      }),
    },
  },
}));

jest.mock("../../src/db/database", () => ({
  getDatabase: jest.fn().mockResolvedValue({
    execAsync: jest.fn(),
    runAsync: jest.fn(),
    getAllAsync: jest.fn().mockResolvedValue([]),
  }),
  deleteLocalSavedPlace: jest.fn(),
  clearAllLocalData: jest.fn().mockResolvedValue(undefined),
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

const originalPlatformOS = Platform.OS;

afterEach(() => {
  jest.clearAllMocks();
  authStateCallback = null;
  Object.defineProperty(Platform, "OS", { value: originalPlatformOS });
});

describe("AuthContext shared token storage", () => {
  describe("iOS platform", () => {
    beforeEach(() => {
      Object.defineProperty(Platform, "OS", { value: "ios" });
    });

    it("stores shared token on checkSession when session exists", async () => {
      const { result } = renderAuthHook();

      await act(async () => {
        await result.current.checkSession();
      });

      expect(mockSetItem).toHaveBeenCalledWith(
        "spot_shared_access_token",
        "session-token-abc",
        "group.com.spot.app"
      );
    });

    it("stores token with correct key and App Group matching the Swift extension", async () => {
      const { result } = renderAuthHook();

      await act(async () => {
        await result.current.checkSession();
      });

      // These must match the values in the generated ShareViewController.swift:
      //   tokenKey = "spot_shared_access_token"
      //   appGroupIdentifier = "group.com.spot.app"
      const [key, , group] = mockSetItem.mock.calls[0];
      expect(key).toBe("spot_shared_access_token");
      expect(group).toBe("group.com.spot.app");
    });

    it("does not store token when checkSession finds no session", async () => {
      mockGetCurrentSession.mockResolvedValueOnce(null);

      const { result } = renderAuthHook();

      await act(async () => {
        await result.current.checkSession();
      });

      expect(mockSetItem).not.toHaveBeenCalled();
    });

    it("clears shared token on signOut", async () => {
      const { result } = renderAuthHook();

      await act(async () => {
        await result.current.checkSession();
      });

      mockSetItem.mockClear();

      await act(async () => {
        await result.current.signOut();
      });

      expect(mockRemoveItem).toHaveBeenCalledWith(
        "spot_shared_access_token",
        "group.com.spot.app"
      );
    });

    it("clears shared token on deleteAccount", async () => {
      const { result } = renderAuthHook();

      await act(async () => {
        await result.current.checkSession();
      });

      await act(async () => {
        await result.current.deleteAccount();
      });

      expect(mockRemoveItem).toHaveBeenCalledWith(
        "spot_shared_access_token",
        "group.com.spot.app"
      );
    });

    it("stores token on TOKEN_REFRESHED auth state change", async () => {
      renderAuthHook();

      // Wait for initial effects
      await act(async () => {});

      mockSetItem.mockClear();

      await act(async () => {
        authStateCallback?.("TOKEN_REFRESHED", {
          access_token: "refreshed-token-xyz",
          user: { id: "user-1", email: "test@example.com", app_metadata: {} },
        });
      });

      expect(mockSetItem).toHaveBeenCalledWith(
        "spot_shared_access_token",
        "refreshed-token-xyz",
        "group.com.spot.app"
      );
    });

    it("clears token on SIGNED_OUT auth state change", async () => {
      renderAuthHook();

      await act(async () => {});

      mockRemoveItem.mockClear();

      await act(async () => {
        authStateCallback?.("SIGNED_OUT", null);
      });

      expect(mockRemoveItem).toHaveBeenCalledWith(
        "spot_shared_access_token",
        "group.com.spot.app"
      );
    });

    it("does not store token when auth state change has no access_token", async () => {
      renderAuthHook();

      await act(async () => {});

      mockSetItem.mockClear();

      await act(async () => {
        authStateCallback?.("SIGNED_IN", {
          // session with no access_token
          user: { id: "user-1", email: "test@example.com", app_metadata: {} },
        });
      });

      expect(mockSetItem).not.toHaveBeenCalled();
    });

    it("does not crash when SharedStorage throws on store", async () => {
      mockSetItem.mockImplementationOnce(() => {
        throw new Error("Keychain unavailable");
      });

      const { result } = renderAuthHook();

      // Should not throw — error is caught and logged
      await act(async () => {
        await result.current.checkSession();
      });

      // Auth should still succeed despite shared storage failure
      expect(result.current.isAuthenticated).toBe(true);
    });

    it("does not crash when SharedStorage throws on clear", async () => {
      mockRemoveItem.mockImplementationOnce(() => {
        throw new Error("Keychain unavailable");
      });

      const { result } = renderAuthHook();

      await act(async () => {
        await result.current.checkSession();
      });

      // Should not throw
      await act(async () => {
        await result.current.signOut();
      });

      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe("Android platform", () => {
    beforeEach(() => {
      Object.defineProperty(Platform, "OS", { value: "android" });
    });

    it("does not store shared token on Android", async () => {
      const { result } = renderAuthHook();

      await act(async () => {
        await result.current.checkSession();
      });

      expect(mockSetItem).not.toHaveBeenCalled();
    });

    it("does not clear shared token on Android sign-out", async () => {
      const { result } = renderAuthHook();

      await act(async () => {
        await result.current.checkSession();
      });

      await act(async () => {
        await result.current.signOut();
      });

      expect(mockRemoveItem).not.toHaveBeenCalled();
    });

    it("does not store token on TOKEN_REFRESHED on Android", async () => {
      renderAuthHook();

      await act(async () => {});

      await act(async () => {
        authStateCallback?.("TOKEN_REFRESHED", {
          access_token: "refreshed-token",
          user: { id: "user-1", email: "test@example.com", app_metadata: {} },
        });
      });

      expect(mockSetItem).not.toHaveBeenCalled();
    });
  });

  describe("token consistency", () => {
    beforeEach(() => {
      Object.defineProperty(Platform, "OS", { value: "ios" });
    });

    // checkSession uses the accessToken from getCurrentSession() directly
    // (single call, no redundant getSession)
    it("stores the token from getCurrentSession", async () => {
      const { result } = renderAuthHook();

      await act(async () => {
        await result.current.checkSession();
      });

      expect(mockSetItem).toHaveBeenCalledWith(
        "spot_shared_access_token",
        "session-token-abc",
        "group.com.spot.app"
      );
    });
  });
});
