/**
 * Vector shapes for the built-in app icons.
 *
 * Why this exists next to primitives.tsx: the View-composed primitives can draw
 * anything made of discs, pills and rotated bars, and for keypads, note lines
 * and index tabs that is exactly right. What they cannot draw is a CURVE that is
 * not a circle — and several stock icons are nothing but such curves: Health's
 * heart has a cusp at the top and a point at the bottom, the Weather cloud has a
 * scalloped top over a single rounded body, the Music note's heads are slanted
 * ellipses under a curved beam. Composed from discs and bars they come out as
 * recognisable-but-wrong lumps, which is what "the icon artwork still isn't
 * good" was about.
 *
 * Apple's own guidance is to use vectors: "Prefer vector graphics when bringing
 * layers into Icon Composer. Unlike raster images, vector graphics (such as SVG
 * or PDF) scale gracefully and appear crisp at any size", and "avoid extremely
 * thin line weights and sharp corners, because they tend to lose detail and
 * crispness in smaller icon sizes" — Human Interface Guidelines, App icons.
 *
 * Coordinates are a 0..100 box (VIEWBOX below), so a shape is defined once and
 * renders at every icon size the launcher uses, like the fraction-based
 * primitives beside them.
 */
import React from 'react';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from 'react-native-svg';

/** Every shape below is authored in a 100×100 box. */
export const VIEWBOX = '0 0 100 100';

export interface VectorProps {
  /** Tile side in dp. */
  size: number;
  testID?: string;
}

/**
 * An overlay sized to the tile, in which the shapes below are drawn.
 *
 * `pointerEvents="none"` because the icon's press target is the tile, not the
 * artwork — an Svg swallowing touches would make the app unlaunchable.
 */
export function IconVector({
  size,
  children,
  testID,
}: VectorProps & { children: React.ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={VIEWBOX}
      style={{ position: 'absolute', left: 0, top: 0 }}
      pointerEvents="none"
      testID={testID}
    >
      {children}
    </Svg>
  );
}

/**
 * A vertical two-stop gradient, addressable by `id`.
 *
 * The id only has to be unique WITHIN its own Svg: react-native-svg keeps one
 * brush registry per SvgView (`mDefinedBrushes`), so the same id in two icons
 * on screen resolves to each one's own gradient.
 */
export function VerticalGradient({
  id,
  from,
  to,
}: {
  id: string;
  from: string;
  to: string;
}) {
  return (
    <Defs>
      <SvgLinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={from} />
        <Stop offset="1" stopColor={to} />
      </SvgLinearGradient>
    </Defs>
  );
}

/**
 * The Health heart.
 *
 * Two symmetric cubics from the bottom point up to the cusp: the sides swell
 * outwards above the midline and fall almost straight to the tip, which is what
 * makes it read as a heart rather than as a diamond with two bumps (the
 * rotated-square-plus-two-discs construction it replaces).
 */
export const HEART_PATH =
  'M50 86 C50 86 12 61 12 38 C12 24 22.5 14 34.5 14 C42 14 47 18.5 50 24 '
  + 'C53 18.5 58 14 65.5 14 C77.5 14 88 24 88 38 C88 61 50 86 50 86 Z';

export function Heart({ size, from, to, testID }: VectorProps & { from: string; to: string }) {
  const id = 'heart-fill';
  return (
    <IconVector size={size} testID={testID}>
      <VerticalGradient id={id} from={from} to={to} />
      <Path d={HEART_PATH} fill={`url(#${id})`} />
    </IconVector>
  );
}

/**
 * The Weather sun-behind-cloud.
 *
 * The cloud is ONE path — a scalloped top over a flat-ish bottom — instead of
 * three discs on a bar, whose outline crossed itself at every join and gave the
 * silhouette visible notches at small sizes. The rays are round-capped lines,
 * per the HIG's warning about sharp corners at icon sizes.
 */
export const CLOUD_PATH =
  'M31 78 C19.5 78 10 69.5 10 59 C10 49.5 17 41.5 26.5 40.2 '
  + 'C29 30 38 22.5 48.5 22.5 C58 22.5 66.5 28.5 70 37 '
  + 'C71.5 36.5 73 36.3 74.5 36.3 C85 36.3 93.5 44.5 93.5 55 '
  + 'C93.5 68 84 78 71 78 Z';

export function SunBehindCloud({ size, testID }: VectorProps) {
  const rays = [0, 45, 90, 135];
  return (
    <IconVector size={size} testID={testID}>
      <G>
        {rays.map((a) => (
          <Line
            key={a}
            x1={38 - 30}
            y1={35}
            x2={38 + 30}
            y2={35}
            stroke="#FFD426"
            strokeWidth={6}
            strokeLinecap="round"
            transform={`rotate(${a} 38 35)`}
          />
        ))}
        <Circle cx={38} cy={35} r={15} fill="#FFD426" />
        <Path d={CLOUD_PATH} fill="#FFFFFF" />
      </G>
    </IconVector>
  );
}

/**
 * The Music double eighth note.
 *
 * Heads are slanted ellipses (the real note's are, and a circle reads as a
 * lollipop), stems are round-capped lines, and the beam is a filled path that
 * curves — three bars and two discs could not do any of the three.
 */
