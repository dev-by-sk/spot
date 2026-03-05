/**
 * AuthContext and AuthProvider for React Native
 */

import React, { createContext, useState, useCallback, useEffect, useRef } from "react";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import {
  digestStringAsync,
  CryptoDigestAlgorithm,
  CryptoEncoding,
} from "expo-crypto";
import * as SupabaseService from "../services/supabaseService";
import { supabase } from "../config/supabase";
import { clearAllLocalData } from "../db/database";
import { analytics, AnalyticsEvent } from "../services/analyticsService";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { useToast } from "./ToastContext";

export interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  isSigningIn: boolean;
  currentUserId: string | null;
  userEmail: string | null;
  checkSession: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  isLoading: true,
  isSigningIn: false,
  currentUserId: null,
  userEmail: null,
  checkSession: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  deleteAccount: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const isOnline = useNetworkStatus();
  const { showToast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const initialLoadDoneRef = useRef(false);

  const checkSession = useCallback(async () => {
    try {
      const session = await SupabaseService.getCurrentSession();

      if (session) {
        setCurrentUserId(session.userId);
        setUserEmail(session.email);
        setIsAuthenticated(true);
        analytics.identify(session.userId, { provider: session.provider });
        try {
          const profile = await SupabaseService.getUserProfile();
          if (profile?.deleted_at) {
            await SupabaseService.cancelDeleteAccount();
          }
        } catch (error) {
          console.warn("[Auth] Profile fetch failed:", error);
        }
      }
    } catch {
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
      initialLoadDoneRef.current = true;
    }
  }, []);

  // Listen for session changes (e.g., session restored from SecureStore after cold start)
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Skip during initial session check to avoid racing with checkSession()
      if (!initialLoadDoneRef.current && event === "SIGNED_IN") return;

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        if (session?.user) {
          setCurrentUserId(session.user.id);
          setUserEmail(session.user.email ?? null);
          setIsAuthenticated(true);
          analytics.identify(session.user.id, {
            provider: (session.user.app_metadata?.provider as string) ?? "",
          });
        }
      } else if (event === "SIGNED_OUT") {
        setIsAuthenticated(false);
        setCurrentUserId(null);
        setUserEmail(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!(globalThis as any).crypto?.subtle) {
      const existingGetRandomValues = (globalThis as any).crypto
        ?.getRandomValues;
      const subtlePolyfill = {
        digest: async (
          algorithm: string,
          data: BufferSource,
        ): Promise<ArrayBuffer> => {
          const bytes =
            data instanceof Uint8Array
              ? data
              : new Uint8Array(data as ArrayBuffer);
          const str = new TextDecoder("utf-8").decode(bytes);
          const hex = await digestStringAsync(
            algorithm as CryptoDigestAlgorithm,
            str,
            { encoding: CryptoEncoding.HEX },
          );
          const result = new Uint8Array(
            hex.match(/../g)!.map((b) => parseInt(b, 16)),
          );
          return result.buffer;
        },
      };
      try {
        Object.defineProperty(globalThis, "crypto", {
          value: {
            getRandomValues: (array: ArrayBufferView) => {
              existingGetRandomValues?.(array);
              return array;
            },
            subtle: subtlePolyfill,
          },
          configurable: true,
          writable: true,
        });
      } catch {
        (globalThis as any).crypto = {
          getRandomValues: existingGetRandomValues,
          subtle: subtlePolyfill,
        };
      }
    }

    setIsSigningIn(true);
    try {
      const redirectUri = AuthSession.makeRedirectUri({ path: "auth-callback" });
      console.log("[Auth] Google OAuth redirect URI:", redirectUri);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true,
        },
      });

      if (error || !data.url) {
        console.error(
          "[Auth] signInWithOAuth failed:",
          error,
          "url:",
          data?.url,
        );
        showToast({ text: "Failed to start Google sign in", type: "error" });
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUri,
      );
      console.log(
        "[Auth] WebBrowser result:",
        result.type,
        result.type === "success" ? result.url : "",
      );

      if (result.type !== "success") return;

      const codeMatch = result.url.match(/[?&]code=([^&#]+)/);
      const authCode = codeMatch?.[1];
      if (!authCode) {
        showToast({ text: "Sign in failed, please try again", type: "error" });
        return;
      }

      const { data: sessionData, error: sessionError } =
        await supabase.auth.exchangeCodeForSession(authCode);

      if (sessionError || !sessionData.user) {
        console.error("[Auth] exchangeCodeForSession failed:", sessionError);
        showToast({ text: "Sign in failed, please try again", type: "error" });
        return;
      }

      setCurrentUserId(sessionData.user.id);
      setUserEmail(sessionData.user.email ?? null);
      setIsAuthenticated(true);

      analytics.identify(sessionData.user.id, { provider: "google" });
      analytics.track(AnalyticsEvent.SignInCompleted, { provider: "google" });
    } catch (error: any) {
      console.error("[Auth] signInWithGoogle threw:", error);
      showToast({
        text: "Sign in failed, please try again",
        type: "error",
        action: { label: "Retry", onPress: () => signInWithGoogle() },
      });
    } finally {
      setIsSigningIn(false);
    }
  }, [showToast]);

  const handleSignOut = useCallback(async () => {
    if (isOnline) {
      try {
        await SupabaseService.signOut();
      } catch {
        await supabase.auth.signOut({ scope: "local" });
      }
    } else {
      await supabase.auth.signOut({ scope: "local" });
    }
    try {
      await clearAllLocalData();
    } catch (error) {
      console.warn("[Auth] Failed to clear local data on sign-out:", error);
    }

    analytics.track(AnalyticsEvent.SignedOut);
    analytics.reset();
    setIsAuthenticated(false);
    setCurrentUserId(null);
    setUserEmail(null);
  }, [isOnline]);

  const deleteAccount = useCallback(async () => {
    if (!isOnline) {
      showToast({
        text: "You need to be online to delete your account",
        type: "error",
      });
      return;
    }
    setIsLoading(true);
    try {
      await SupabaseService.softDeleteAccount();
      try {
        await clearAllLocalData();
      } catch (error) {
        console.warn(
          "[Auth] Failed to clear local data on account delete:",
          error,
        );
      }
      analytics.track(AnalyticsEvent.AccountDeleteRequested);
      analytics.reset();
      setIsAuthenticated(false);
      setCurrentUserId(null);
      setUserEmail(null);
    } catch {
      showToast({
        text: "Failed to delete account, please try again",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [isOnline, showToast]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        isSigningIn,
        currentUserId,
        userEmail,
        checkSession,
        signInWithGoogle,
        signOut: handleSignOut,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
