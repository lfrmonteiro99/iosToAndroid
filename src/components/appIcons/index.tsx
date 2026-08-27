/**
 * Artwork for the launcher's built-in app icons.
 *
 * The problem this replaces: every built-in icon was one Ionicons glyph centred
 * on a two-stop gradient. That is not what iOS stock icons look like — most of
 * them are not a glyph on a coloured tile at all. Clock, Photos, Calculator,
 * Calendar, Notes, Reminders, Contacts, Wallet and Health all sit on a WHITE or
 * near-black ground and are built from composed shapes; drawing them as a white
 * pictogram on a coloured square gets the colour, the ground and the silhouette
 * all wrong at once.
 *
 * Each entry below reproduces the composition of the real icon from the shapes
 * it is actually made of, sized as fractions of the tile so it holds at every
 * icon size. Only the icons whose real design IS a white glyph on a colour
 * (Phone, Mail, FaceTime) keep a glyph, and they get iOS's colours rather than
 * the system palette's flat greens and blues.
 *
 * The old gloss sheen is deliberately not drawn over artwork: the glassy
 * highlight is an iOS 6 trait, and iOS has been flat since iOS 7.
 *
 * Registry, not a switch: `APP_ICON_ARTWORK[packageName]` is consulted by
 * SystemAppIcon, which still owns the squircle, the shadow and Tinted mode. An
 * app with no entry keeps the glyph treatment, so this is additive.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  AppStoreMark,
  CompassNeedle,
  DoubleNote,
  Heart,
  PhotosFlower,
  PodcastsMark,
  SpeechBubble,
  SunBehindCloud,
} from './svgShapes';
import {
  Ground,
  Disc,
  GradientDisc,
  Bar,
  Hand,
  Stroke,
  Glyph,
  PolarGlyph,
  type ArtworkProps,
} from './primitives';

// ─── Shared colours, taken from the real icons rather than the UI palette ────
// The system palette (colors.systemGreen etc.) is tuned for CONTROLS on a
// background; the icons use their own, deeper gradients.
const IOS = {
  phoneTop: '#6DE07A',
  phoneBottom: '#12B33F',
  mailTop: '#3DA2FF',
  mailBottom: '#0B62E0',
  weatherTop: '#3AA0F5',
  weatherBottom: '#1861C4',
  cameraTop: '#4A4A4C',
  cameraBottom: '#1C1C1E',
  settingsTop: '#B4B7BD',
  settingsBottom: '#75787E',
  paper: '#FFFFFF',
  ruleLine: '#D8D8DC',
  calcBody: '#1C1C1E',
  calcKey: '#5A5A5E',
  calcTopKey: '#8E8E93',
  calcAccent: '#FF9F0A',
  red: '#FF3B30',
  heartTop: '#FF4E6B',
  heartBottom: '#F52D4E',
} as const;

/** A white pictogram on a colour — the handful of icons that really are that. */
function GlyphOnGradient({
  size,
  gradient,
  icon,
  scale = 0.56,
  nudgeY = 0,
  rotate,
}: ArtworkProps & {
  gradient: readonly [string, string];
  icon: keyof typeof Ionicons.glyphMap;
  scale?: number;
  nudgeY?: number;
  rotate?: number;
}) {
  return (
    <>
      <Ground size={size} gradient={gradient} />
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Ionicons
          name={icon}
          size={Math.round(size * scale)}
          color="#FFFFFF"
          style={{
            marginTop: size * nudgeY,
            transform: rotate ? [{ rotate: `${rotate}deg` }] : undefined,
          }}
        />
      </View>
    </>
  );
}

// ─── Phone ──────────────────────────────────────────────────────────────────
function PhoneIcon({ size }: ArtworkProps) {
  return (
    <GlyphOnGradient
      size={size}
      gradient={[IOS.phoneTop, IOS.phoneBottom]}
      icon="call"
      scale={0.54}
    />
  );
}

