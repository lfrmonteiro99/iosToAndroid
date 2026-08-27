/**
 * The ring gauge — iOS's figure for "one proportion" (#965).
 *
 * Why it belongs to every widget and not just Activity: the stock Batteries
 * widget is rings, the Fitness widget is rings, and the small size of both shows
 * the ring INSTEAD of a number. Apple's own guidance is the reason: "Small
 * widgets use their limited space to typically show a single piece of
 * information while larger sizes support additional layers of information"
 * (Human Interface Guidelines, Widgets). A small card with a glyph, a title, a
 * 36-point number, a progress bar and a caption is five pieces.
 *
 * Extracted from ActivityWidget, which drew its own.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

export interface WidgetRingProps {
  /** Side in dp. */
  size: number;
  /** 0..1. Clamped, so a value over the goal cannot overdraw the ring. */
  progress: number;
  color: string;
  trackColor: string;
  /** Ring thickness as a fraction of the side. iOS's rings are thick. */
  thickness?: number;
  /** Centred content — a percentage, a glyph, a duration. */
  children?: React.ReactNode;
  testID?: string;
}

/** 0..1, with every non-finite or negative input reading as empty. */
export function clampProgress(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(1, value);
}

export function WidgetRing({
  size,
  progress,
  color,
  trackColor,
  thickness = 0.11,
  children,
  testID = 'widget-ring',
}: WidgetRingProps) {
  const stroke = 100 * thickness;
  // Radius in the 0..100 viewBox, inset by half the stroke so the ring's outer
  // edge lands on the box rather than being clipped by it.
  const r = 50 - stroke / 2;
  const circumference = 2 * Math.PI * r;
  const filled = clampProgress(progress);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" pointerEvents="none" testID={testID}>
        {/* Rotated so the ring starts at 12 o'clock rather than at 3. */}
        <G transform="rotate(-90 50 50)">
          <Circle cx={50} cy={50} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
          <Circle
            cx={50} cy={50} r={r}
            stroke={color} strokeWidth={stroke} fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - filled)}
          />
        </G>
      </Svg>
      {children != null && (
        <View style={styles.center} pointerEvents="none">{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
