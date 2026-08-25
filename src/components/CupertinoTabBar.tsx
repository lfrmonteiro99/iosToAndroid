import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { GlassSurface } from './GlassSurface';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { hapticSelection } from '../utils/haptics';
import type { NavItem } from './navigation/navItems';

export interface CupertinoTabBarProps {
  items: NavItem[];
  /** Currently selected item id. */
  activeId: string;
  /** Called with the item id when the user picks a different destination. */
  onSelect: (id: string) => void;
}

/**
 * Compact bottom tab bar for the "compact width" (phone) form factor (#633).
 *
 * Purely controlled — the parent owns `activeId` and the selection callback and
 * decides what navigation actually happens. This keeps it decoupled from any
 * specific React Navigation navigator so the SAME item list drives the tablet
 * sidebar (`CupertinoSidebar`) and this phone bar.
 */
export function CupertinoTabBar({ items, activeId, onSelect }: CupertinoTabBarProps) {
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
          paddingBottom: insets.bottom,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.separator,
        },
      ]}
    >
      <View style={styles.tabRow}>
        {items.map((item) => {
          const isActive = item.id === activeId;
          const color = isActive ? colors.systemBlue : colors.systemGray;

          const onPress = () => {
            // Double-tap safety: re-selecting the active tab is a no-op.
            if (isActive) return;
            hapticSelection();
            onSelect(item.id);
          };

          return (
            <Pressable
              key={item.id}
              testID={`tab-bar-item-${item.id}`}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: isActive }}
              style={styles.tab}
            >
              <Ionicons name={item.icon} size={25} color={color} />
              <Text
                numberOfLines={1}
                style={[
                  typography.tabLabel,
                  { color, marginTop: 2 },
                ]}
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

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  tabRow: {
    flexDirection: 'row',
    height: 49,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
  },
});