// ─── Messages ───────────────────────────────────────────────────────────────
// A white speech bubble with a tail at the bottom-left, on the same green as
// Phone. Ionicons' bubble is a different silhouette (and its sharp variant has
// no tail), so the bubble is drawn: an oval body plus a rotated square whose
// corner forms the tail.
function MessagesIcon({ size }: ArtworkProps) {
  return (
    <>
      <Ground size={size} gradient={[IOS.phoneTop, IOS.phoneBottom]} />
      {/* Body and tail are one outline, so there is no seam between them. */}
      <SpeechBubble size={size} />
    </>
  );
}

// ─── Mail ───────────────────────────────────────────────────────────────────
function MailIcon({ size }: ArtworkProps) {
  return (
    <GlyphOnGradient
      size={size}
      gradient={[IOS.mailTop, IOS.mailBottom]}
      icon="mail"
      scale={0.52}
    />
  );
}

// ─── FaceTime ───────────────────────────────────────────────────────────────
function FaceTimeIcon({ size }: ArtworkProps) {
  return (
    <GlyphOnGradient
      size={size}
      gradient={[IOS.phoneTop, IOS.phoneBottom]}
      icon="videocam"
      scale={0.54}
    />
  );
}

// ─── Safari / Browser ───────────────────────────────────────────────────────
// White ground, a blue ring, a dial of tick marks, and the two-tone needle
// (red leading half, white trailing half) at the canonical NE/SW angle.
function SafariIcon({ size }: ArtworkProps) {
  // 32 ticks, not 16: the real dial's graduations are fine and dense, and at 16
  // they read as a starburst. Every fourth one (the 8 compass points) is heavier.
  const ticks = Array.from({ length: 32 }, (_, i) => i * (360 / 32));
  return (
    <>
      <Ground size={size} color="#FFFFFF" />
      {/* The rim is a gradient, cyan at the top-left to deep blue at the
          bottom-right, not the flat #0A84FF this used to be. */}
      <GradientDisc size={size} cx={0.5} cy={0.5} d={0.9} gradient={['#31CCFF', '#0A62EF']} />
      <Disc size={size} cx={0.5} cy={0.5} d={0.79} color="#EAF1FA" />
      {ticks.map((a, i) => (
        <Hand
          key={a}
          size={size}
          cx={0.5}
          cy={0.5}
          length={0.395}
          thickness={i % 4 === 0 ? 0.024 : 0.011}
          angle={a}
          color="#9FC4EA"
          radius={0}
        />
      ))}
      <Disc size={size} cx={0.5} cy={0.5} d={0.63} color="#EAF1FA" />
      {/* The needle is two TAPERED halves meeting at the centre — widest where
          they meet, pointed at the tips. Built from two constant-width bars it
          read as a plus sign with one red arm.
          Red points north-east and white south-west, which is the orientation
          on the real icon; this had them the other way round. */}
      {/* One vector needle: four blades that taper symmetrically from the hub,
          so there is no seam to hide and no border trick to keep square. */}
      <CompassNeedle size={size} colorNE={IOS.red} colorSW="#FFFFFF" />
    </>
  );
}

// ─── Photos ─────────────────────────────────────────────────────────────────
// The eight-petal pinwheel on white. Petals are translucent so the overlaps
// blend the way the real icon's do.
const PHOTO_PETALS: readonly string[] = [
  '#FFC107', // yellow
  '#FF9500', // orange
  '#FF3B30', // red
  '#FF2D9B', // magenta
  '#AF52DE', // purple
  '#0A84FF', // blue
  '#32ADE6', // cyan
  '#34C759', // green
];
function PhotosIcon({ size }: ArtworkProps) {
  return (
    <>
      <Ground size={size} color="#FFFFFF" />
      {/* Lens-shaped petals — pointed at both ends, as the real flower's are.
          A pill can only give a rounded lobe. */}
      <PhotosFlower size={size} petals={PHOTO_PETALS} />
    </>
  );
}

