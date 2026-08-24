import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';
import { useMotionIntensity } from '../utils/useGestureReduceMotion';
import { hapticImpact, hapticSelection } from '../utils/haptics';
import * as Haptics from 'expo-haptics';
import { contextMenuPresent } from '../theme/springPresets';
import { GlassSurface } from './GlassSurface';

export interface ContextMenuItem {
  label: string;
  onPress: () => void;
  /** Renders in red and is the last group separator-wise. */
  destructive?: boolean;
  /** Greyed out and non-pressable. */
  disabled?: boolean;
  /** Optional leading glyph (icon / emoji). */
  icon?: React.ReactNode;
}

export interface CupertinoContextMenuProps {
  /** Menu rows, in display order. */
  items: ContextMenuItem[];
  /** The trigger element (e.g. an app icon). Long-press opens the menu. */
  children: React.ReactNode;
  /** Optional header text above the rows. */
  title?: string;
  /** a11y label for the long-press trigger. */
  accessibilityLabel?: string;
  /** Called after the menu becomes visible. */
  onOpen?: () => void;
  /** Called after the menu is dismissed (item tap or backdrop). */
  onClose?: () => void;
  /** Long-press threshold in ms. iOS default is ~500; we use 450. */
  delayLongPress?: number;
}

// Initial (resting) transform of the menu card — closed = slightly shrunk and
// transparent so the spring/fade entrance reads as an iOS "pop".
const CLOSED_SCALE = 0.8;
const OPEN_SCALE = 1;

export function CupertinoContextMenu({
  items,
  children,
  title,
  accessibilityLabel = 'Context menu',
  onOpen,
  onClose,
  delayLongPress = 450,
}: CupertinoContextMenuProps) {
  const { theme, typography, borderRadius } = useTheme();
  const { colors } = theme;
  const motionIntensity = useMotionIntensity();

  const [visible, setVisible] = useState(false);

  const scale = useSharedValue(CLOSED_SCALE);
  const opacity = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);

  // Skip the animation on first commit: the shared values already hold the
  // correct resting state, so firing withSpring/withTiming on mount would both
  // be a wasted animation and pollute motion-branch tests. Every later commit
  // (open or close) animates for real.
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      scale.value = visible ? OPEN_SCALE : CLOSED_SCALE;
      opacity.value = visible ? 1 : 0;
      backdropOpacity.value = visible ? 1 : 0;
      didMount.current = true;
      return;
    }

    if (visible) {
      if (motionIntensity === 'off') {
        scale.value = OPEN_SCALE;
        opacity.value = 1;
        backdropOpacity.value = 1;
      } else if (motionIntensity === 'reduced') {
        scale.value = withTiming(OPEN_SCALE, { duration: 180 });
        opacity.value = withTiming(1, { duration: 180 });
        backdropOpacity.value = withTiming(1, { duration: 200 });
      } else {
        scale.value = withSpring(OPEN_SCALE, contextMenuPresent);
        opacity.value = withSpring(1, contextMenuPresent);
        backdropOpacity.value = withTiming(1, { duration: 200 });
      }
    } else {
      if (motionIntensity === 'off') {
        scale.value = CLOSED_SCALE;
        opacity.value = 0;
        backdropOpacity.value = 0;
      } else if (motionIntensity === 'reduced') {
        scale.value = withTiming(CLOSED_SCALE, { duration: 150 });
        opacity.value = withTiming(0, { duration: 150 });
        backdropOpacity.value = withTiming(0, { duration: 150 });
      } else {
        scale.value = withSpring(CLOSED_SCALE, contextMenuPresent);
        opacity.value = withSpring(0, contextMenuPresent);
        backdropOpacity.value = withTiming(0, { duration: 150 });
      }
    }
    // shared values are stable refs; motionIntensity is reactive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, motionIntensity]);

  const open = useCallback(() => {
    setVisible(true);
    // §3.2 rule 4 (#493): cutting animation never cuts haptics. The selection
    // tick fires regardless of motionIntensity.
    hapticSelection();
    onOpen?.();
  }, [onOpen]);

  const close = useCallback(() => {
    setVisible(false);
    onClose?.();
  }, [onClose]);

  const handleItemPress = useCallback(
    (item: ContextMenuItem) => {
      if (item.disabled) return;
      item.onPress();
      hapticImpact(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      close();
    },
    [close],
  );

  const menuStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const groupBg = theme.dark
    ? 'rgba(44, 44, 46, 0.85)'
    : 'rgba(255, 255, 255, 0.85)';

  return (
    <View>
      <Pressable
        onLongPress={open}
        delayLongPress={delayLongPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Long press for options"
      >
        {children}
      </Pressable>

      <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <GlassSurface
            intensity={40}
            tint={theme.dark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            accessibilityLabel="Close menu"
            accessibilityRole="button"
          />
        </Animated.View>

        <View style={styles.menuWrapper} accessibilityViewIsModal importantForAccessibility="yes">
          <Animated.View
            style={[
              styles.menu,
              { opacity: 1 },
              menuStyle,
            ]}
          >
            <GlassSurface
              intensity={70}
              tint={theme.dark ? 'dark' : 'light'}
              style={[styles.card, { backgroundColor: groupBg, borderRadius: borderRadius.large }]}
            >
              {title != null && (
                <View style={styles.header}>
                  <Text style={[typography.footnote, { color: colors.secondaryLabel, fontWeight: '600' }]}>
                    {title}
                  </Text>
                </View>
              )}
              {items.map((item, index) => {
                const isLast = index === items.length - 1;
                return (
                  <Pressable
                    key={item.label}
                    disabled={item.disabled}
                    onPress={() => handleItemPress(item)}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityState={{ disabled: !!item.disabled }}
                    style={({ pressed }) => [
                      styles.item,
                      {
                        borderTopWidth:
                          index > 0 || title != null ? StyleSheet.hairlineWidth : 0,
                        borderTopColor: colors.separator,
                        opacity: item.disabled ? 0.4 : pressed ? 0.6 : 1,
                      },
                      isLast && item.destructive ? styles.itemLastDestructive : null,
                    ]}
                  >
                    {item.icon != null && <View style={styles.itemIcon}>{item.icon}</View>}
                    <Text
                      style={[
                        typography.body,
                        { color: item.destructive ? colors.systemRed : colors.label },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </GlassSurface>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  menuWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  menu: {
    width: '100%',
    maxWidth: 320,
  },
  card: {
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  itemIcon: {
    marginRight: 12,
  },
  itemLastDestructive: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
});
