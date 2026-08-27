/**
 * The Activity widget (#963): today's steps as a ring, and the week as bars.
 *
 * The data is already in the app — HealthStore keeps today's step count and a
 * persisted daily history — and nothing surfaced it on the home screen. A ring
 * is also the one figure in the widget set that is not a horizontal bar, which
 * is half of why the six existing cards read as the same card.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { WidgetCard } from './WidgetCard';
import { resolveWidgetInk, resolveWidgetPalette } from './widgetPalettes';
import type { WidgetOptions, WidgetSize } from './widgetInstances';

/** The step target the ring closes at. iOS's own default move goal. */
export const DEFAULT_STEP_GOAL = 10_000;

export interface ActivityDay {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  steps: number;
}

/** Progress toward the goal, clamped to 0..1 so the ring cannot overdraw. */
export function ringProgress(steps: number, goal: number = DEFAULT_STEP_GOAL): number {
  if (!Number.isFinite(steps) || steps <= 0) return 0;
  if (!Number.isFinite(goal) || goal <= 0) return 0;
  return Math.min(1, steps / goal);
}

/**
 * The last `count` days, oldest first, with missing days as zero.
 *
 * A gap has to be a zero-height bar rather than an absent one: seven bars that
 * are sometimes six would make the chart's x-axis lie about which day is which.
 */
export function lastDays(
  history: readonly ActivityDay[],
  today: string,
  count = 7,
): ActivityDay[] {
  const byDate = new Map(history.map((d) => [d.date, d.steps]));
  const end = new Date(`${today}T00:00:00`);
  const out: ActivityDay[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, steps: byDate.get(key) ?? 0 });
  }
  return out;
}

function Ring({ size, progress, accent, track }: {
  size: number; progress: number; accent: string; track: string;
}) {
  const r = 38;
  const circumference = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" pointerEvents="none" testID="activity-ring">
      {/* Rotated so the ring starts at 12 o'clock rather than at 3. */}
      <G transform="rotate(-90 50 50)">
        <Circle cx={50} cy={50} r={r} stroke={track} strokeWidth={11} fill="none" />
        <Circle
          cx={50} cy={50} r={r}
          stroke={accent} strokeWidth={11} fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </G>
    </Svg>
  );
}

export function ActivityWidget({ steps, history = [], today, size, goal, options, onPress }: {
  steps: number;
  history?: readonly ActivityDay[];
  /** Local `YYYY-MM-DD`; injected so the bars are deterministic under test. */
  today: string;
  size?: WidgetSize;
  /** Explicit goal, for tests and previews. The user's own choice lives in `options`. */
  goal?: number;
  options?: WidgetOptions;
  onPress?: () => void;
}) {
  const { textScale } = useTheme();
  const palette = resolveWidgetPalette('activity', options);
  const ink = resolveWidgetInk('activity', options);
  // An explicit prop wins (previews, tests), then the user's option, then the
  // default — so a goal the user set is never overridden by a caller that
  // simply did not pass one.
  const activeGoal = goal ?? options?.stepGoal ?? DEFAULT_STEP_GOAL;
  const progress = ringProgress(steps, activeGoal);
  const week = size === 'small' ? [] : lastDays(history, today);
  const peak = Math.max(activeGoal, ...week.map((d) => d.steps));

  return (
    <WidgetCard
      testID="widget-card-activity"
      onPress={onPress}
      appearance={palette?.appearance}
      accessibilityLabel={`Activity, ${steps} steps of ${activeGoal}`}
    >
      <View style={styles.row}>
        <View style={styles.ringSlot}>
          <Ring
            size={size === 'small' ? 72 : 84}
            progress={progress}
            accent={palette?.accent ?? ink.primary}
            track={ink.track}
          />
          <View style={styles.ringCenter} pointerEvents="none">
            <Text style={[styles.steps, { color: ink.primary, fontSize: 15 * textScale }]}>
              {Math.round(progress * 100)}%
            </Text>
          </View>
        </View>
        {size !== 'small' && (
          <View style={styles.weekSlot}>
            <Text style={[styles.title, { color: ink.title, fontSize: 13 * textScale }]}>
              {steps.toLocaleString()} steps
            </Text>
            <View style={styles.bars}>
              {week.map((day) => (
                <View
                  key={day.date}
                  testID={`activity-bar-${day.date}`}
                  style={[
                    styles.bar,
                    {
                      backgroundColor: day.steps > 0 ? palette?.accent : ink.track,
                      // A day with no steps keeps a visible stub, so the bar
                      // reads as "zero" instead of as a missing day.
                      height: Math.max(3, Math.round((day.steps / peak) * 34)),
                    },
                  ]}
                />
              ))}
            </View>
          </View>
        )}
      </View>
    </WidgetCard>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  ringSlot: { alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  steps: { fontWeight: '700' },
  weekSlot: { flex: 1, justifyContent: 'center', gap: 8 },
  title: { fontWeight: '600' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 34 },
  bar: { flex: 1, borderRadius: 2, minWidth: 4 },
});
