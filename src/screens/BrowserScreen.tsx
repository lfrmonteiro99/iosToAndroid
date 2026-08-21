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
import { BrowserTabGrid, BrowserTab } from '../components/BrowserTabGrid';
import { BrowserBookmarksList } from '../components/BrowserBookmarksList';
import { useBookmarks } from '../store/BookmarksStore';

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

function generateTabId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function createTab(url: string): BrowserTab {
  return { id: generateTabId(), url, title: '' };
}

export function BrowserScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { bookmarks, addBookmark, removeBookmark, isBookmarked } = useBookmarks();

  const [tabs, setTabs] = useState<BrowserTab[]>(() => [createTab(BROWSER_HOME_URL)]);
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id);
  const [showTabGrid, setShowTabGrid] = useState(false);
  const [inputUrl, setInputUrl] = useState(BROWSER_HOME_URL);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showBookmarksList, setShowBookmarksList] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const webviewRef = useRef<WebView>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const currentUrl = activeTab?.url ?? BROWSER_HOME_URL;
  const pageTitle = activeTab?.title ?? '';

  const handleSubmit = useCallback(() => {
    const next = resolveUrl(inputUrl);
    if (!next) return;
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, url: next } : t)));
  }, [inputUrl, activeTabId]);

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

  const handleToggleBookmark = useCallback(() => {
    if (!currentUrl) return;
    hapticImpact();
    if (isBookmarked(currentUrl)) {
      const existing = bookmarks.find((bm) => bm.url === currentUrl);
      if (existing) removeBookmark(existing.id);
    } else {
      addBookmark(currentUrl, pageTitle);
    }
  }, [currentUrl, pageTitle, isBookmarked, bookmarks, addBookmark, removeBookmark]);

  const handleOpenBookmarks = useCallback(() => {
    hapticImpact();
    setShowBookmarksList(true);
  }, []);

  const handleNavigateToBookmark = useCallback((url: string) => {
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, url } : t)));
    setInputUrl(url);
  }, [activeTabId]);

  const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, title: navState.title } : t)));
    setCanGoBack(navState.canGoBack);
    setCanGoForward(navState.canGoForward);
    setInputUrl(navState.url);
  }, [activeTabId]);

  const handleGoBackInHistory = useCallback(() => {
    if (!canGoBack) return;
    webviewRef.current?.goBack();
  }, [canGoBack]);

  const handleGoForwardInHistory = useCallback(() => {
    if (!canGoForward) return;
    webviewRef.current?.goForward();
  }, [canGoForward]);

  const handleShowTabGrid = useCallback(() => {
    hapticImpact();
    setShowTabGrid(true);
  }, []);

  const handleDoneWithTabGrid = useCallback(() => {
    setShowTabGrid(false);
  }, []);

  const handleSelectTab = useCallback(
    (id: string) => {
      const tab = tabs.find((t) => t.id === id);
      setActiveTabId(id);
      setInputUrl(tab?.url ?? BROWSER_HOME_URL);
      setShowTabGrid(false);
    },
    [tabs],
  );

  const handleNewTab = useCallback(() => {
    const tab = createTab(BROWSER_HOME_URL);
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    setInputUrl(BROWSER_HOME_URL);
    setShowTabGrid(false);
  }, []);

  const handleCloseTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== id);
        if (id === activeTabId) {
          const fallback = next[0];
          setActiveTabId(fallback?.id ?? '');
          setInputUrl(fallback?.url ?? BROWSER_HOME_URL);
        }
        return next;
      });
    },
    [activeTabId],
  );

  if (showTabGrid || !activeTab) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {tabs.length > 0 ? (
          <View style={styles.tabGridHeader}>
            <Text style={styles.tabGridTitle}>{tabs.length} Tab{tabs.length === 1 ? '' : 's'}</Text>
            <Pressable
              onPress={handleDoneWithTabGrid}
              hitSlop={8}
              accessibilityLabel="Done"
              accessibilityRole="button"
            >
              <Text style={styles.goText}>Done</Text>
            </Pressable>
          </View>
        ) : null}
        <BrowserTabGrid
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={handleSelectTab}
          onNewTab={handleNewTab}
          onCloseTab={handleCloseTab}
        />
      </View>
    );
  }

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
        <Pressable
          onPress={handleToggleBookmark}
          hitSlop={8}
          accessibilityLabel={isBookmarked(currentUrl) ? 'Remove bookmark' : 'Add bookmark'}
          accessibilityRole="button"
        >
          <Ionicons
            name={isBookmarked(currentUrl) ? 'star' : 'star-outline'}
            size={22}
            color={BROWSER_ACCENT}
          />
        </Pressable>
        <Pressable
          onPress={handleShowTabGrid}
          hitSlop={8}
          accessibilityLabel="Tabs"
          accessibilityRole="button"
        >
          <Ionicons name="albums-outline" size={22} color={BROWSER_ACCENT} />
        </Pressable>
        <Pressable
          onPress={handleShare}
          hitSlop={8}
          accessibilityLabel="Share"
          accessibilityRole="button"
        >
          <Ionicons name="share-outline" size={22} color={BROWSER_ACCENT} />
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
        key={activeTabId}
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
        <Pressable
          onPress={handleOpenBookmarks}
          hitSlop={8}
          accessibilityLabel="Bookmarks"
          accessibilityRole="button"
        >
          <Ionicons name="bookmark-outline" size={24} color={BROWSER_ACCENT} />
        </Pressable>
      </View>

      <BrowserBookmarksList
        visible={showBookmarksList}
        bookmarks={bookmarks}
        onClose={() => setShowBookmarksList(false)}
        onNavigate={handleNavigateToBookmark}
      />
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
    tabGridHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    tabGridTitle: { ...Typography.headline, color: colors.label },
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
