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
import { CupertinoShareSheet } from '../components/CupertinoShareSheet';

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

  const [inputUrl, setInputUrl] = useState(BROWSER_HOME_URL);
  const [currentUrl, setCurrentUrl] = useState(BROWSER_HOME_URL);
  const [pageTitle, setPageTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const webviewRef = useRef<WebView>(null);
  const styles = React.useMemo(() => createStyles(colors, isPrivate), [colors, isPrivate]);

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

  const handleShare = useCallback(() => {
    hapticImpact();
    setShowShareSheet(true);
  }, []);

  const handleTogglePrivate = useCallback(() => {
    hapticImpact();
    setIsPrivate((prev) => !prev);
  }, []);

  const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    setPageTitle(navState.title);
    setCanGoBack(navState.canGoBack);
    setCanGoForward(navState.canGoForward);
    setInputUrl(navState.url);
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
      <View testID="browser-topbar" style={styles.topBar}>
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
        <Pressable
          onPress={handleShare}
          hitSlop={8}
          accessibilityLabel="Share"
          accessibilityRole="button"
        >
          <Ionicons name="share-outline" size={22} color={BROWSER_ACCENT} />
        </Pressable>
        <Pressable
          onPress={handleTogglePrivate}
          hitSlop={8}
          accessibilityLabel="Toggle private browsing"
          accessibilityRole="button"
          accessibilityState={{ selected: isPrivate }}
        >
          <Ionicons
            name={isPrivate ? 'eye-off' : 'eye'}
            size={22}
            color={isPrivate ? colors.label : BROWSER_ACCENT}
          />
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
        incognito={isPrivate}
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

      <CupertinoShareSheet
        visible={showShareSheet}
        onClose={() => setShowShareSheet(false)}
        title={pageTitle}
        url={currentUrl}
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

const PRIVATE_BACKGROUND = '#1C1C1E';

function createStyles(colors: CupertinoColors, isPrivate: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.systemBackground },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: isPrivate ? PRIVATE_BACKGROUND : colors.secondarySystemBackground,
    },
    addressBar: {
      flex: 1,
      height: 36,
      borderRadius: 10,
      paddingHorizontal: 12,
      backgroundColor: isPrivate ? PRIVATE_BACKGROUND : colors.tertiarySystemBackground,
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
