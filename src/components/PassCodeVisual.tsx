import React from 'react';
import { View, StyleSheet } from 'react-native';

export interface PassCodeVisualProps {
  code: string;
  color?: string;
}

const BAR_COUNT = 24;
const MIN_WIDTH = 2;
const MAX_WIDTH = 10;

// Deterministic decorative code visual: bar widths derive from a hash of
// `code`'s characters (no react-native-svg/QR dependency in this repo — see
// issue #746). Same code -> same widths every time, no Math.random.
function barWidthsFromCode(code: string): number[] {
  const widths: number[] = [];
  let hash = 0;
  for (let i = 0; i < BAR_COUNT; i++) {
    const char = code.length > 0 ? code.charCodeAt(i % code.length) : 32;
    hash = (hash * 31 + char + i) >>> 0;
    widths.push(MIN_WIDTH + (hash % (MAX_WIDTH - MIN_WIDTH + 1)));
  }
  return widths;
}

export function PassCodeVisual({ code, color }: PassCodeVisualProps) {
  const barColor = color ?? '#FFFFFF';
  const widths = barWidthsFromCode(code);

  return (
    <View style={styles.container} accessibilityLabel="Pass code visual" accessible>
      {widths.map((width, index) => (
        <View
          key={index}
          testID={`pass-code-bar-${index}`}
          style={[styles.bar, { width, backgroundColor: barColor }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  bar: {
    height: 40,
    marginHorizontal: 1,
    borderRadius: 1,
  },
});
