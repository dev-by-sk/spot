import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../hooks/useAuth';
import { useDebounce } from '../../hooks/useDebounce';
import { useSpotColors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { SpotTypography } from '../../theme/typography';
import * as FriendsService from '../../services/friendsService';

const USERNAME_REGEX = /^[a-z][a-z0-9_]{2,19}$/;

export function UsernameSetupScreen() {
  const { setUsername } = useAuth();
  const colors = useSpotColors();
  const { resolvedScheme } = useTheme();

  const circleOpacityTop = resolvedScheme === 'dark' ? 0.22 : 0.08;
  const circleOpacityBottom = resolvedScheme === 'dark' ? 0.15 : 0.05;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [input, setInput] = useState('');
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstNameRef = useRef<TextInput>(null);
  const lastNameRef = useRef<TextInput>(null);
  const usernameRef = useRef<TextInput>(null);
  const keyboardOffset = useRef(new Animated.Value(0)).current;

  const debouncedInput = useDebounce(input, 500);
  const isValidFormat = USERNAME_REGEX.test(input);

  // Animate content up/down with the keyboard
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        Animated.timing(keyboardOffset, {
          toValue: -(e.endCoordinates.height / 3),
          duration: e.duration || 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      },
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (e) => {
        Animated.timing(keyboardOffset, {
          toValue: 0,
          duration: (e as any).duration || 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      },
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardOffset]);

  React.useEffect(() => {
    if (!debouncedInput || !USERNAME_REGEX.test(debouncedInput)) {
      setIsAvailable(null);
      return;
    }

    let cancelled = false;
    setIsChecking(true);

    FriendsService.checkUsernameAvailable(debouncedInput)
      .then((available) => {
        if (!cancelled) {
          setIsAvailable(available);
          setIsChecking(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('[UsernameSetup] Availability check failed:', err);
          setIsAvailable(true);
          setIsChecking(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedInput]);

  const handleChangeUsername = useCallback((text: string) => {
    const cleaned = text.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setInput((prev) => {
      if (prev === cleaned) return prev;
      setError(null);
      setIsAvailable(null);
      return cleaned;
    });
  }, []);

  const handleContinue = useCallback(async () => {
    if (!firstName.trim() || !isValidFormat || isAvailable !== true) return;

    Keyboard.dismiss();
    setIsSubmitting(true);
    setError(null);
    try {
      await setUsername(input, firstName.trim(), lastName.trim() || undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('taken') || msg.includes('unique')) {
        setError('Username already taken');
        setIsAvailable(false);
      } else {
        setError('Something went wrong, please try again');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [input, firstName, lastName, isValidFormat, isAvailable, setUsername]);

  const getValidationMessage = () => {
    if (input.length === 0) return null;
    if (input.length < 3) return 'At least 3 characters';
    if (!isValidFormat) return 'Lowercase letters, numbers, underscores only. Must start with a letter.';
    if (isChecking) return null;
    if (isAvailable === true) return 'Available';
    if (isAvailable === false) return 'Already taken';
    return null;
  };

  const validationMessage = getValidationMessage();
  const isValid = firstName.trim().length > 0 && isValidFormat && isAvailable === true;

  return (
    <Pressable style={[styles.container, { backgroundColor: colors.spotBackground }]} onPress={Keyboard.dismiss}>
      {/* Background decoration */}
      <View pointerEvents="none" style={[styles.bgCircleTop, { backgroundColor: colors.spotEmerald, opacity: circleOpacityTop }]} />
      <View pointerEvents="none" style={[styles.bgCircleBottom, { backgroundColor: colors.spotEmerald, opacity: circleOpacityBottom }]} />

      <Animated.View style={[styles.content, { transform: [{ translateY: keyboardOffset }] }]}>
          <Text style={[styles.title, { color: colors.spotTextPrimary }]}>
            Set up your profile
          </Text>
          <Text style={[styles.subtitle, { color: colors.spotTextSecondary }]}>
            This is how friends will find you
          </Text>

          {/* Name row */}
          <View style={styles.nameRow}>
            <Pressable style={[styles.nameInput, { backgroundColor: colors.spotSearchBar, borderColor: colors.spotDivider }]} onPress={() => { if (!firstNameRef.current?.isFocused()) firstNameRef.current?.focus(); }} hitSlop={8}>
              <TextInput
                ref={firstNameRef}
                style={[styles.nameField, { color: colors.spotTextPrimary }]}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First name"
                placeholderTextColor={colors.spotTextSecondary}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={50}
                returnKeyType="next"
                onSubmitEditing={() => lastNameRef.current?.focus()}
              />
            </Pressable>
            <Pressable style={[styles.nameInput, { backgroundColor: colors.spotSearchBar, borderColor: colors.spotDivider }]} onPress={() => { if (!lastNameRef.current?.isFocused()) lastNameRef.current?.focus(); }} hitSlop={8}>
              <TextInput
                ref={lastNameRef}
                style={[styles.nameField, { color: colors.spotTextPrimary }]}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last name"
                placeholderTextColor={colors.spotTextSecondary}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={50}
                returnKeyType="next"
                onSubmitEditing={() => usernameRef.current?.focus()}
              />
            </Pressable>
          </View>

          {/* Username input */}
          <Pressable
            style={[styles.inputRow, { backgroundColor: colors.spotSearchBar, borderColor: colors.spotDivider }]}
            onPress={() => { if (!usernameRef.current?.isFocused()) usernameRef.current?.focus(); }}
            hitSlop={8}
          >
            <Text style={[styles.atPrefix, { color: colors.spotTextSecondary }]}>@</Text>
            <TextInput
              ref={usernameRef}
              style={[styles.input, { color: colors.spotTextPrimary }]}
              value={input}
              onChangeText={handleChangeUsername}
              placeholder="username"
              placeholderTextColor={colors.spotTextSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              maxLength={20}
              returnKeyType="done"
              onSubmitEditing={handleContinue}
            />
            {isChecking ? (
              <ActivityIndicator size="small" color={colors.spotTextSecondary} />
            ) : isValidFormat && isAvailable === true ? (
              <Ionicons name="checkmark-circle" size={22} color={colors.spotEmerald} />
            ) : input.length > 0 && !isChecking && isAvailable === false ? (
              <Ionicons name="close-circle" size={22} color={colors.spotDanger} />
            ) : null}
          </Pressable>

          {validationMessage ? (
            <Text
              style={[
                styles.validation,
                { color: isAvailable === true ? colors.spotEmerald : isAvailable === false ? colors.spotDanger : colors.spotTextSecondary },
              ]}
            >
              {validationMessage}
            </Text>
          ) : null}

          {error ? (
            <Text style={[styles.validation, { color: colors.spotDanger }]}>{error}</Text>
          ) : null}

          <TouchableOpacity
            style={[
              styles.continueButton,
              { backgroundColor: isValid ? colors.spotEmerald : colors.spotTextSecondary + '40' },
            ]}
            onPress={handleContinue}
            disabled={!isValid || isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.continueText}>Continue</Text>
            )}
          </TouchableOpacity>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bgCircleTop: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    top: -100,
    right: -80,
  },
  bgCircleBottom: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    bottom: -60,
    left: -60,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  title: {
    ...SpotTypography.largeTitle,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    ...SpotTypography.body,
    textAlign: 'center',
    marginBottom: 24,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 10,
  },
  nameInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  nameField: {
    ...SpotTypography.body,
    padding: 0,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 4,
  },
  atPrefix: {
    ...SpotTypography.title3,
  },
  input: {
    ...SpotTypography.title3,
    flex: 1,
    padding: 0,
  },
  validation: {
    ...SpotTypography.footnote,
    paddingLeft: 4,
  },
  continueButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  continueText: {
    ...SpotTypography.headline,
    color: '#FFFFFF',
  },
});
