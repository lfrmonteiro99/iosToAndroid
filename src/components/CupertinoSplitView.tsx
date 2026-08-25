import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { GlassSurface } from './GlassSurface';
import {
  useResponsiveLayout,
  REGULAR_WIDTH_BREAKPOINT,
  LayoutKind,
} from '../utils/useResponsiveLayout';

export interface CupertinoSplitViewProps {
  /** Master/sidebar content (left column on tablet). */
  sidebar: React.ReactNode;
  /** Detail/content content (right column on tablet, full pane on phone). */
  content: React.ReactNode;
  /** Sidebar width in logical points when in the regular (tablet) layout. */
  sidebarWidth?: number;
  /**
   * Force a specific width class, bypassing the live window detection. Used by
   * callers that need a fixed form (e.g. tests, or a screen that always wants
   * the split regardless of width). Omit to follow the real device width.
   */
  forceLayout?: LayoutKind;
  testID?: string;
}

/**
 * Responsive master/detail container (spec §24 — Responsive/tablet layout).
 *
 * - Phone / compact width: renders `content` alone, full-width. The visual and
 *   DOM are identical to a plain single-pane screen, so existing phone-layout
 *   behaviour is preserved byte-for-byte.
 * - Tablet / regular width: renders a stable left `sidebar` (frosted glass,
 *   fixed width) next to the `content` pane — the iPad-style two-column form.
 *
 * The component is intentionally layout-agnostic: it does not know what the
 * sidebar or content are, so it can host the Settings master list, a Launcher
 * app rail, or any other two-pane surface.
 */
export function CupertinoSplitView({
  sidebar,
  content,
  sidebarWidth = 320,
  forceLayout,
  testID,
}: CupertinoSplitViewProps) {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { layout } = useResponsiveLayout();
  const isTablet =
    forceLayout != null ? forceLayout === 'regular' : layout === 'regular';

  const background = { backgroundColor: colors.systemGroupedBackground };

  if (!isTablet) {
    // Phone / single-pane: render `content` with no extra wrapper so the
    // caller's DOM is byte-identical to a plain single-column screen.
    return <>{content}</>;
  }

  return (
    <View
      style={[styles.tablet, background]}
      testID={testID}
    >
      <GlassSurface
        intensity={80}
        tint={theme.dark ? 'dark' : 'light'}
        style={[
          styles.sidebar,
          {
            width: sidebarWidth,
            paddingTop: insets.top,
            borderRightWidth: StyleSheet.hairlineWidth,
            borderRightColor: colors.separator,
          },
        ]}
      >
        <View style={styles.sidebarInner} testID="split-sidebar">
          {sidebar}
        </View>
      </GlassSurface>
      <View style={styles.content} testID="split-content">
        {content}
      </View>
    </View>
  );
}

export { REGULAR_WIDTH_BREAKPOINT };

const styles = StyleSheet.create({
  tablet: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    // Stable, non-scrolling-context column; the inner view scrolls if needed.
    alignSelf: 'stretch',
  },
  sidebarInner: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