// ─── Camera ─────────────────────────────────────────────────────────────────
// A light silver tile with a DARK camera body on it — not a dark tile, which is
// what this was first drawn as and reads as the wrong icon entirely.
function CameraIcon({ size }: ArtworkProps) {
  return (
    <>
      <Ground size={size} gradient={['#F2F2F4', '#C9C9CE']} />
      {/* Body, with the viewfinder bump on its top-left like the real one. */}
      <Bar size={size} x={0.16} y={0.24} w={0.24} h={0.1} color="#48484A" radius={0.03} />
      <Bar size={size} x={0.12} y={0.3} w={0.76} h={0.46} color="#3A3A3C" radius={0.09} />
      {/* Lens: bezel, glass, catch-light. */}
      <Disc size={size} cx={0.5} cy={0.53} d={0.3} color="#1C1C1E" />
      <Disc size={size} cx={0.5} cy={0.53} d={0.22} color="#5A5A5E" />
      <Disc size={size} cx={0.455} cy={0.485} d={0.07} color="#FFFFFF" opacity={0.7} />
      {/* Shutter lamp — the small warm dot at the body's top-right. */}
      <Disc size={size} cx={0.78} cy={0.37} d={0.055} color="#FFD426" />
    </>
  );
}

// ─── Clock ──────────────────────────────────────────────────────────────────
// Black tile, white face, the NUMERALS 1..12 (the real dial is numbered — ticks
// were the first attempt and read as a generic watch face), black hour and
// minute hands and the orange second hand. Posed at 10:09 like Apple's.
const CLOCK_NUMERALS = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
function ClockIcon({ size }: ArtworkProps) {
  return (
    <>
      <Ground size={size} color="#000000" />
      <Disc size={size} cx={0.5} cy={0.5} d={0.88} color="#FFFFFF" />
      {CLOCK_NUMERALS.map((n, i) => (
        <PolarGlyph
          key={n}
          size={size}
          cx={0.5}
          cy={0.5}
          r={0.345}
          angle={i * 30}
          text={n}
          color="#1C1C1E"
          fontSize={0.115}
          weight="500"
        />
      ))}
      <Hand size={size} cx={0.5} cy={0.5} length={0.18} thickness={0.042} angle={-60} color="#000000" />
      <Hand size={size} cx={0.5} cy={0.5} length={0.27} thickness={0.042} angle={54} color="#000000" />
      <Hand size={size} cx={0.5} cy={0.5} length={0.29} thickness={0.02} angle={200} color={IOS.calcAccent} />
      <Disc size={size} cx={0.5} cy={0.5} d={0.05} color={IOS.calcAccent} />
    </>
  );
}

// ─── Calendar ───────────────────────────────────────────────────────────────
// White ground, red weekday in caps, large light date numeral. The date is a
// prop rather than a constant so the icon tracks today, as it does on iOS.
function makeCalendarIcon(weekday: string, day: string) {
  return function CalendarIcon({ size }: ArtworkProps) {
    return (
      <>
        <Ground size={size} color="#FFFFFF" />
        <Glyph
          size={size}
          x={0}
          y={0.1}
          w={1}
          text={weekday}
          color={IOS.red}
          fontSize={0.135}
          weight="600"
          style={{ letterSpacing: size * 0.005 }}
        />
        <Glyph
          size={size}
          x={0}
          y={0.3}
          w={1}
          text={day}
          color="#1C1C1E"
          fontSize={0.46}
          weight="300"
        />
      </>
    );
  };
}

// ─── Weather ────────────────────────────────────────────────────────────────
function WeatherIcon({ size }: ArtworkProps) {
  // The cloud is one path now. Three discs on a bar have a silhouette that
  // crosses itself at every join, and those crossings show as notches along the
  // top edge once the icon is drawn at grid size.
  return (
    <>
      <Ground size={size} gradient={[IOS.weatherTop, IOS.weatherBottom]} />
      <SunBehindCloud size={size} />
    </>
  );
}

// ─── Notes ──────────────────────────────────────────────────────────────────
function NotesIcon({ size }: ArtworkProps) {
  const lines = [0.42, 0.55, 0.68, 0.81];
  return (
    <>
      <Ground size={size} color="#FFFFFF" />
      <Bar size={size} x={0} y={0} w={1} h={0.26} color="#FFD426" radius={0} />
      {lines.map((y, i) => (
        <Bar
          key={y}
          size={size}
          x={0.13}
          y={y}
          w={i === lines.length - 1 ? 0.42 : 0.74}
          h={0.045}
          color={IOS.ruleLine}
        />
      ))}
    </>
  );
}

