import React, { useEffect } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';

interface AlertAction {
  label: string;
  onPress: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface CupertinoAlertDialogProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  actions: AlertAction[];
}

export function CupertinoAlertDialog({
  visible,
  onClose,
  title,
  message,
  actions,
}: CupertinoAlertDialogProps) {
  const { theme, typography, borderRadius } = useTheme();
  const { colors } = theme;

  const scale = useSharedValue(1.2);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = withSpring(1, { damping: 25, stiffness: 500 });
      opacity.value = withTiming(1, { duration: 200 });
    } else {
      scale.value = withTiming(1.2, { duration: 150 });
      opacity.value = withTiming(0, { duration: 150 });
    }
  }, [visible, scale, opacity]);

  const dialogStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const isHorizontal = actions.length <= 2;
  const dialogBg = theme.dark
    ? 'rgba(44, 44, 46, 0.95)'
    : 'rgba(255, 255, 255, 0.95)';

  const getActionTextStyle = (action: AlertAction) => {
    if (action.style === 'destructive') return { color: colors.systemRed };
    if (action.style === 'cancel') return { color: colors.systemBlue, fontWeight: '600' as const };
    return { color: colors.systemBlue };
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.dialog,
            {
              backgroundColor: dialogBg,
              borderRadius: 14,
            },
            dialogStyle,
          ]}
        >
          {/* Content */}
          <View style={styles.content}>
            <Text
              style={[
                typography.headline,
                { color: colors.label, textAlign: 'center' },
              ]}
            >
              {title}
            </Text>
            {message && (
              <Text
                style={[
                  typography.footnote,
                  {
                    color: colors.label,
                    textAlign: 'center',
                    marginTop: 4,
                  },
                ]}
              >
                {message}
              </Text>
            )}
          </View>

          {/* Actions */}
          <View
            style={[
              isHorizontal ? styles.actionsRow : styles.actionsColumn,
              {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: colors.separator,
              },
            ]}
          >
            {actions.map((action, index) => (
              <Pressable
                key={action.label}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    backgroundColor: pressed ? colors.systemGray5 : 'transparent',
                    borderLeftWidth:
                      isHorizontal && index > 0 ? StyleSheet.hairlineWidth : 0,
                    borderTopWidth:
                      !isHorizontal && index > 0 ? StyleSheet.hairlineWidth : 0,
                    borderLeftColor: colors.separator,
                    borderTopColor: colors.separator,
                  },
                ]}
                onPress={() => {
                  action.onPress();
                  onClose();
                }}
              >
                <Text
                  style={[
                    typography.body,
                    { fontSize: 17 },
                    getActionTextStyle(action),
                  ]}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  dialog: {
    width: 270,
    overflow: 'hidden',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
  },
  actionsRow: {
    flexDirection: 'row',
  },
  actionsColumn: {
    flexDirection: 'column',
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: 12,
  },
});
