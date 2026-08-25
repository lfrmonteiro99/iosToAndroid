import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { GlassSurface } from './GlassSurface';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { hapticSelection } from '../utils/haptics';
import type { NavItem } from './navigation/navItems';

export interface CupertinoSidebarProps {
  items: NavItem[];
  /** Currently selected item id. */
  activeId: string;
  /** Called with the item id when the user picks a different destination. */
  onSelect: (id: string) => void;
}

/**
 * Stable vertical sidebar for the "regular width" (tablet / large window) form
 * factor. Replaces the phone tab bar with a persistent column that never hides
 * the content (#633). It is purely controlled — parent owns `activeId` and the
 * selection callback, so it never navigates on its own.
 */
export function CupertinoSidebar({ items, activeId, onSelect }: CupertinoSidebarProps) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  return (
    <GlassSurface
      intensity={80}
      tint={theme.dark ? 'dark' : 'light'}
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          borderRightWidth: StyleSheet.hairlineWidth,
          borderRightColor: colors.separator,
        },
      ]}
    >
      <View style={styles.list}>
        {items.map((item) => {
          const isActive = item.id === activeId;
          const color = isActive ? colors.systemBlue : colors.systemGray;

          const onPress = () => {
            // Double-tap safety: re-selecting the active item is a no-op (this
            // mirrors the tab bar behaviour and avoids redundant re-selection).
            if (isActive) return;
            hapticSelection();
            onSelect(item.id);
          };

          return (
            <Pressable
              key={item.id}
              testID={`side-bar-item-${item.id}`}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: isActive }}
              style={({ pressed }) => [
                styles.item,
                isActive && { backgroundColor: colors.systemFill },
                pressed && { backgroundColor: colors.tertiarySystemFill ?? colors.systemFill },
              ]}
            >
              <Ionicons name={item.icon} size={24} color={color} />
              <Text
                numberOfLines={1}
                style={[typography.tabLabel, { color, marginTop: 4 }]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </GlassSurface>
  );
}

const SIDEBAR_WIDTH = 84;

const styles = StyleSheet.create({
  container: {
    width: SIDEBAR_WIDTH,
    alignSelf: 'stretch',
  },
  list: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  item: {
    width: SIDEBAR_WIDTH - 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    marginVertical: 2,
  },
});
