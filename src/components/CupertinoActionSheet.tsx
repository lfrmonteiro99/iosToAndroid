import React, { useEffect } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { GlassSurface } from './GlassSurface';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { hapticImpact } from '../utils/haptics';
import { useGestureReduceMotion } from '../utils/useGestureReduceMotion';
import { actionSheetPresent } from '../theme/springPresets';

interface ActionSheetOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

interface CupertinoActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  options: ActionSheetOption[];
  cancelLabel?: string;
}

export function CupertinoActionSheet({
  visible,
  onClose,
  title,
  message,
  options,
  cancelLabel = 'Cancel',
}: CupertinoActionSheetProps) {
  const { theme, typography, borderRadius } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const reduceMotion = useGestureReduceMotion();

  const translateY = useSharedValue(400);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = reduceMotion
        ? withTiming(0, { duration: 180 })
        : withSpring(0, actionSheetPresent);
      backdropOpacity.value = withTiming(1, { duration: 250 });
    } else {
      translateY.value = reduceMotion
        ? withTiming(400, { duration: 150 })
        : withSpring(400, actionSheetPresent);
      backdropOpacity.value = withTiming(0, { duration: 200 });
    }
    // Shared values are stable refs; reduceMotion is a reactive dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduceMotion]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const groupBg = theme.dark
    ? 'rgba(44, 44, 46, 0.85)'
    : 'rgba(255, 255, 255, 0.85)';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 8 },
            sheetStyle,
          ]}
        >
          {/* Options group */}
          <GlassSurface
            intensity={60}
            tint={theme.dark ? 'dark' : 'light'}
            style={[
              styles.group,
              { backgroundColor: groupBg, borderRadius: borderRadius.large },
            ]}
          >
            {(title || message) && (
              <View style={styles.header}>
                {title && (
                  <Text
                    style={[
                      typography.footnote,
                      { color: colors.secondaryLabel, fontWeight: '600' },
                    ]}
                  >
                    {title}
                  </Text>
                )}
                {message && (
                  <Text
                    style={[
                      typography.caption1,
                      { color: colors.secondaryLabel, marginTop: 4 },
                    ]}
                  >
                    {message}
                  </Text>
                )}
              </View>
            )}
            {options.map((option, index) => (
              <Pressable
                key={option.label}
                style={({ pressed }) => [
                  styles.option,
                  {
                    borderTopWidth: index > 0 || title || message ? StyleSheet.hairlineWidth : 0,
                    borderTopColor: colors.separator,
                    backgroundColor: pressed ? colors.systemGray5 : 'transparent',
                  },
                ]}
                onPress={() => {
                  hapticImpact(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  option.onPress();
                  onClose();
                }}
              >
                <Text
                  style={[
                    typography.body,
                    {
                      color: option.destructive
                        ? colors.systemRed
                        : colors.systemBlue,
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </GlassSurface>

          {/* Cancel button */}
          <Pressable
            style={({ pressed }) => [
              styles.cancelButton,
              {
                backgroundColor: pressed
                  ? colors.systemGray5
                  : groupBg,
                borderRadius: borderRadius.large,
              },
            ]}
            onPress={onClose}
          >
            <Text
              style={[
                typography.body,
                { color: colors.systemBlue, fontWeight: '600' },
              ]}
            >
              {cancelLabel}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    paddingHorizontal: 8,
  },
  group: {
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  option: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 57,
    paddingVertical: 16,
  },
  cancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 57,
    marginTop: 8,
  },
});
