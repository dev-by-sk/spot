import React, { Component, ErrorInfo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { spotEmerald } from '../theme/colors';
import { SpotTypography } from '../theme/typography';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  handleRestart = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onRestart={this.handleRestart} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ onRestart }: { onRestart: () => void }) {
  const isDark = useColorScheme() === 'dark';
  const bg = isDark ? '#000000' : '#FAFAF9';
  const textPrimary = isDark ? '#FFFFFF' : '#111827';
  const textSecondary = isDark ? '#9CA3AF' : '#6B7280';
  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.title, { color: textPrimary }]}>
        Something went wrong
      </Text>
      <Text style={[styles.subtitle, { color: textSecondary }]}>
        The app ran into an unexpected error. Please try restarting
      </Text>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: spotEmerald }]}
        onPress={onRestart}
      >
        <Text style={styles.buttonText}>Restart</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  title: {
    ...SpotTypography.title2,
    marginBottom: 8,
  },
  subtitle: {
    ...SpotTypography.body,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  button: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: {
    ...SpotTypography.headline,
    color: '#FFFFFF',
  },
});
