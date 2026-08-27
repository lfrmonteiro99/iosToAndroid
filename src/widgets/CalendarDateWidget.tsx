/**
 * The Calendar widget (#963): today's date, and what is next.
 *
 * Distinct from Up Next, which is a LIST of events on dark glass. This is the
 * card the widget epic's reference image shows — white ground, the weekday in
 * red, the day in a very large numeral — so the home screen answers "what day is
 * it" at a glance instead of only "what is my next meeting".
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { WidgetCard } from './WidgetCard';
import { useWidgetSurface } from './useWidgetSurface';
import type { WidgetOptions, WidgetSize } from './widgetInstances';

/**
 * The subset of `CalendarEventItem` this card reads, with the same field names
 * — two shapes for one provider row is how the messages list ended up looking
 * up conversations under a key nothing stored them by.
 */
export interface CalendarWidgetEvent {
  title: string;
  /** Epoch millis. */
  start: number;
  end?: number;
  allDay?: boolean;
}

/** `SEXTA-FEIRA`, `FRIDAY` — the device's own name for the day, upper-cased. */
export function weekdayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long' }).toUpperCase();
}

/** `09:30 – 10:30`, just the start when there is no end, `All day` when it is. */
export function eventTimeRange(event: CalendarWidgetEvent): string {
  if (event.allDay) return 'All day';
  const fmt = (ms: number) =>
    new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return event.end ? `${fmt(event.start)} – ${fmt(event.end)}` : fmt(event.start);
}

/**
 * The next event that has not ended yet.
 *
 * Ending is the right test, not starting: a meeting you are currently in is
 * still the one you care about, and picking the next STARTING event would drop
 * it the moment it began.
 */
export function nextEvent(
  events: readonly CalendarWidgetEvent[],
  now: number,
): CalendarWidgetEvent | undefined {
  return [...events]
    .filter((e) => e && Number.isFinite(e.start) && (e.end ?? e.start) >= now)
    .sort((a, b) => a.start - b.start)[0];
}

export function CalendarDateWidget({ events = [], size, now, options, onPress }: {
  events?: readonly CalendarWidgetEvent[];
  size?: WidgetSize;
  now?: Date;
  options?: WidgetOptions;
  onPress?: () => void;
}) {
  const { textScale } = useTheme();
  const date = now ?? new Date();
  const { palette, ink } = useWidgetSurface('calendar', options);
  const upcoming = nextEvent(events, date.getTime());

  return (
    <WidgetCard
      testID="widget-card-calendar"
      onPress={onPress}
      appearance={palette?.appearance}
      accessibilityLabel={`Calendar, ${weekdayLabel(date)} ${date.getDate()}`}
    >
      <Text
        style={[styles.weekday, { color: palette?.accent, fontSize: 13 * textScale }]}
        numberOfLines={1}
      >
        {weekdayLabel(date)}
      </Text>
      <Text style={[styles.day, { color: ink.primary, fontSize: 44 * textScale }]}>
        {date.getDate()}
      </Text>
      {size !== 'small' && (
        <View style={styles.eventRow}>
          {upcoming ? (
            <>
              <View style={[styles.eventBar, { backgroundColor: palette?.accent }]} />
              <View style={styles.eventText}>
                <Text
                  style={[styles.eventTitle, { color: ink.primary, fontSize: 13 * textScale }]}
                  numberOfLines={1}
                >
                  {upcoming.title}
                </Text>
                <Text style={[styles.eventTime, { color: ink.secondary, fontSize: 12 * textScale }]}>
                  {eventTimeRange(upcoming)}
                </Text>
              </View>
            </>
          ) : (
            <Text style={[styles.eventTime, { color: ink.secondary, fontSize: 13 * textScale }]}>
              No more events today
            </Text>
          )}
        </View>
      )}
    </WidgetCard>
  );
}

const styles = StyleSheet.create({
  weekday: { fontWeight: '700', letterSpacing: 0.4 },
  day: { fontWeight: '700', marginTop: -4 },
  eventRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
  eventBar: { width: 3, alignSelf: 'stretch', borderRadius: 2, minHeight: 26 },
  eventText: { flex: 1 },
  eventTitle: { fontWeight: '600' },
  eventTime: { fontWeight: '400' },
});
