/**
 * Drawing primitives for the built-in app icons.
 *
 * Why Views and not SVG: this repo has no `react-native-svg` (see the note in
 * PassCodeVisual.tsx, which draws its own bars for the same reason), and adding
 * a native library to draw icons would mean a new prebuild for a purely visual
 * change. Every shape real iOS stock icons are made of — discs, rings, rounded
 * bars, gradient grounds, rotated strokes — is expressible as a positioned View,
 * so the artwork below is built from these six helpers instead.
 *
 * Everything is expressed as a FRACTION of the tile side, never in absolute dp,
 * so one definition renders correctly at every icon size the launcher uses
 * (the grid scales icons with `gridColumns` and the icon-size setting).
 */
import React from 'react';
import { View, Text, StyleSheet, type ViewStyle, type TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/** Props every artwork component receives. `size` is the tile side in dp. */
export interface ArtworkProps {
  size: number;
}

/** Solid or gradient fill covering the whole tile — the icon's "paper". */
export function Ground({
  color,
  gradient,
  start,
  end,
}: Partial<ArtworkProps> & {
  color?: string;
  gradient?: readonly [string, string, ...string[]];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}) {
  if (gradient) {
    return (
      <LinearGradient
        colors={gradient}
        start={start ?? { x: 0.5, y: 0 }}
        end={end ?? { x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    );
  }
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: color ?? '#FFFFFF' }]} />;
}

/**
 * A filled disc. `cx`/`cy`/`d` are fractions of the tile side: `d` is the
 * DIAMETER, and the centre is placed at (cx, cy) so callers position by the
 * middle of the shape the way the reference artwork is laid out.
 */
export function Disc({
  size,
  cx,
  cy,
  d,
  color,
  opacity,
  style,
}: ArtworkProps & {
  cx: number;
  cy: number;
  d: number;
  color: string;
  opacity?: number;
  style?: ViewStyle;
}) {
  const side = size * d;
  return (
    <View
      style={[
        {
          position: 'absolute',
          left: size * cx - side / 2,
          top: size * cy - side / 2,
          width: side,
          height: side,
          borderRadius: side / 2,
          backgroundColor: color,
          opacity,
        },
        style,
      ]}
    />
  );
}

/**
 * A rounded bar. Used for everything rectangular: calculator keys, note lines,
 * card layers, clock hands (with `rotate`), the Shortcuts squares.
 *
 * `x`/`y` are the TOP-LEFT corner, unlike Disc/Ring which take a centre —
 * rectangles in the reference artwork are laid out from their corner.
 */
export function Bar({
  size,
  x,
  y,
  w,
  h,
  color,
  radius,
  rotate,
  opacity,
  style,
}: ArtworkProps & {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  /** Corner radius as a fraction of the tile side. Defaults to a pill (h/2). */
  radius?: number;
  /** Degrees, rotated about the bar's own centre. */
  rotate?: number;
  opacity?: number;
  style?: ViewStyle;
}) {
  const width = size * w;
  const height = size * h;
  return (
    <View
      style={[
        {
          position: 'absolute',
          left: size * x,
          top: size * y,
          width,
          height,
          borderRadius: radius != null ? size * radius : height / 2,
          backgroundColor: color,
          opacity,
          transform: rotate ? [{ rotate: `${rotate}deg` }] : undefined,
        },
        style,
      ]}
    />
  );
}

/**
 * A hand pinned at one end — clock hands, the Safari needle. Rotation is about
 * the PIVOT (cx, cy) rather than the bar's centre, which is what makes a hand
 * sweep from the dial's middle instead of drifting off it.
 */
export function Hand({
  size,
  cx,
  cy,
  length,
  thickness,
  angle,
  color,
  radius,
}: ArtworkProps & {
  cx: number;
  cy: number;
  /** Fraction of the tile side, measured from the pivot outwards. */
  length: number;
  thickness: number;
  /** Degrees clockwise from 12 o'clock. */
  angle: number;
  color: string;
  radius?: number;
}) {
  const w = size * thickness;
  const h = size * length;
  return (
    <View
      style={{
        position: 'absolute',
        left: size * cx - w / 2,
        top: size * cy - h,
        width: w,
        height: h,
        transform: [
          // Move the rotation origin to the pivot (bottom-centre of the bar),
          // rotate, then move back — RN rotates about the view's centre.
          { translateY: h / 2 },
          { rotate: `${angle}deg` },
          { translateY: -h / 2 },
        ],
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: radius != null ? size * radius : w / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** Text baked into an icon — the Calendar weekday/date, calculator glyphs. */
export function Glyph({
  size,
  x,
  y,
  w,
  text,
  color,
  fontSize,
  weight,
  style,
}: ArtworkProps & {
  x: number;
  y: number;
  w: number;
  text: string;
  color: string;
  /** Fraction of the tile side. */
  fontSize: number;
  weight?: TextStyle['fontWeight'];
  style?: TextStyle;
}) {
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={1}
      style={[
        {
          position: 'absolute',
          left: size * x,
          top: size * y,
          width: size * w,
          textAlign: 'center',
          color,
          fontSize: size * fontSize,
          lineHeight: size * fontSize * 1.08,
          fontWeight: weight ?? '600',
        },
        style,
      ]}
    >
      {text}
    </Text>
  );
}

/**
 * Places a glyph on a circle — the Clock dial's 1..12. `angle` is degrees
 * clockwise from 12 o'clock and `r` the radius as a fraction of the tile, so
 * the numerals sit on the dial instead of being hand-positioned one by one.
 */
export function PolarGlyph({
  size,
  cx,
  cy,
  r,
  angle,
  text,
  color,
  fontSize,
  weight,
}: ArtworkProps & {
  cx: number;
  cy: number;
  r: number;
  angle: number;
  text: string;
  color: string;
  fontSize: number;
  weight?: TextStyle['fontWeight'];
}) {
  const rad = ((angle - 90) * Math.PI) / 180;
  const box = fontSize * 1.6;
  return (
    <Glyph
      size={size}
      x={cx + r * Math.cos(rad) - box / 2}
      y={cy + r * Math.sin(rad) - (fontSize * 1.08) / 2}
      w={box}
      text={text}
      color={color}
      fontSize={fontSize}
      weight={weight}
    />
  );
}
