import React, { createContext, useState, useCallback, useRef, useEffect } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SupabaseService from '../services/supabaseService';
import { supabase } from '../config/supabase';
import { analytics, AnalyticsEvent } from '../services/analyticsService';
import { ERROR_AUTO_DISMISS_MS } from '../config/constants';

WebBrowser.maybeCompleteAuthSession();

export interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  currentUserId: string | null;
  userEmail: string | null;
  checkSession: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  isLoading: true,
  errorMessage: null,
  currentUserId: null,
  userEmail: null,
  checkSession: async () => {},
  signInWithApple: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  deleteAccount: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
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

  const signInWithApple = useCallback(async () => {
    if (Platform.OS !== 'ios') return;

    setIsLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        setIsLoading(false);
        setErrorWithAutoDismiss('Failed to get Apple ID credentials');
        return;
      }

      const userId = await SupabaseService.signInWithApple(credential.identityToken);
      setCurrentUserId(userId);
      if (credential.email) {
        setUserEmail(credential.email);
      }
      setIsAuthenticated(true);

      analytics.identify(userId, { provider: 'apple' });
      analytics.track(AnalyticsEvent.SignInCompleted, { provider: 'apple' });
    } catch (error: any) {
      if (error.code !== 'ERR_REQUEST_CANCELED') {
        setErrorWithAutoDismiss('Sign in failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [setErrorWithAutoDismiss]);

  const signInWithGoogle = useCallback(async () => {
    setIsLoading(true);
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
        setErrorWithAutoDismiss('Failed to start Google sign in');
        setIsLoading(false);
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

      if (result.type !== 'success') {
        // User cancelled
        setIsLoading(false);
        return;
      }

      // Extract tokens from the redirect URL
      const url = new URL(result.url);
      // Supabase returns tokens in the hash fragment
      const params = new URLSearchParams(url.hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (!accessToken || !refreshToken) {
        setErrorWithAutoDismiss('Failed to get authentication tokens');
        setIsLoading(false);
        return;
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError || !sessionData.user) {
        setErrorWithAutoDismiss('Sign in failed. Please try again.');
        setIsLoading(false);
        return;
      }

      setCurrentUserId(sessionData.user.id);
      setUserEmail(sessionData.user.email ?? null);
      setIsAuthenticated(true);

      analytics.identify(sessionData.user.id, { provider: 'google' });
      analytics.track(AnalyticsEvent.SignInCompleted, { provider: 'google' });
    } catch (error: any) {
      setErrorWithAutoDismiss('Sign in failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [setErrorWithAutoDismiss]);

  const handleSignOut = useCallback(async () => {
    try {
      await SupabaseService.signOut();

      analytics.track(AnalyticsEvent.SignedOut);
      analytics.reset();

      setIsAuthenticated(false);
      setCurrentUserId(null);
      setUserEmail(null);
    } catch (error: any) {
      setErrorWithAutoDismiss(error.message ?? 'Sign out failed');
    }
  }, [setErrorWithAutoDismiss]);

  const deleteAccount = useCallback(async () => {
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
  }, [setErrorWithAutoDismiss]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        errorMessage,
        currentUserId,
        userEmail,
        checkSession,
        signInWithApple,
        signInWithGoogle,
        signOut: handleSignOut,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
