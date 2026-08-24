import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  StatusBar,
} from 'react-native';
import { GlassSurface } from '../components';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useFrameCallback,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { dpPerMsToPtPerSec, gestureConfig } from '../utils/gestureConfig';
import { pushSample, sampledVelocity, useVelocityBuffer } from '../utils/gestureVelocity';
import { GestureHaptics } from '../utils/gestureHaptics';

import { useTheme } from '../theme/ThemeContext';
import type { AppNavigationProp } from '../navigation/types';
import { hapticImpact } from '../utils/haptics';
import {
  ALL_WIDGET_TYPES,
  WIDGET_LABELS,
  WIDGET_ICONS,
  useWidgetConfig,
  useWidgetMap,
  type WidgetType,
} from '../components/TodayWidgets';

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(date: Date): string {
  return `${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

// ---------------------------------------------------------------------------
// Edit-mode row for a single widget
// ---------------------------------------------------------------------------

function EditableWidgetRow({
  widgetType,
  isEnabled,
  onToggle,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  widgetType: WidgetType;
  isEnabled: boolean;
  onToggle: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const { textScale } = useTheme();
  return (
    <View style={styles.editRow}>
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        style={styles.editToggleBtn}
        accessibilityLabel={isEnabled ? `Remove ${WIDGET_LABELS[widgetType]}` : `Add ${WIDGET_LABELS[widgetType]}`}
        accessibilityRole="button"
      >
        <Ionicons
          name={isEnabled ? 'remove-circle' : 'add-circle'}
          size={24}
          color={isEnabled ? '#FF453A' : '#30D158'}
        />
      </Pressable>

      <Ionicons name={WIDGET_ICONS[widgetType]} size={20} color="rgba(255,255,255,0.7)" />
      <Text style={[styles.editLabel, { fontSize: 15 * textScale }]}>{WIDGET_LABELS[widgetType]}</Text>

      {isEnabled && (
        <View style={styles.editReorderGroup}>
          <Pressable onPress={onMoveUp} disabled={isFirst} hitSlop={6} style={styles.editArrowBtn} accessibilityLabel={`Move ${WIDGET_LABELS[widgetType]} up`} accessibilityRole="button">
            <Ionicons name="chevron-up" size={20} color={isFirst ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.7)'} />
          </Pressable>
          <Pressable onPress={onMoveDown} disabled={isLast} hitSlop={6} style={styles.editArrowBtn} accessibilityLabel={`Move ${WIDGET_LABELS[widgetType]} down`} accessibilityRole="button">
            <Ionicons name="chevron-down" size={20} color={isLast ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.7)'} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Edit Widgets Panel
// ---------------------------------------------------------------------------

function EditWidgetsPanel({
  enabled,
  onSave,
}: {
  enabled: WidgetType[];
  onSave: (next: WidgetType[]) => void;
}) {
  const { textScale } = useTheme();
  const [draft, setDraft] = useState<WidgetType[]>(enabled);

  const disabled = ALL_WIDGET_TYPES.filter((t) => !draft.includes(t));

  const toggle = (w: WidgetType) => {
    hapticImpact(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (draft.includes(w)) {
      setDraft(draft.filter((t) => t !== w));
    } else {
      setDraft([...draft, w]);
    }
  };

  const moveUp = (idx: number) => {
    if (idx <= 0) return;
    hapticImpact(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = [...draft];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setDraft(next);
  };

  const moveDown = (idx: number) => {
    if (idx >= draft.length - 1) return;
    hapticImpact(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = [...draft];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setDraft(next);
  };

  return (
    <View style={styles.editPanel}>
      <Text style={[styles.editSectionHeader, { fontSize: 12 * textScale }]}>Enabled Widgets</Text>
      {draft.map((w, i) => (
        <EditableWidgetRow
          key={w}
          widgetType={w}
          isEnabled
          onToggle={() => toggle(w)}
          onMoveUp={() => moveUp(i)}
          onMoveDown={() => moveDown(i)}
          isFirst={i === 0}
          isLast={i === draft.length - 1}
        />
      ))}
      {draft.length === 0 && (
        <Text style={[styles.editEmptyText, { fontSize: 14 * textScale }]}>No widgets enabled</Text>
      )}

      {disabled.length > 0 && (
        <>
          <Text style={[styles.editSectionHeader, { marginTop: 18, fontSize: 12 * textScale }]}>Available Widgets</Text>
          {disabled.map((w) => (
            <EditableWidgetRow
              key={w}
              widgetType={w}
              isEnabled={false}
              onToggle={() => toggle(w)}
            />
          ))}
        </>
      )}

      <View style={styles.editButtonRow}>
        <Pressable style={styles.editDoneBtn} onPress={() => onSave(draft)} accessibilityLabel="Done" accessibilityRole="button">
          <Text style={[styles.editDoneBtnText, { fontSize: 16 * textScale }]}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export function TodayViewScreen({ navigation }: { navigation: AppNavigationProp }) {
  const insets = useSafeAreaInsets();
  const { textScale } = useTheme();

  const today = useMemo(() => formatDate(new Date()), []);

  // Widget configuration
  const { enabled, setEnabled, loaded } = useWidgetConfig();
  const [editMode, setEditMode] = useState(false);

  const handleSaveEdit = useCallback(
    (next: WidgetType[]) => {
      setEnabled(next);
      setEditMode(false);
    },
    [setEnabled],
  );

  // Map of widget type -> rendered JSX — shared with LauncherHomeScreen (#654)
  // so both surfaces render the same widget instances off the same config.
  const widgetMap = useWidgetMap();

  // Swipe-left gesture to dismiss
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  // Frame-callback timestamp for velocity sampling
  const todayCurrentT = useSharedValue(0);
  useFrameCallback(({ timestamp }) => {
    'worklet';
    todayCurrentT.value = timestamp;
  });

  // Multi-sample velocity buffer
  const todayBuf = useVelocityBuffer();

  const handleClose = () => navigation.goBack();

  const swipeLeftGesture = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      todayBuf.value = [];
    })
    .onUpdate((e) => {
      'worklet';
      if (e.translationX < 0) {
        translateX.value = e.translationX;
        opacity.value = Math.max(0, 1 + e.translationX / 300);
        pushSample(todayBuf.value, e.translationX, e.translationY, todayCurrentT.value);
      }
    })
    .onEnd((e) => {
      'worklet';
      pushSample(todayBuf.value, e.translationX, e.translationY, todayCurrentT.value);
      const { vx } = sampledVelocity(todayBuf.value, todayCurrentT.value);
      const absX = Math.abs(e.translationX);
      const absVx = Math.abs(vx);
      const shouldCommit =
        absX >= gestureConfig.quickSwitchDistanceDp ||
        absVx >= gestureConfig.quickSwitchVelocity ||
        (absX >= gestureConfig.quickSwitchHybridDistanceDp &&
          absVx >= gestureConfig.quickSwitchHybridVelocity);

      // translateX is a literal dp offset — vx is already dp/ms, convert to dp/sec.
      const translateXVelocity = dpPerMsToPtPerSec(vx);

      if (shouldCommit && e.translationX < 0) {
        runOnJS(GestureHaptics.commit)('light');
        translateX.value = withSpring(-400, { ...gestureConfig.spring.mediumSettle, velocity: translateXVelocity });
        opacity.value = withTiming(0, { duration: 250 }, () => runOnJS(handleClose)());
      } else {
        translateX.value = withSpring(0, { ...gestureConfig.spring.fastSettle, velocity: translateXVelocity });
        opacity.value = withTiming(1, { duration: 200 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Full-screen dark backdrop — tap to dismiss */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} accessibilityLabel="Dismiss" accessibilityRole="button" />

      <GestureDetector gesture={swipeLeftGesture}>
        <Animated.View style={[styles.panel, sheetStyle]}>
          {/* Translucent blur background */}
          <GlassSurface intensity={70} tint="dark" style={StyleSheet.absoluteFill} />

          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Date header */}
            <Text style={[styles.dateText, { fontSize: 28 * textScale }]}>{today}</Text>

            {/* Widgets — rendered in configured order */}
            {editMode ? (
              <EditWidgetsPanel
                enabled={enabled}
                onSave={handleSaveEdit}
              />
            ) : (
              <>
                {loaded && enabled.map((type) => widgetMap[type])}

                {/* Edit button */}
                <Pressable
                  style={styles.editOpenBtn}
                  onPress={() => setEditMode(true)}
                  accessibilityLabel="Edit Widgets"
                  accessibilityRole="button"
                >
                  <Ionicons name="pencil-outline" size={16} color="rgba(255,255,255,0.6)" />
                  <Text style={[styles.editOpenBtnText, { fontSize: 14 * textScale }]}>Edit Widgets</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  panel: {
    flex: 1,
    overflow: 'hidden',
  },
  scrollContent: {
    paddingHorizontal: 16,
  },

  // Date header
  dateText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 20,
  },

  // Edit button (bottom of widget list)
  editOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginTop: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  editOpenBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '500',
  },

  // Edit panel
  editPanel: {
    marginBottom: 8,
  },
  editSectionHeader: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  editToggleBtn: {
    width: 28,
    alignItems: 'center',
  },
  editLabel: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
  editReorderGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  editArrowBtn: {
    padding: 4,
  },
  editEmptyText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    paddingVertical: 16,
  },
  editButtonRow: {
    marginTop: 18,
    alignItems: 'center',
  },
  editDoneBtn: {
    backgroundColor: 'rgba(10,132,255,0.9)',
    paddingHorizontal: 48,
    paddingVertical: 12,
    borderRadius: 14,
  },
  editDoneBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