export function DoubleNote({ size, color = '#FFFFFF', testID }: VectorProps & { color?: string }) {
  return (
    <IconVector size={size} testID={testID}>
      <G>
        {/* Beam: thicker at the left where it leaves the near stem. */}
        <Path
          d="M40 30 C55 24 70 21 82 20 L82 33 C70 34 55 37 40 43 Z"
          fill={color}
        />
        <Line x1={41} y1={34} x2={41} y2={66} stroke={color} strokeWidth={6} strokeLinecap="round" />
        <Line x1={81} y1={24} x2={81} y2={58} stroke={color} strokeWidth={6} strokeLinecap="round" />
        <Ellipse cx={31} cy={69} rx={13} ry={10} fill={color} transform="rotate(-18 31 69)" />
        <Ellipse cx={71} cy={61} rx={13} ry={10} fill={color} transform="rotate(-18 71 61)" />
      </G>
    </IconVector>
  );
}

/**
 * The App Store "A": three round-capped strokes that cross past one another.
 *
 * As Views this was three pills whose ends met at mitred corners; a stroke with
 * `strokeLinecap="round"` is the shape the real mark actually has.
 */
export function AppStoreMark({ size, testID }: VectorProps) {
  return (
    <IconVector size={size} testID={testID}>
      <G stroke="#FFFFFF" strokeWidth={8.5} strokeLinecap="round">
        <Line x1={29.5} y1={77.5} x2={53.4} y2={30.8} />
        <Line x1={70.5} y1={77.5} x2={46.6} y2={30.8} />
        <Line x1={30.5} y1={60} x2={69.5} y2={60} />
      </G>
    </IconVector>
  );
}

/**
 * Safari's compass needle: two tapered blades meeting at the centre.
 *
 * Each blade is a quadrilateral that is widest at the hub and comes to a point,
 * so the pair reads as one needle. The View version built each blade from a
 * zero-size box with borders, which could not taper both edges symmetrically.
 */
export function CompassNeedle({
  size,
  colorNE = '#FF3B30',
  colorSW = '#FFFFFF',
  testID,
}: VectorProps & { colorNE?: string; colorSW?: string }) {
  // A blade pointing north-east from the hub, then mirrored by rotation.
  const blade = 'M50 50 L42.5 42.5 L78 22 Z';
  return (
    <IconVector size={size} testID={testID}>
      <G>
        <Path d={blade} fill={colorNE} />
        <Path d={blade} fill={colorNE} transform="rotate(90 50 50)" />
        <Path d={blade} fill={colorSW} transform="rotate(180 50 50)" />
        <Path d={blade} fill={colorSW} transform="rotate(270 50 50)" />
      </G>
    </IconVector>
  );
}

/**
 * One Photos petal: a lens (two arcs meeting at points), repeated around the
 * centre. Pills could only give rounded lobes, which is why the flower read as
 * a starburst.
 */
export const PETAL_PATH = 'M50 50 C58 38 58 24 50 12 C42 24 42 38 50 50 Z';

export function PhotosFlower({
  size,
  petals,
  testID,
}: VectorProps & { petals: readonly string[] }) {
  const step = 360 / petals.length;
  return (
    <IconVector size={size} testID={testID}>
      <G>
        {petals.map((color, i) => (
          <Path
            key={color}
            d={PETAL_PATH}
            fill={color}
            opacity={0.85}
            transform={`rotate(${i * step} 50 50)`}
          />
        ))}
      </G>
    </IconVector>
  );
}

/**
 * The Messages bubble.
 *
 * One path: the body and the tail are the same outline, so the tail grows out of
 * the bubble instead of being a rotated square parked underneath it — which is
 * visible at grid size as a notch where the two shapes meet.
 */
export const BUBBLE_PATH =
  'M50 20 C71 20 88 32 88 47.5 C88 63 71 75 50 75 C44 75 38.5 74.2 33.5 72.3 '
  + 'C29 76.5 22 80.5 14 81.5 C18.5 76.5 21 71.5 21.5 66.5 '
  + 'C15.5 61.5 12 55 12 47.5 C12 32 29 20 50 20 Z';

export function SpeechBubble({ size, color = '#FFFFFF', testID }: VectorProps & { color?: string }) {
  return (
    <IconVector size={size} testID={testID}>
      <Path d={BUBBLE_PATH} fill={color} />
    </IconVector>
  );
}

/**
 * The Podcasts mark: a mic over two radiating arcs.
 *
 * The arcs are the reason this needs a vector. An arc is not expressible as a
 * positioned View, so the icon was two translucent DISCS behind a disc and a
 * bar — which reads as a lollipop on a pale blob, not as a microphone.
 */
export const MIC_BODY_PATH =
  'M39 56 L61 56 L57 84 C57 87.2 54 89.5 50 89.5 C46 89.5 43 87.2 43 84 Z';

export function PodcastsMark({ size, color = '#FFFFFF', testID }: VectorProps & { color?: string }) {
  return (
    <IconVector size={size} testID={testID}>
      <G>
        <Path
          d="M8.7 35 A44 44 0 0 1 91.3 35"
          stroke={color}
          strokeOpacity={0.35}
          strokeWidth={7}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M19 38.7 A33 33 0 0 1 81 38.7"
          stroke={color}
          strokeOpacity={0.55}
          strokeWidth={7}
          strokeLinecap="round"
          fill="none"
        />
        <Circle cx={50} cy={40} r={11.5} fill={color} />
        <Path d={MIC_BODY_PATH} fill={color} />
      </G>
    </IconVector>
  );
}
