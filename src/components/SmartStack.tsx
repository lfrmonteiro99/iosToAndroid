import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, runOnJS } from 'react-native-reanimated';
import { useSettings } from '../store/SettingsStore';
import { gestureConfig } from '../utils/gestureConfig';
import { settle } from '../utils/useGestureReduceMotion';

export interface SmartStackItem {
  /** Stable identity for the widget — survives reordering, unlike array index. */
  key: string;
  node: React.ReactNode;
}

export interface SmartStackProps {
  /** Widgets in the stack, top-of-stack first on initial mount. */
  items: SmartStackItem[];
  /** Milliseconds between automatic rotations. 0/undefined disables auto-rotate. */
  autoRotateIntervalMs?: number;
  /** Fires with the new key order after every rotation, gestured or automatic. */
  onOrderChange?: (order: string[]) => void;
  testID?: string;
}

/** Moves the top item to the back of the stack (swipe up / "next"). */
export function rotateForward<T>(order: T[]): T[] {
  if (order.length < 2) return order;
  return [...order.slice(1), order[0]];
}

/** Moves the back item to the top of the stack (swipe down / "previous"). */
export function rotateBackward<T>(order: T[]): T[] {
  if (order.length < 2) return order;
  return [order[order.length - 1], ...order.slice(0, -1)];
}

// Only the top card plus this many peeking behind it are rendered — the rest
// of the stack exists purely as order state, matching the shallow "deck"
// look of iOS's own Smart Stack (it never renders more than 3 layers either).
const MAX_VISIBLE_LAYERS = 3;

export function SmartStack({ items, autoRotateIntervalMs, onOrderChange, testID }: SmartStackProps) {
  const { settings } = useSettings();
  const [order, setOrder] = useState<string[]>(() => items.map((item) => item.key));

  // Reconcile `order` when the caller's item set changes (a widget was added
  // or removed from the stack): keep the relative order of survivors, append
  // newly-added keys at the back. Returning the previous array reference when
  // nothing actually changed avoids re-triggering the auto-rotate effect below.
  useEffect(() => {
    setOrder((prev) => {
      const incomingKeys = items.map((item) => item.key);
      const incomingSet = new Set(incomingKeys);
      const surviving = prev.filter((key) => incomingSet.has(key));
      const additions = incomingKeys.filter((key) => !surviving.includes(key));
      const next = [...surviving, ...additions];
      if (next.length === prev.length && next.every((key, i) => key === prev[i])) {
        return prev;
      }
      return next;
    });
  }, [items]);

  const itemsByKey = useMemo(() => {
    const map = new Map<string, React.ReactNode>();
    items.forEach((item) => map.set(item.key, item.node));
    return map;
  }, [items]);

  // Read from a ref (not state) inside the auto-rotate timer and the gesture
  // callbacks so neither has to be torn down and rebuilt on every rotation.
  const isDraggingRef = useRef(false);
  const orderRef = useRef(order);
  orderRef.current = order;

  const commitRotate = useCallback(
    (direction: 'forward' | 'backward') => {
      setOrder((prev) => {
        const next = direction === 'forward' ? rotateForward(prev) : rotateBackward(prev);
        onOrderChange?.(next);
        return next;
      });
    },
    [onOrderChange],
  );

  useEffect(() => {
    if (!autoRotateIntervalMs || autoRotateIntervalMs <= 0 || orderRef.current.length < 2) {
      return undefined;
    }
    const id = setInterval(() => {
      // A gesture in flight owns the stack; let it finish before an automatic
      // rotation can step on it and reorder from underneath the user's thumb.
      if (!isDraggingRef.current) {
        commitRotate('forward');
      }
    }, autoRotateIntervalMs);
    return () => clearInterval(id);
  }, [autoRotateIntervalMs, commitRotate, order.length]);

  const translateY = useSharedValue(0);

  const setDragging = useCallback((value: boolean) => {
    isDraggingRef.current = value;
  }, []);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(order.length > 1)
        .onBegin(() => {
          'worklet';
          runOnJS(setDragging)(true);
        })
        .onUpdate((event) => {
          'worklet';
          translateY.value = event.translationY;
        })
        .onEnd((event) => {
          'worklet';
          if (event.translationY <= -gestureConfig.smartStackCommitDp) {
            runOnJS(commitRotate)('forward');
          } else if (event.translationY >= gestureConfig.smartStackCommitDp) {
            runOnJS(commitRotate)('backward');
          }
          translateY.value = settle(0, 'softCarousel', settings.reduceMotion);
        })
        .onFinalize(() => {
          'worklet';
          runOnJS(setDragging)(false);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order.length, commitRotate, setDragging, settings.reduceMotion],
  );

  const topCardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const visible = order.slice(0, MAX_VISIBLE_LAYERS);

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.root} testID={testID}>
        {visible.map((key, depth) => {
          const node = itemsByKey.get(key);
          if (node === undefined) return null;
          const isTop = depth === 0;
          const layerTestID = testID ? `${testID}-layer-${key}` : undefined;

          if (isTop) {
            return (
              <Animated.View
                key={key}
                testID={testID ? `${testID}-top` : undefined}
                style={[styles.topLayer, topCardStyle]}
              >
                {node}
              </Animated.View>
            );
          }

          return (
            <View
              key={key}
              testID={layerTestID}
              pointerEvents="none"
              style={[
                styles.backLayer,
                {
                  transform: [{ translateY: depth * 8 }, { scale: 1 - depth * 0.04 }],
                  opacity: 1 - depth * 0.35,
                  zIndex: MAX_VISIBLE_LAYERS - depth,
                },
              ]}
            >
              {node}
            </View>
          );
        })}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
  },
  topLayer: {
    zIndex: MAX_VISIBLE_LAYERS,
  },
  backLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
});
