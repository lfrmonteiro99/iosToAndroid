import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  LayoutChangeEvent,
  LayoutRectangle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';
import { useGestureReduceMotion } from '../utils/useGestureReduceMotion';
import { hapticSelection } from '../utils/haptics';
import { contextMenuPresentIOS } from '../theme/springPresets';

export interface IOContextMenuItem {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

export interface IOContextMenuProps {
  items: IOContextMenuItem[];
  children: React.ReactNode;
  /** Minimum long-press duration before the menu opens (ms). Defaults to 450. */
  longPressDuration?: number;
}

type Anchor = LayoutRectangle & { pageX: number; pageY: number };

/**
 * iOS long-press context menu (spec §13): blur + rounded corners + shadow +
 * spring scale + fade, positioned next to the long-pressed element.
 *
 * Wraps a trigger; opens a modal anchored to the trigger's measured position
 * on long-press, plays a selection haptic, and shows the items. Closing is via
 * the backdrop, an item press, or Escape. Reduced-motion users get a plain fade.
 */
export function IOContextMenu({ items, children, longPressDuration = 450 }: IOContextMenuProps) {
  const { theme, typography, borderRadius } = useTheme();
  const { colors } = theme;
  const reduceMotion = useGestureReduceMotion();

  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const scale = useSharedValue(0.85);
  const opacity = useSharedValue(0);
  const triggerRef = useRef<View>(null);
  const openRef = useRef(false);

  const open = () => {
    if (openRef.current || items.length === 0) return;
    openRef.current = true;
    setVisible(true);
    hapticSelection().catch(() => {});
    // Measure for contextual placement. `measureInWindow` is unavailable in some
    // environments (e.g. jsdom during tests); the menu still renders at a default
    // position in that case, so the absence of a measurement must never suppress it.
    triggerRef.current?.measureInWindow?.((x, y, width, height) => {
      setAnchor({ x, y, width, height, pageX: x, pageY: y });
    });
  };

  const close = () => {
    if (!openRef.current) return;
    openRef.current = false;
    setVisible(false);
  };

  useEffect(() => {
    if (visible) {
      scale.value = reduceMotion
        ? withTiming(1, { duration: 150 })
        : withSpring(1, contextMenuPresentIOS);
      opacity.value = withTiming(1, { duration: 160 });
    } else {
      scale.value = withTiming(0.85, { duration: 120 });
      opacity.value = withTiming(0, { duration: 120 });
    }
    // Shared values are stable refs; reduceMotion is a reactive dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduceMotion]);

  const menuStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const backdropStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const menuBg = theme.dark
    ? 'rgba(44, 44, 46, 0.92)'
    : 'rgba(255, 255, 255, 0.92)';

  const handleTriggerLayout = (_e: LayoutChangeEvent) => {
    // Layout is captured at long-press time via measureInWindow; nothing to do.
  };

  return (
    <>
      <View ref={triggerRef} testID="ctx-trigger" onLayout={handleTriggerLayout}>
        <Pressable
          delayLongPress={longPressDuration}
          onLongPress={open}
          accessibilityLabel="Open context menu"
          accessibilityRole="button"
        >
          {children}
        </Pressable>
      </View>

      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={close}
        testID="ctx-modal"
      >
        <View style={styles.overlay}>
          <Animated.View style={[styles.backdrop, backdropStyle]}>
            <Pressable
              testID="ctx-backdrop"
              style={StyleSheet.absoluteFill}
              onPress={close}
            />
          </Animated.View>

          <Animated.View
            testID="ctx-menu"
            style={[
              styles.menu,
              anchor
                ? {
                    top: anchor.y + anchor.height + 4,
                    left: Math.max(8, anchor.x),
                  }
                : styles.menuDefaultPosition,
              {
                backgroundColor: menuBg,
                borderRadius: borderRadius.large,
              },
              menuStyle,
            ]}
          >
            <BlurView
              intensity={80}
              tint={theme.dark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
            {items.map((item, index) => (
                <Pressable
                  key={item.label}
                  testID={`ctx-item-${item.label}`}
                  style={({ pressed }) => [
                    styles.item,
                    {
                      borderTopWidth:
                        index > 0 ? StyleSheet.hairlineWidth : 0,
                      borderTopColor: colors.separator,
                      backgroundColor: pressed
                        ? colors.pressedRowBackground
                        : 'transparent',
                    },
                  ]}
                  onPress={() => {
                    close();
                    item.onPress();
                  }}
                  accessibilityRole="menuitem"
                >
                  <Text
                    style={[
                      typography.body,
                      {
                        color: item.destructive
                          ? colors.systemRed
                          : colors.label,
                      },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </Animated.View>
          </View>
        </Modal>
      </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  menu: {
    position: 'absolute',
    minWidth: 180,
    maxWidth: 260,
    overflow: 'hidden',
    // iOS context-menu shadow (spec §13).
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 8,
  },
  // Fallback position when measureInWindow isn't available (e.g. jsdom tests):
  // centred, just below the top safe area.
  menuDefaultPosition: {
    top: 80,
    left: 16,
    right: 16,
  },
  item: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