// ─── Reminders ──────────────────────────────────────────────────────────────
// White ground; four rows, each a coloured dot and a grey rule. The dot colours
// are the list colours iOS ships the icon with.
const REMINDER_ROWS: readonly { y: number; color: string; w: number }[] = [
  { y: 0.235, color: '#FF9500', w: 0.42 },
  { y: 0.4, color: IOS.red, w: 0.5 },
  { y: 0.565, color: '#0A84FF', w: 0.36 },
  { y: 0.73, color: '#8E8E93', w: 0.46 },
];
function RemindersIcon({ size }: ArtworkProps) {
  return (
    <>
      <Ground size={size} color="#FFFFFF" />
      {REMINDER_ROWS.map((row) => (
        <React.Fragment key={row.y}>
          <Disc size={size} cx={0.235} cy={row.y + 0.025} d={0.115} color={row.color} />
          <Bar size={size} x={0.34} y={row.y} w={row.w} h={0.05} color={IOS.ruleLine} />
        </React.Fragment>
      ))}
    </>
  );
}

// ─── Calculator ─────────────────────────────────────────────────────────────
// Near-black body; a 4x5 keypad with the grey function row on top and the
// orange operator column on the right, which is what makes the icon readable
// at grid size.
function CalculatorIcon({ size }: ArtworkProps) {
  // The keypad fills the tile on the real icon — a thin margin and hairline
  // gaps. The previous values (0.14 margin, 0.035 gaps) left keys at 0.154 x
  // 0.116 of the tile, so at a 4-column grid size they were a few pixels of
  // grey confetti on a black square.
  const cols = 4;
  const rows = 5;
  const pad = 0.085;
  const gap = 0.026;
  const keyW = (1 - pad * 2 - gap * (cols - 1)) / cols;
  const keyH = (1 - pad * 2 - gap * (rows - 1)) / rows;
  const radius = keyH * 0.36;

  const keys: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // The bottom-left key is the double-width "0", as on the real keypad, so
      // it is drawn once spanning two columns and column 1 is skipped.
      const isZero = r === rows - 1 && c === 0;
      if (r === rows - 1 && c === 1) continue;

      // Right column is the operator stack (orange, top to bottom); the top row
      // is the light-grey clear/sign/percent keys; everything else is dark grey.
      const color =
        c === cols - 1 ? IOS.calcAccent : r === 0 ? IOS.calcTopKey : IOS.calcKey;

      keys.push(
        <Bar
          key={`${r}-${c}`}
          size={size}
          x={pad + c * (keyW + gap)}
          y={pad + r * (keyH + gap)}
          w={isZero ? keyW * 2 + gap : keyW}
          h={keyH}
          radius={radius}
          color={color}
        />,
      );
    }
  }
  return (
    <>
      <Ground size={size} color={IOS.calcBody} />
      {keys}
    </>
  );
}

// ─── Contacts ───────────────────────────────────────────────────────────────
// White ground, a grey portrait card, and the coloured index tabs down the
// right edge that distinguish Contacts from every other white icon.
const CONTACT_TABS: readonly string[] = ['#FF9500', '#FFD426', '#34C759', '#0A84FF', '#AF52DE'];
function ContactsIcon({ size }: ArtworkProps) {
  return (
    <>
      <Ground size={size} color="#FFFFFF" />
      <Bar size={size} x={0.14} y={0.14} w={0.62} h={0.72} color="#F2F2F7" radius={0.07} />
      <Disc size={size} cx={0.45} cy={0.4} d={0.24} color="#AEAEB2" />
      <Bar size={size} x={0.26} y={0.56} w={0.38} h={0.22} color="#AEAEB2" radius={0.11} />
      {CONTACT_TABS.map((color, i) => (
        <Bar
          key={color}
          size={size}
          x={0.78}
          y={0.2 + i * 0.13}
          w={0.1}
          h={0.055}
          color={color}
        />
      ))}
    </>
  );
}

