import React, { useCallback, useEffect } from 'react';
import { Dimensions, Image, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { gestureConfig } from '../utils/gestureConfig';
import { GestureHaptics } from '../utils/gestureHaptics';
import { commitForQuickSwitch } from '../utils/gestureMachine';
import { pushSample, sampledVelocity, useVelocityBuffer } from '../utils/gestureVelocity';
import { useApps } from '../store/AppsStore';

const { width: SCREEN_W } = Dimensions.get('window');

const ICON_SIZE = 48;
const ICON_SLOT_W = 80; // icon + horizontal padding per slot

export function QuickSwitchHomeBar() {
  const { recentApps, apps, launchApp } = useApps();

  const insets = useSafeAreaInsets();

  // Shared values
  const currentT = useSharedValue(0);
  useFrameCallback(({ timestamp }) => {
    'worklet';
    currentT.value = timestamp;
  });

  const buf = useVelocityBuffer();
  const swipeOffset = useSharedValue(0);
  const previewOpacity = useSharedValue(0);

  // Availability flags on the JS side, mirrored to shared values for worklet access
  const canSwipeLeft = recentApps.length >= 2;
  const canSwipeRight = recentApps.length >= 3;
  const canSwipeLeftShared = useSharedValue(canSwipeLeft);
  const canSwipeRightShared = useSharedValue(canSwipeRight);

  useEffect(() => {
    canSwipeLeftShared.value = recentApps.length >= 2;
    canSwipeRightShared.value = recentApps.length >= 3;
  }, [recentApps, canSwipeLeftShared, canSwipeRightShared]);

  const onCommitSwitch = useCallback(
    (dir: 'left' | 'right') => {
      GestureHaptics.commit('light');
      const idx = dir === 'left' ? 1 : 2;
      const target = recentApps[idx];
      if (!target) return;
      launchApp(target.packageName);
    },
    [recentApps, launchApp],
  );

  const pan = Gesture.Pan()
    .enabled(recentApps.length > 0)
    .activeOffsetX([-gestureConfig.axisLockDp, gestureConfig.axisLockDp])
    .failOffsetY([-gestureConfig.axisLockDp * 2, gestureConfig.axisLockDp * 2])
    .onBegin(() => {
      'worklet';
      buf.value = [];
      swipeOffset.value = 0;
      previewOpacity.value = 0;
    })
    .onUpdate((e) => {
      'worklet';
      pushSample(buf.value, e.translationX, e.translationY, currentT.value);
      swipeOffset.value = e.translationX;
      // Ramp opacity in from 0 once the user has dragged 10dp
      const drag = Math.abs(e.translationX);
      previewOpacity.value = Math.min(1, Math.max(0, (drag - 10) / 20));
    })
    .onEnd((e) => {
      'worklet';
      pushSample(buf.value, e.translationX, e.translationY, currentT.value);
      const { vx } = sampledVelocity(buf.value, currentT.value);
      const dx = e.translationX;
      const progress = Math.abs(dx) / gestureConfig.quickSwitchDistanceDp;
      const reason = commitForQuickSwitch({ progress, velocity: vx, holdMs: 0 });

      if (reason !== 'none') {
        const direction: 'left' | 'right' = dx < 0 ? 'left' : 'right';
        const canGo = direction === 'left' ? canSwipeLeftShared.value : canSwipeRightShared.value;

        if (canGo) {
          runOnJS(onCommitSwitch)(direction);
          swipeOffset.value = withSpring(
            dx < 0 ? -SCREEN_W : SCREEN_W,
            gestureConfig.spring.softCarousel,
          );
        } else {
          // No destination — snap back
          swipeOffset.value = withSpring(0, gestureConfig.spring.fastSettle);
        }
      } else {
        swipeOffset.value = withSpring(0, gestureConfig.spring.fastSettle);
      }
      previewOpacity.value = withSpring(0, gestureConfig.spring.fastSettle);
    });

  // Resolve display apps: [prev (index 2), current (index 0), next (index 1)]
  const resolveApp = (packageName: string) =>
    apps.find((a) => a.packageName === packageName) ?? null;

  const currentApp = recentApps[0] ? resolveApp(recentApps[0].packageName) : null;
  const nextApp = recentApps[1] ? resolveApp(recentApps[1].packageName) : null;
  const prevApp = recentApps[2] ? resolveApp(recentApps[2].packageName) : null;

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeOffset.value }],
    opacity: previewOpacity.value,
  }));

  const bottomPad = Math.max(insets.bottom, 6);

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[styles.strip, { paddingBottom: bottomPad }]}
        pointerEvents="auto"
      >
        {/* Preview row — only visible during drag */}
        <Animated.View style={[styles.previewRow, rowStyle]}>
          {/* Previous app slot (rightward swipe target) */}
          <View style={styles.appSlot}>
            {prevApp ? (
              <>
                {prevApp.icon ? (
                  <Image source={{ uri: prevApp.icon }} style={styles.appIcon} />
                ) : (
                  <View style={[styles.appIcon, styles.appIconFallback]} />
                )}
                <Text style={styles.appLabel} numberOfLines={1}>
                  {prevApp.name}
                </Text>
              </>
            ) : null}
          </View>

          {/* Current app slot (center) */}
          <View style={styles.appSlot}>
            {currentApp ? (
              <>
                {currentApp.icon ? (
                  <Image source={{ uri: currentApp.icon }} style={styles.appIcon} />
                ) : (
                  <View style={[styles.appIcon, styles.appIconFallback]} />
                )}
                <Text style={styles.appLabel} numberOfLines={1}>
                  {currentApp.name}
                </Text>
              </>
            ) : null}
          </View>

          {/* Next app slot (leftward swipe target) */}
          <View style={styles.appSlot}>
            {nextApp ? (
              <>
                {nextApp.icon ? (
                  <Image source={{ uri: nextApp.icon }} style={styles.appIcon} />
                ) : (
                  <View style={[styles.appIcon, styles.appIconFallback]} />
                )}
                <Text style={styles.appLabel} numberOfLines={1}>
                  {nextApp.name}
                </Text>
              </>
            ) : null}
          </View>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  strip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: gestureConfig.bottomZoneHeightDp + 14, // match HomeIndicator's paddingTop catch area
    zIndex: 49,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: ICON_SLOT_W * 3,
    marginBottom: 6,
  },
  appSlot: {
    width: ICON_SLOT_W,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  appIcon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: 12,
  },
  appIconFallback: {
    backgroundColor: 'rgba(120,120,120,0.5)',
  },
  appLabel: {
    marginTop: 4,
    fontSize: 10,
    color: '#ffffff',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
