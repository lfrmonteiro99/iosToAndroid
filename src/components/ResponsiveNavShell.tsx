import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRegularWidth } from '../hooks/useRegularWidth';
import { CupertinoSidebar } from './CupertinoSidebar';
import { CupertinoTabBar } from './CupertinoTabBar';
import type { NavItem } from './navigation/navItems';

export interface ResponsiveNavShellProps {
  /** Destination list, shared by both chromes. */
  navItems: NavItem[];
  /** Currently selected item id. */
  activeId: string;
  /** Called with the item id when the user picks a different destination. */
  onSelect: (id: string) => void;
  /** Main content rendered to the right of the sidebar (tablet) / above the tab bar (phone). */
  children: React.ReactNode;
}

/**
 * Layout shell that picks the navigation chrome by horizontal size class
 * (#633):
 *
 * - regular width (tablet / large window): a STABLE sidebar on the left and the
 *   content beside it — the chrome never overlaps or hides the content.
 * - compact width (phone): a bottom tab bar, content above it.
 *
 * The switch is driven by `useRegularWidth`, so resizing a freeform window or
 * unfolding a foldable flips the layout live without a remount of `children`.
 * Both chromes are fed the same `items`/`activeId`/`onSelect`, so the parent
 * owns all selection state and the two form factors can never drift.
 */
export function ResponsiveNavShell({
  navItems,
  activeId,
  onSelect,
  children,
}: ResponsiveNavShellProps) {
  const isRegular = useRegularWidth();

  if (isRegular) {
    return (
      <View style={styles.row}>
        <View testID="cupertino-sidebar" style={styles.chrome}>
          <CupertinoSidebar
            items={navItems}
            activeId={activeId}
            onSelect={onSelect}
          />
        </View>
        <View style={styles.content}>{children}</View>
      </View>
    );
  }

  return (
    <View style={styles.column}>
      <View style={styles.content}>{children}</View>
      <View testID="cupertino-tabbar" style={styles.chrome}>
        <CupertinoTabBar
          items={navItems}
          activeId={activeId}
          onSelect={onSelect}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  column: {
    flex: 1,
    flexDirection: 'column',
  },
  content: {
    flex: 1,
  },
  chrome: {
    // Hosts the chrome so the testID wrapper does not alter layout.
  },
});