// ─── Settings ───────────────────────────────────────────────────────────────
// Two interlocking gears on the grey gradient — a single centred gear was the
// most obviously wrong of the old glyph icons.
function SettingsIcon({ size }: ArtworkProps) {
  return (
    <>
      <Ground size={size} gradient={[IOS.settingsTop, IOS.settingsBottom]} />
      <View style={[StyleSheet.absoluteFill]}>
        <Ionicons
          name="settings-sharp"
          size={Math.round(size * 0.5)}
          color="#F2F2F7"
          style={{ position: 'absolute', left: size * 0.09, top: size * 0.1 }}
        />
        <Ionicons
          name="settings-sharp"
          size={Math.round(size * 0.36)}
          color="#E5E5EA"
          style={{ position: 'absolute', left: size * 0.47, top: size * 0.5 }}
        />
      </View>
    </>
  );
}

// ─── Wallet ─────────────────────────────────────────────────────────────────
// White tile with the stacked coloured cards slotted into a dark pocket. The
// first attempt filled the whole tile black, which is the Apple TV icon's
// treatment, not Wallet's.
function WalletIcon({ size }: ArtworkProps) {
  return (
    <>
      <Ground size={size} color="#FFFFFF" />
      <Bar size={size} x={0.13} y={0.29} w={0.74} h={0.14} color="#FF9F0A" radius={0.045} />
      <Bar size={size} x={0.13} y={0.4} w={0.74} h={0.14} color="#34C759" radius={0.045} />
      <Bar size={size} x={0.13} y={0.51} w={0.74} h={0.14} color="#0A84FF" radius={0.045} />
      {/* Pocket: the dark band the cards sit behind. */}
      <Bar size={size} x={0.11} y={0.6} w={0.78} h={0.2} color="#2C2C2E" radius={0.06} />
      <Bar size={size} x={0.11} y={0.56} w={0.78} h={0.06} color="#48484A" radius={0.02} />
    </>
  );
}

// ─── Health ─────────────────────────────────────────────────────────────────
// White ground, pink heart. Two rotated squares plus two discs make the heart
// silhouette without needing a path.
function HealthIcon({ size }: ArtworkProps) {
  // One vector heart. It was a rotated rounded square with a disc on each
  // shoulder, which has no cusp at the top and no point at the bottom — the two
  // features that make a heart read as a heart.
  return (
    <>
      <Ground size={size} color="#FFFFFF" />
      <Heart size={size} from={IOS.heartTop} to={IOS.heartBottom} />
    </>
  );
}

// ─── Shortcuts ──────────────────────────────────────────────────────────────
function ShortcutsIcon({ size }: ArtworkProps) {
  return (
    <>
      {/* Pink corner pulled further into the tile: with the first stop exactly
          on the corner the magenta occupied a few pixels and the icon read as
          plain purple-to-blue. */}
      <Ground
        size={size}
        gradient={['#FF5C9D', '#A15BF0', '#3F8CFF']}
        start={{ x: 0.12, y: 0 }}
        end={{ x: 0.9, y: 1 }}
      />
      <Bar size={size} x={0.24} y={0.24} w={0.36} h={0.36} color="#FFFFFF" radius={0.11} opacity={0.95} />
      <Bar size={size} x={0.42} y={0.42} w={0.36} h={0.36} color="#FFFFFF" radius={0.11} opacity={0.6} />
    </>
  );
}

// ─── Maps ───────────────────────────────────────────────────────────────────
function MapsIcon({ size }: ArtworkProps) {
  return (
    <>
      {/* A map crop, not a lawn. This was a green ground with white stripes,
          which reads as a golf course: the real icon's dominant colour is pale
          paper, with a green park, water at one corner, white roads and the pin.
          Land first, then the features, then the roads over them. */}
      <Ground size={size} color="#F4F0E4" />
      <Bar size={size} x={-0.02} y={-0.02} w={0.44} h={0.36} color="#A8DCA6" radius={0} />
      <Bar size={size} x={0.56} y={0.64} w={0.5} h={0.42} color="#8FD3F4" radius={0} />
      {/* Roads: a wide one across and a narrower one down, plus the yellow
          arterial the real icon has cutting the corner. */}
      <Stroke size={size} x1={-0.05} y1={0.58} x2={1.05} y2={0.36} thickness={0.115} radius={0} color="#FFFFFF" />
      <Stroke size={size} x1={0.66} y1={-0.05} x2={0.4} y2={1.05} thickness={0.085} radius={0} color="#FFFFFF" />
      <Stroke size={size} x1={-0.05} y1={0.16} x2={0.55} y2={1.05} thickness={0.06} radius={0} color="#F6CF77" />
      {/* Location pin: a rotated square for the tip, a disc for the head. */}
      <Bar size={size} x={0.435} y={0.52} w={0.12} h={0.12} color={IOS.red} radius={0.02} rotate={45} />
      <Disc size={size} cx={0.495} cy={0.45} d={0.26} color={IOS.red} />
      <Disc size={size} cx={0.495} cy={0.45} d={0.1} color="#FFFFFF" />
    </>
  );
}

