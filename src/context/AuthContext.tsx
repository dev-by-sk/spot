import React, { createContext, useState, useCallback, useRef, useEffect } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { digestStringAsync, CryptoDigestAlgorithm, CryptoEncoding } from 'expo-crypto';
import * as SupabaseService from '../services/supabaseService';
import { supabase } from '../config/supabase';
import { analytics, AnalyticsEvent } from '../services/analyticsService';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { ERROR_AUTO_DISMISS_MS } from '../config/constants';

WebBrowser.maybeCompleteAuthSession();

export interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  isSigningIn: boolean;
  errorMessage: string | null;
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
  errorMessage: null,
  currentUserId: null,
  userEmail: null,
  checkSession: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  deleteAccount: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const isOnline = useNetworkStatus();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const setErrorWithAutoDismiss = useCallback((msg: string) => {
    setErrorMessage(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorMessage(null), ERROR_AUTO_DISMISS_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const checkSession = useCallback(async () => {
    try {
      const session = await SupabaseService.getCurrentSession();
      if (session) {
        setCurrentUserId(session.userId);
        setUserEmail(session.email);
        setIsAuthenticated(true);

        analytics.identify(session.userId, { provider: session.provider });

        // If account was soft-deleted, cancel the deletion on sign-in
        try {
          const profile = await SupabaseService.getUserProfile();
          if (profile?.deleted_at) {
            await SupabaseService.cancelDeleteAccount();
          }
        } catch (error) {
          console.warn('[Auth] Profile fetch failed:', error);
        }
      }
    } catch {
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    // React Native's `crypto` is a getter that returns a fresh object each access,
    // so `gCrypto.subtle = x` mutates a temporary instance that's immediately lost.
    // Use Object.defineProperty to replace the getter with a permanent plain value
    // that includes both the existing getRandomValues AND our subtle polyfill.
    if (!(globalThis as any).crypto?.subtle) {
      const existingGetRandomValues = (globalThis as any).crypto?.getRandomValues;
      const subtlePolyfill = {
        digest: async (algorithm: string, data: BufferSource): Promise<ArrayBuffer> => {
          const bytes = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
          const str = new TextDecoder('utf-8').decode(bytes);
          const hex = await digestStringAsync(
            algorithm as CryptoDigestAlgorithm,
            str,
            { encoding: CryptoEncoding.HEX },
          );
          const result = new Uint8Array(hex.match(/../g)!.map(b => parseInt(b, 16)));
          return result.buffer;
        },
      };
      try {
        Object.defineProperty(globalThis, 'crypto', {
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
        // Fallback if property is non-configurable
        (globalThis as any).crypto = {
          getRandomValues: existingGetRandomValues,
          subtle: subtlePolyfill,
        };
      }
    }

    setIsSigningIn(true);
    try {
      const redirectUri = AuthSession.makeRedirectUri();
      console.log('[Auth] Google OAuth redirect URI:', redirectUri);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true,
        },
      });

      if (error || !data.url) {
        console.error('[Auth] signInWithOAuth failed:', error, 'url:', data?.url);
        setErrorWithAutoDismiss('Failed to start Google sign in');
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
      console.log('[Auth] WebBrowser result:', result.type, result.type === 'success' ? result.url : '');

      if (result.type !== 'success') {
        // User cancelled — just stop, stay on login screen
        return;
      }

      // Extract just the auth code from the URL — exchangeCodeForSession
      // passes its argument verbatim as auth_code in the POST body, so we
      // must not pass the full URL.
      const codeMatch = result.url.match(/[?&]code=([^&#]+)/);
      const authCode = codeMatch?.[1];
      if (!authCode) {
        setErrorWithAutoDismiss('Sign in failed. Please try again.');
        return;
      }

      const { data: sessionData, error: sessionError } =
        await supabase.auth.exchangeCodeForSession(authCode);

      if (sessionError || !sessionData.user) {
        console.error('[Auth] exchangeCodeForSession failed:', sessionError);
        setErrorWithAutoDismiss('Sign in failed. Please try again.');
        return;
      }

      setCurrentUserId(sessionData.user.id);
      setUserEmail(sessionData.user.email ?? null);
      setIsAuthenticated(true);

      analytics.identify(sessionData.user.id, { provider: 'google' });
      analytics.track(AnalyticsEvent.SignInCompleted, { provider: 'google' });
    } catch (error: any) {
      console.error('[Auth] signInWithGoogle threw:', error);
      setErrorWithAutoDismiss('Sign in failed. Please try again.');
    } finally {
      setIsSigningIn(false);
    }
  }, [setErrorWithAutoDismiss]);

  const handleSignOut = useCallback(async () => {
    if (isOnline) {
      try {
        await SupabaseService.signOut();
      } catch {
        // Network error: fall back to local-only sign out
        await supabase.auth.signOut({ scope: 'local' });
      }
    } else {
      // Offline: clear local session only, no network request
      await supabase.auth.signOut({ scope: 'local' });
    }
    analytics.track(AnalyticsEvent.SignedOut);
    analytics.reset();
    setIsAuthenticated(false);
    setCurrentUserId(null);
    setUserEmail(null);
  }, [isOnline]);

  const deleteAccount = useCallback(async () => {
    if (!isOnline) {
      setErrorWithAutoDismiss('You need to be online to delete your account.');
      return;
    }
    setIsLoading(true);
    try {
      await SupabaseService.softDeleteAccount();

      analytics.track(AnalyticsEvent.AccountDeleteRequested);
      analytics.reset();

      setIsAuthenticated(false);
      setCurrentUserId(null);
      setUserEmail(null);
    } catch {
      setErrorWithAutoDismiss('Failed to delete account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [isOnline, setErrorWithAutoDismiss]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        isSigningIn,
        errorMessage,
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
