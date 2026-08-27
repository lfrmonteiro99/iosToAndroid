/**
 * The Clock widget (#963): a live analogue face.
 *
 * Why analogue and not another big number: the widget set was six cards each
 * showing a glyph, a number and a bar. Variety is not six more numbers — it is
 * a widget whose CONTENT MOVES, and a second hand sweeping is the cheapest
 * honest movement on a home screen. The face is drawn as a vector (paths and
 * lines) rather than composed from Views, so the hands can taper and the ticks
 * can be hairlines at any card size.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { WidgetCard } from './WidgetCard';
import { widgetInk, widgetPalette } from './widgetPalettes';
import type { WidgetSize } from './widgetInstances';

/** How often the hands move. One second, so the sweep is a sweep. */
export const CLOCK_TICK_MS = 1000;

export interface ClockHandAngles {
  hour: number;
  minute: number;
  second: number;
}

/**
 * Hand angles in degrees clockwise from 12.
 *
 * The hour hand moves CONTINUOUSLY with the minutes (at 6:30 it sits halfway
 * between 6 and 7); a face that jumps it hour to hour reads as broken. Pure, so
 * this is the part that gets asserted rather than a rendered rotation.
 */
export function clockHandAngles(date: Date): ClockHandAngles {
  const seconds = date.getSeconds();
  const minutes = date.getMinutes() + seconds / 60;
  const hours = (date.getHours() % 12) + minutes / 60;
  return {
    hour: hours * 30,
    minute: minutes * 6,
    second: seconds * 6,
  };
}

/** Twelve hour marks; the four cardinals are heavier, as on the real face. */
const TICKS = Array.from({ length: 12 }, (_, i) => i * 30);

export function ClockFace({ size, angles, accent, ink }: {
  size: number;
  angles: ClockHandAngles;
  accent: string;
  ink: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" pointerEvents="none" testID="clock-face">
      <G>
        {TICKS.map((a) => (
          <Line
            key={a}
            x1={50}
            y1={a % 90 === 0 ? 8 : 10}
            x2={50}
            y2={a % 90 === 0 ? 17 : 15}
            stroke={ink}
            strokeOpacity={a % 90 === 0 ? 0.9 : 0.45}
            strokeWidth={a % 90 === 0 ? 3 : 2}
            strokeLinecap="round"
            transform={`rotate(${a} 50 50)`}
          />
        ))}
        <Line
          x1={50} y1={50} x2={50} y2={26}
          stroke={ink} strokeWidth={5.5} strokeLinecap="round"
          transform={`rotate(${angles.hour} 50 50)`}
        />
        <Line
          x1={50} y1={50} x2={50} y2={16}
          stroke={ink} strokeWidth={3.5} strokeLinecap="round"
          transform={`rotate(${angles.minute} 50 50)`}
        />
        <Line
          x1={50} y1={57} x2={50} y2={14}
          stroke={accent} strokeWidth={1.6} strokeLinecap="round"
          transform={`rotate(${angles.second} 50 50)`}
        />
        <Circle cx={50} cy={50} r={2.6} fill={accent} />
      </G>
    </Svg>
  );
}

/**
 * @param now Injected only by tests and by the gallery preview, which needs a
 * fixed time to stay comparable between snapshots. Live when omitted.
 */
export function ClockWidget({ size, now, onPress }: {
  size?: WidgetSize;
  now?: Date;
  onPress?: () => void;
}) {
  const { textScale } = useTheme();
  const [tick, setTick] = useState(() => now ?? new Date());

  useEffect(() => {
    if (now) return; // A fixed time never needs a timer.
    const id = setInterval(() => setTick(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, [now]);

  const date = now ?? tick;
  const angles = useMemo(() => clockHandAngles(date), [date]);
  const palette = widgetPalette('clock');
  const ink = widgetInk('clock');
  const label = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <WidgetCard
      testID="widget-card-clock"
      onPress={onPress}
      appearance={palette?.appearance}
      accessibilityLabel={`Clock, ${label}`}
    >
      <View style={styles.body}>
        <ClockFace
          size={size === 'small' ? 64 : 84}
          angles={angles}
          accent={palette?.accent ?? ink.primary}
          ink={ink.primary}
        />
        {size !== 'small' && (
          <Text style={[styles.time, { color: ink.primary, fontSize: 22 * textScale }]}>
            {label}
          </Text>
        )}
      </View>
    </WidgetCard>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  time: { fontWeight: '600', fontVariant: ['tabular-nums'] },
});