// ─── Find My ────────────────────────────────────────────────────────────────
function FindMyIcon({ size }: ArtworkProps) {
  const green = '#34C759';
  return (
    <>
      {/* Radar RINGS, drawn as alternating green and white discs. Three filled
          translucent discs (what this was) stack into one soft green blob with
          no ring visible at all, and the centre marker is blue on the real
          icon — the piece that makes it read as Find My rather than as a
          generic location app. */}
      <Ground size={size} color="#FFFFFF" />
      <Disc size={size} cx={0.5} cy={0.5} d={0.88} color={green} />
      <Disc size={size} cx={0.5} cy={0.5} d={0.81} color="#FFFFFF" />
      <Disc size={size} cx={0.5} cy={0.5} d={0.61} color={green} />
      <Disc size={size} cx={0.5} cy={0.5} d={0.54} color="#FFFFFF" />
      <Disc size={size} cx={0.5} cy={0.5} d={0.35} color={green} />
      <Disc size={size} cx={0.5} cy={0.5} d={0.28} color="#FFFFFF" />
      <Disc size={size} cx={0.5} cy={0.5} d={0.2} color="#0A84FF" />
    </>
  );
}

// ─── App Store ──────────────────────────────────────────────────────────────
// Blue gradient with the three-stroke "A" built from crossed bars, which is
// what the real mark is: a stylised A drawn as an ice-lolly-stick assembly.
function AppStoreIcon({ size }: ArtworkProps) {
  // The mark is an "A" drawn as three crossed sticks: the two legs cross a
  // little BELOW their tips so each pokes out past the apex, and the crossbar
  // runs past both legs. Drawn as four mismatched pieces (two pivoted hands, a
  // bar, and a stray rotated stub) it came out as a filled triangle instead.
  return (
    <>
      <Ground size={size} gradient={['#2CC0FE', '#0A6CF5']} />
      {/* Round-capped strokes. As pills the three sticks met at mitred corners,
          which is the one thing the real mark does not have. */}
      <AppStoreMark size={size} />
    </>
  );
}

// ─── Music (facade over the installed Android music app) ────────────────────
// Red/pink gradient with the white double eighth-note. The note is two discs
// (the heads), two stems and the beam joining them.
function MusicIcon({ size }: ArtworkProps) {
  return (
    <>
      <Ground size={size} gradient={['#FB5C74', '#F62C4B']} />
      {/* Slanted heads and a curved beam: circles read as lollipops and a
          rotated bar cannot follow the beam's curve. */}
      <DoubleNote size={size} />
    </>
  );
}

// ─── News (facade) ──────────────────────────────────────────────────────────
// White ground with the red slab "N" — two uprights and the diagonal.
function NewsIcon({ size }: ArtworkProps) {
  return (
    <>
      <Ground size={size} color="#FFFFFF" />
      {/* Thin uprights, thick diagonal — the weight distribution of the real
          serif N. The diagonal runs between the uprights' ENDS, top-left to
          bottom-right. It used to be a Hand pivoted at the bottom centre and
          swung out at -27 degrees, which put it across the middle of the tile
          instead of corner to corner and read as an M. */}
      <Bar size={size} x={0.225} y={0.23} w={0.1} h={0.54} color={IOS.red} radius={0.012} />
      <Bar size={size} x={0.675} y={0.23} w={0.1} h={0.54} color={IOS.red} radius={0.012} />
      <Stroke
        size={size}
        x1={0.275}
        y1={0.26}
        x2={0.725}
        y2={0.74}
        thickness={0.155}
        radius={0.012}
        color={IOS.red}
      />
    </>
  );
}

