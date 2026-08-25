import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, runOnJS } from 'react-native-reanimated';
import { useSettings } from '../store/SettingsStore';
import { gestureConfig } from '../utils/gestureConfig';
import { settle } from '../utils/useGestureReduceMotion';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SMART_STACK_PERSIST_KEY = '@iostoandroid/smart_stack_order';

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
  /**
   * Per-widget accessibility label keyed by item key. iOS keeps every card in
   * the stack reachable to TalkBack/VoiceOver with its own label, even the
   * peeking layers behind the top card — so each widget announces itself
   * independently rather than inheriting the top card's label.
   */
  accessibilityLabels?: Record<string, string>;
  /** When provided, renders the iOS "Edit Stack" button (pencil) at the stack's footer. */
  onEditStack?: () => void;
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

// ---------------------------------------------------------------------------
// Persistence: the Smart Stack remembers the LAST widget it landed on (its
// key order) across launches — that is the entire persisted state. We do NOT
// persist which widgets are members (that is owned by the caller's config);
// only the rotation order is persisted, under its own dedicated key so the
// stack's order survives independently of the widget grid config.
// ---------------------------------------------------------------------------

export async function loadSmartStackOrder(): Promise<string[] | null> {
  try {
    const raw = await AsyncStorage.getItem(SMART_STACK_PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
  } catch {
    // fall through to "no saved order"
  }
  return null;
}

async function saveSmartStackOrder(order: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SMART_STACK_PERSIST_KEY, JSON.stringify(order));
  } catch {
    // persistence is best-effort; a failed write must never break rotation
  }
}

/** Restores a saved order onto the current item set: keeps survivors in the
 * saved relative order, then appends keys not present in the saved order, and
 * finally drops keys that no longer exist. Returns null when the saved order
 * matches the incoming item order — so nothing is rewritten on a no-op. */
function reconcileWithSaved(
  saved: string[] | null,
  incomingKeys: string[],
): string[] | null {
  if (!saved) return null;
  const incomingSet = new Set(incomingKeys);
  const surviving = saved.filter((key) => incomingSet.has(key));
  const additions = incomingKeys.filter((key) => !surviving.includes(key));
  const next = [...surviving, ...additions];
  // If every incoming key was already in the saved order, the reconciled
  // result is identical to the incoming set — nothing to restore.
  if (next.length === incomingKeys.length && next.every((key, i) => key === incomingKeys[i])) {
    return null;
  }
  return next;
}

export function SmartStack({ items, autoRotateIntervalMs, onOrderChange, accessibilityLabels, onEditStack, testID }: SmartStackProps) {
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

  // Hydrate the persisted order once on mount (after the item set is known).
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    let cancelled = false;
    loadSmartStackOrder().then((saved) => {
      if (cancelled) return;
      const incomingKeys = items.map((item) => item.key);
      const restored = reconcileWithSaved(saved, incomingKeys);
      if (restored) {
        setOrder(restored);
        onOrderChange?.(restored);
      }
    });
    return () => {
      cancelled = true;
    };
    // items is intentionally read once at mount — later item changes are
    // handled by the reconcile effect above, not by re-hydrating from storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        saveSmartStackOrder(next);
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
  const activeKey = visible[0];

  const labelFor = useCallback(
    (key: string) => accessibilityLabels?.[key] ?? `Widget ${key}`,
    [accessibilityLabels],
  );

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.root} testID={testID}>
        <View style={styles.stackArea} testID={testID ? `${testID}-cards` : undefined}>
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
                  accessibilityLabel={labelFor(key)}
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
                accessibilityLabel={labelFor(key)}
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

        {/* iOS page indicator: one dot per widget, active dot = top of stack. */}
        {visible.length > 0 && (
          <View
            testID={testID ? `${testID}-dots` : undefined}
            style={styles.dots}
            accessibilityLabel="Widget pages"
          >
            {visible.map((key) => (
              <View
                key={key}
                testID="stack-dot"
                data-key={key}
                data-active={key === activeKey}
                style={[
                  styles.dot,
                  key === activeKey ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
            {/* A single testID hook for the active dot, so tests can track rotation. */}
            {activeKey !== undefined && (
              <View testID="stack-dot-active" data-key={activeKey} style={StyleSheet.absoluteFill} pointerEvents="none" />
            )}
          </View>
        )}

        {/* iOS "Edit Stack" button (pencil) — only when the caller wires it. */}
        {onEditStack && (
          <Pressable
            testID={testID ? `${testID}-edit` : 'smart-stack-edit'}
            accessibilityLabel="Edit stack"
            accessibilityRole="button"
            onPress={onEditStack}
            style={styles.editBtn}
            hitSlop={8}
          >
            <Ionicons name="pencil-outline" size={16} color="rgba(255,255,255,0.6)" />
          </Pressable>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
  },
  stackArea: {
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

  // Page dots
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  dotActive: {
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  dotInactive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },

  // Edit button (iOS pencil)
  editBtn: {
    alignSelf: 'center',
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});
