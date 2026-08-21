import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import type { CupertinoColors } from '../theme/CupertinoTheme';
import { Typography } from '../theme/CupertinoTheme';
import type { AppNavigationProp } from '../navigation/types';
import { hapticImpact } from '../utils/haptics';

// ─── Constants ──────────────────────────────────────────────────────────────

export const BROWSER_HOME_URL = 'https://www.google.com';
const SEARCH_PREFIX = 'https://www.google.com/search?q=';
const BROWSER_ACCENT = '#007AFF';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Turn whatever the user typed in the address bar into a URL to load.
 *
 * - empty / whitespace-only → '' (caller must not navigate)
 * - already has a scheme ('://') → used as-is
 * - looks like a host (contains a '.' with non-empty labels on both sides and
 *   no whitespace) → prefixed with 'https://'
 * - anything else → a Google search for the literal text
 *
 * The host test deliberately requires a non-empty label each side of the dot:
 * 'what.' or '.' are search terms, not hosts, and a term with a space
 * ('node.js tutorial') is a search even though it contains a dot.
 */
export function resolveUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (trimmed.includes('://')) return trimmed;

  const hostCandidate = trimmed.split(/[/?#]/, 1)[0];
  const looksLikeHost =
    !/\s/.test(trimmed) && /^[^\s.]+(\.[^\s.]+)+$/.test(hostCandidate);
  if (looksLikeHost) return `https://${trimmed}`;

  return `${SEARCH_PREFIX}${encodeURIComponent(trimmed)}`;
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export function BrowserScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [inputUrl, setInputUrl] = useState(BROWSER_HOME_URL);
  const [currentUrl, setCurrentUrl] = useState(BROWSER_HOME_URL);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const webviewRef = useRef<WebView>(null);

  const handleSubmit = useCallback(() => {
    const next = resolveUrl(inputUrl);
    if (!next) return;
    setCurrentUrl(next);
  }, [inputUrl]);

  const handleBack = useCallback(() => {
    hapticImpact();
    navigation.goBack();
  }, [navigation]);

  const handleReload = useCallback(() => {
    webviewRef.current?.reload();
  }, []);

  const handleNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    setCanGoBack(nav.canGoBack);
    setCanGoForward(nav.canGoForward);
    setInputUrl(nav.url);
  }, []);

  const handleGoBackInHistory = useCallback(() => {
    if (!canGoBack) return;
    webviewRef.current?.goBack();
  }, [canGoBack]);

  const handleGoForwardInHistory = useCallback(() => {
    if (!canGoForward) return;
    webviewRef.current?.goForward();
  }, [canGoForward]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={handleBack}
          hitSlop={8}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={28} color={BROWSER_ACCENT} />
        </Pressable>
        <TextInput
          style={styles.addressBar}
          value={inputUrl}
          onChangeText={setInputUrl}
          onSubmitEditing={handleSubmit}
          placeholder="Search or enter website name"
          placeholderTextColor={colors.secondaryLabel}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          selectTextOnFocus
          accessibilityLabel="Address bar"
        />
        <Pressable
          onPress={handleSubmit}
          hitSlop={8}
          accessibilityLabel="Go"
          accessibilityRole="button"
        >
          <Text style={styles.goText}>Go</Text>
        </Pressable>
        <Pressable
          onPress={handleReload}
          hitSlop={8}
          accessibilityLabel="Reload page"
          accessibilityRole="button"
        >
          <Ionicons name="refresh" size={22} color={BROWSER_ACCENT} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.progressTrack}>
          <View
            testID="browser-progress"
            style={[styles.progressBar, { width: `${Math.round(progress * 100)}%` }]}
          />
        </View>
      ) : null}

      <WebView
        ref={webviewRef}
        testID="browser-webview"
        source={{ uri: currentUrl }}
        style={styles.webview}
        onLoadStart={() => {
          setLoading(true);
          setProgress(0);
        }}
        onLoadProgress={({ nativeEvent }) => setProgress(nativeEvent.progress)}
        onLoadEnd={() => {
          setLoading(false);
          setProgress(1);
        }}
        onNavigationStateChange={handleNavigationStateChange}
        startInLoadingState
        renderLoading={() => <ActivityIndicator color={BROWSER_ACCENT} />}
      />

      <View
        style={[
          styles.bottomToolbar,
          { paddingBottom: insets.bottom + 8, borderTopColor: colors.separator },
        ]}
      >
        <Pressable
          onPress={handleGoBackInHistory}
          disabled={!canGoBack}
          hitSlop={8}
          accessibilityLabel="Go back in history"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoBack }}
        >
          <Ionicons
            name="chevron-back"
            size={26}
            color={BROWSER_ACCENT}
            style={{ opacity: canGoBack ? 1 : 0.3 }}
          />
        </Pressable>
        <Pressable
          onPress={handleGoForwardInHistory}
          disabled={!canGoForward}
          hitSlop={8}
          accessibilityLabel="Go forward in history"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoForward }}
        >
          <Ionicons
            name="chevron-forward"
            size={26}
            color={BROWSER_ACCENT}
            style={{ opacity: canGoForward ? 1 : 0.3 }}
          />
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function createStyles(colors: CupertinoColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.systemBackground },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.secondarySystemBackground,
    },
    addressBar: {
      flex: 1,
      height: 36,
      borderRadius: 10,
      paddingHorizontal: 12,
      backgroundColor: colors.tertiarySystemBackground,
      color: colors.label,
      ...Typography.body,
    },
    goText: { ...Typography.body, color: BROWSER_ACCENT, fontWeight: '600' },
    progressTrack: { height: 2, backgroundColor: 'transparent' },
    progressBar: { height: 2, backgroundColor: BROWSER_ACCENT },
    webview: { flex: 1 },
    bottomToolbar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      backgroundColor: colors.secondarySystemBackground,
    },
  });
}