// ─── TV (facade) ────────────────────────────────────────────────────────────
// Black ground with the Apple mark and "tv" set beside it, as on the real icon.
function TvIcon({ size }: ArtworkProps) {
  return (
    <>
      <Ground size={size} color="#0B0B0C" />
      <Ionicons
        name="logo-apple"
        size={Math.round(size * 0.27)}
        color="#FFFFFF"
        style={{ position: 'absolute', left: size * 0.2, top: size * 0.33 }}
      />
      <Glyph
        size={size}
        x={0.45}
        y={0.35}
        w={0.4}
        text="tv"
        color="#FFFFFF"
        fontSize={0.29}
        weight="600"
        style={{ textAlign: 'left' }}
      />
    </>
  );
}

// ─── Podcasts (facade) ──────────────────────────────────────────────────────
// Purple gradient with the white "broadcasting person": a head, a body, and two
// arcs radiating outwards.
function PodcastsIcon({ size }: ArtworkProps) {
  return (
    <>
      <Ground
        size={size}
        gradient={['#C965F4', '#7A34D6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      {/* Arcs, not discs: a disc behind the mic is a pale blob, and the two
          radiating arcs are what identify the icon. */}
      <PodcastsMark size={size} />
    </>
  );
}

// ─── Registry ───────────────────────────────────────────────────────────────

export type IconArtwork = React.ComponentType<ArtworkProps>;

/**
 * Built-in package name -> artwork. Consulted by SystemAppIcon; a package with
 * no entry falls back to the glyph-on-gradient treatment, so adding a built-in
 * app never requires artwork up front.
 *
 * Calendar is a factory because its face shows today's date, like the real one.
 */
export function buildAppIconArtwork(now: Date = new Date()): Record<string, IconArtwork> {
  // Spelled out ('TUESDAY'), not abbreviated — the real icon writes the full
  // weekday above the date.
  const weekday = now.toLocaleDateString(undefined, { weekday: 'long' }).toUpperCase();
  const day = String(now.getDate());
  return {
    'com.iostoandroid.phone': PhoneIcon,
    'com.iostoandroid.messages': MessagesIcon,
    'com.iostoandroid.facetime': FaceTimeIcon,
    'com.iostoandroid.mail': MailIcon,
    'com.iostoandroid.browser': SafariIcon,
    'com.iostoandroid.photos': PhotosIcon,
    'com.iostoandroid.camera': CameraIcon,
    'com.iostoandroid.clock': ClockIcon,
    'com.iostoandroid.calendar': makeCalendarIcon(weekday, day),
    'com.iostoandroid.weather': WeatherIcon,
    'com.iostoandroid.notes': NotesIcon,
    'com.iostoandroid.reminders': RemindersIcon,
    'com.iostoandroid.calculator': CalculatorIcon,
    'com.iostoandroid.contacts': ContactsIcon,
    'com.iostoandroid.settings': SettingsIcon,
    'com.iostoandroid.wallet': WalletIcon,
    'com.iostoandroid.health': HealthIcon,
    'com.iostoandroid.shortcuts': ShortcutsIcon,
    'com.iostoandroid.maps': MapsIcon,
    'com.iostoandroid.findmy': FindMyIcon,
    'com.iostoandroid.appstore': AppStoreIcon,
    // Facades over installed Android apps (utils/iosFacadeApps.ts) — the icon
    // is ours, the app that opens is the device's.
    'com.iostoandroid.music': MusicIcon,
    'com.iostoandroid.news': NewsIcon,
    'com.iostoandroid.tv': TvIcon,
    'com.iostoandroid.podcasts': PodcastsIcon,
  };
}

/**
 * Module-level registry for callers that do not need the date to change within
 * a session. The Calendar face is rebuilt on each app launch, which matches how
 * often a launcher process restarts; `buildAppIconArtwork` is exported for
 * callers (and tests) that want to pin the date.
 */
export const APP_ICON_ARTWORK: Record<string, IconArtwork> = buildAppIconArtwork();

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
