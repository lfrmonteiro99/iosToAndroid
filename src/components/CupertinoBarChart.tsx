import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { CupertinoEmptyState } from './CupertinoEmptyState';

export interface BarChartDatum {
  label: string;
  value: number;
}

interface CupertinoBarChartProps {
  data: BarChartDatum[];
  /** Total chart height in density-independent pixels. Default 160. */
  height?: number;
  /** Bar fill. Defaults to the theme accent (systemBlue). */
  barColor?: string;
  /** Formats the value shown above each bar and (optionally) on the axis. */
  valueFormatter?: (value: number) => string;
}

const MIN_BAR_HEIGHT = 2;

function defaultFormat(value: number): string {
  return String(value);
}

export function CupertinoBarChart({
  data,
  height = 160,
  barColor,
  valueFormatter = defaultFormat,
}: CupertinoBarChartProps): React.ReactElement {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const fill = barColor ?? colors.systemBlue;

  if (!data || data.length === 0) {
    return (
      <CupertinoEmptyState
        icon="bar-chart"
        title="No data yet"
        message="Step history will appear here once a few days have been recorded."
      />
    );
  }

  // Negative values are meaningless for a step count; clamp to 0 so a bad
  // sample can never move the scaling math into negative heights.
  const safeValues = data.map((d) => (Number.isFinite(d.value) && d.value > 0 ? d.value : 0));
  const maxValue = Math.max(...safeValues, 0);

  return (
    <View style={[styles.container, { height, padding: spacing.sm }]} accessibilityRole="image">
      <View style={styles.plot}>
        {data.map((d, i) => {
          const safe = safeValues[i];
          // When every value is 0 there is nothing to scale against; render a
          // minimal sliver rather than dividing by zero (which would be NaN).
          const ratio = maxValue > 0 ? safe / maxValue : 0;
          const barHeight = Math.max(MIN_BAR_HEIGHT, Math.round(ratio * (height - spacing.sm * 2)));
          return (
            <View key={`${d.label}-${i}`} style={[styles.column, { flex: 1 }]}>
              <View style={styles.columnTop}>
                <Text
                  style={[typography.caption2, { color: colors.secondaryLabel }]}
                  numberOfLines={1}
                  accessibilityLabel={`${d.label}: ${valueFormatter(d.value)}`}
                >
                  {valueFormatter(d.value)}
                </Text>
              </View>
              <View style={styles.barTrack}>
                <View
                  testID={`bar-${i}`}
                  style={[styles.bar, { height: barHeight, backgroundColor: fill }]}
                  accessibilityLabel={`${d.label} ${valueFormatter(d.value)}`}
                />
              </View>
              <Text
                style={[typography.caption2, { color: colors.secondaryLabel, marginTop: spacing.xs }]}
                numberOfLines={1}
              >
                {d.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    justifyContent: 'center',
  },
  plot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  column: {
    alignItems: 'center',
  },
  columnTop: {
    width: '100%',
    alignItems: 'center',
  },
  barTrack: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  bar: {
    width: '70%',
    minHeight: MIN_BAR_HEIGHT,
    borderRadius: 4,
  },
});
