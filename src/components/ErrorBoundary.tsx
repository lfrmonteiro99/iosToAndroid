import React, { Component, ErrorInfo } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, Appearance } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SystemColors } from '../theme/CupertinoTheme';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  recovering: boolean;
  retryCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  private _recoveryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, recovering: false, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  private static readonly MAX_RETRIES = 3;

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Launcher crash:', error, errorInfo);
    const nextRetryCount = this.state.retryCount + 1;
    if (nextRetryCount <= ErrorBoundary.MAX_RETRIES) {
      // Auto-recover after 2 seconds, up to MAX_RETRIES attempts
      this.setState({ recovering: true, retryCount: nextRetryCount });
      this._recoveryTimer = setTimeout(() => {
        this.setState({ hasError: false, error: null, recovering: false });
      }, 2000);
    } else {
      // Retry limit exceeded — show permanent error screen
      this.setState({ recovering: false, retryCount: nextRetryCount });
    }
  }

  componentWillUnmount() {
    if (this._recoveryTimer) clearTimeout(this._recoveryTimer);
  }

  handleReset = () => {
    if (this._recoveryTimer) clearTimeout(this._recoveryTimer);
    this.setState({ hasError: false, error: null, recovering: false, retryCount: 0 });
  };

  render() {
    if (this.state.hasError) {
      const exhausted = this.state.retryCount > ErrorBoundary.MAX_RETRIES;
      const isDark = Appearance.getColorScheme() === 'dark';
      const bg = isDark ? '#000000' : '#F2F2F7';
      const textColor = isDark ? '#FFFFFF' : '#000000';
      const secondaryColor = isDark ? '#98989D' : '#8E8E93';
      const iconColor = isDark ? '#FF9F0A' : '#FF9500';
      return (
        <View style={[styles.container, { backgroundColor: bg }]}>
          {this.state.recovering ? (
            <>
              <ActivityIndicator size="large" color={SystemColors.light.accent} style={styles.spinner} />
              <Text style={[styles.title, { color: textColor }]}>Recovering...</Text>
              <Text style={[styles.message, { color: secondaryColor }]}>
                The launcher encountered an error and is restarting automatically.
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="warning-outline" size={48} color={iconColor} style={{ marginBottom: 16 }} />
              {exhausted && (
                <Text style={[styles.title, { color: textColor }]}>App has crashed multiple times. Please restart.</Text>
              )}
            </>
          )}
          <Text style={[styles.errorText, { color: secondaryColor }]}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </Text>
          {!exhausted && (
            <Pressable style={styles.button} onPress={this.handleReset}>
              <Text style={styles.buttonText}>Try Again</Text>
            </Pressable>
          )}
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  spinner: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 22,
  },
  errorText: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 18,
  },
  button: {
    backgroundColor: SystemColors.light.accent,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 9999,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
