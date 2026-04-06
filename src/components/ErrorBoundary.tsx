import React, { Component, ErrorInfo } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  recovering: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  private _recoveryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, recovering: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, recovering: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Launcher crash:', error, errorInfo);
    // Auto-recover after 2 seconds
    this._recoveryTimer = setTimeout(() => {
      this.setState({ hasError: false, error: null, recovering: false });
    }, 2000);
  }

  componentWillUnmount() {
    if (this._recoveryTimer) clearTimeout(this._recoveryTimer);
  }

  handleReset = () => {
    if (this._recoveryTimer) clearTimeout(this._recoveryTimer);
    this.setState({ hasError: false, error: null, recovering: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          {this.state.recovering ? (
            <>
              <ActivityIndicator size="large" color="#007AFF" style={styles.spinner} />
              <Text style={styles.title}>Recovering...</Text>
              <Text style={styles.message}>
                The launcher encountered an error and is restarting automatically.
              </Text>
            </>
          ) : (
            <Text style={styles.emoji}>⚠️</Text>
          )}
          <Text style={styles.errorText}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </Text>
          <Pressable style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Try Again</Text>
          </Pressable>
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
    backgroundColor: '#F2F2F7',
  },
  spinner: {
    marginBottom: 16,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 22,
  },
  errorText: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 18,
  },
  button: {
    backgroundColor: '#007AFF',
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
