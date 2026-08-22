import React, { useEffect } from 'react';
import { Image, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { gestureConfig } from '../utils/gestureConfig';

export interface LaunchBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LaunchPhase = 'expand' | 'collapse';

interface AppLaunchOverlayProps {
  icon: string;
  bounds: LaunchBounds;
  /** 'expand' grows from `bounds` to full screen; 'collapse' reverses that (launch failure, §6.3 "cuidados"). */
  phase: LaunchPhase;
  /** Fired once the expand spring settles — this is when the intent should fire (§6.3). */
  onExpandComplete: () => void;
  /** Fired once the collapse spring settles, so the caller can unmount the overlay. */
  onCollapseComplete?: () => void;
  /**
   * Spring config driving the expand/collapse motion. Defaults to
   * `gestureConfig.spring.appLaunch`. Callers derive this from
   * `settings.appLaunchDurationMs` via `springForAppLaunchDuration` (#512
   * §6.3) so the animation stays a spring at every user-chosen duration.
   */
  springConfig?: { stiffness: number; damping: number; mass: number };
}

// Linear interpolation from the icon's on-screen rect to a full-screen rect,
// driven by a single 0→1 progress value. Pulled out of the component so the
// frame math is unit-testable without mounting Reanimated/RN at all.
export function interpolateLaunchFrame(
  bounds: LaunchBounds,
  progress: number,
  screenWidth: number,
  screenHeight: number,
): LaunchBounds & { borderRadius: number } {
  const clamped = Math.min(1, Math.max(0, progress));
  return {
    x: bounds.x + (0 - bounds.x) * clamped,
    y: bounds.y + (0 - bounds.y) * clamped,
    width: bounds.width + (screenWidth - bounds.width) * clamped,
    height: bounds.height + (screenHeight - bounds.height) * clamped,
    borderRadius: ICON_BORDER_RADIUS * (1 - clamped),
  };
}

const ICON_BORDER_RADIUS = 14;

export function AppLaunchOverlay({
  icon,
  bounds,
  phase,
  onExpandComplete,
  onCollapseComplete,
  springConfig = gestureConfig.spring.appLaunch,
}: AppLaunchOverlayProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (phase === 'expand') {
      progress.value = withSpring(1, springConfig, (finished) => {
        'worklet';
        if (finished) {
          runOnJS(onExpandComplete)();
        }
      });
    } else {
      progress.value = withSpring(0, springConfig, (finished) => {
        'worklet';
        if (finished && onCollapseComplete) {
          runOnJS(onCollapseComplete)();
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const animatedStyle = useAnimatedStyle(() => {
    const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
    const frame = interpolateLaunchFrame(bounds, progress.value, screenWidth, screenHeight);
    return {
      left: frame.x,
      top: frame.y,
      width: frame.width,
      height: frame.height,
      borderRadius: frame.borderRadius,
    };
  });

  return (
    <Animated.View
      testID="app-launch-overlay"
      pointerEvents="none"
      style={[styles.overlay, animatedStyle]}
    >
      {icon ? (
        <Image source={{ uri: icon }} style={styles.icon} resizeMode="cover" />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: '#000',
    zIndex: 1000,
    elevation: 20,
  },
  icon: {
    width: '100%',
    height: '100%',
  },
});
