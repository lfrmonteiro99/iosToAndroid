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
import { LinearGradient } from 'expo-linear-gradient';
import { Ground, Disc, Bar, Hand, Glyph, PolarGlyph, type ArtworkProps } from './primitives';

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
      <Bar size={size} x={0.235} y={0.325} w={0.53} h={0.2} color="#FFFFFF" radius={0.1} />
      <Bar
        size={size}
        x={0.155}
        y={0.545}
        w={0.13}
        h={0.13}
        color="#FFFFFF"
        radius={0.03}
        rotate={45}
      />
      {/* The body sits above the tail so the tail reads as attached, not stuck on. */}
      <Bar size={size} x={0.185} y={0.29} w={0.63} h={0.42} color="#FFFFFF" radius={0.19} />
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
  const ticks = Array.from({ length: 16 }, (_, i) => i * (360 / 16));
  return (
    <>
      <Ground size={size} color="#FFFFFF" />
      <Disc size={size} cx={0.5} cy={0.5} d={0.9} color="#0A84FF" />
      <Disc size={size} cx={0.5} cy={0.5} d={0.78} color="#F2F7FF" />
      {ticks.map((a) => (
        <Hand
          key={a}
          size={size}
          cx={0.5}
          cy={0.5}
          length={0.39}
          thickness={a % 90 === 0 ? 0.028 : 0.016}
          angle={a}
          color="#9CC7F5"
          radius={0}
        />
      ))}
      <Disc size={size} cx={0.5} cy={0.5} d={0.62} color="#F2F7FF" />
      {/* Needle: two halves pinned at the centre, 45° apart from vertical. */}
      <Hand size={size} cx={0.5} cy={0.5} length={0.3} thickness={0.085} angle={45} color="#FFFFFF" radius={0.01} />
      <Hand size={size} cx={0.5} cy={0.5} length={0.3} thickness={0.085} angle={225} color={IOS.red} radius={0.01} />
      <Disc size={size} cx={0.5} cy={0.5} d={0.075} color="#FFFFFF" />
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
      {PHOTO_PETALS.map((color, i) => (
        <Hand
          key={color}
          size={size}
          cx={0.5}
          cy={0.5}
          length={0.34}
          thickness={0.235}
          angle={i * 45}
          // radius = half the thickness: a full pill, so each petal is a
          // rounded lobe instead of the rectangular starburst this first drew.
          radius={0.1175}
          color={color}
        />
      ))}
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
  const rays = [0, 45, 90, 135];
  return (
    <>
      <Ground size={size} gradient={[IOS.weatherTop, IOS.weatherBottom]} />
      {rays.map((a) => (
        <Bar
          key={a}
          size={size}
          x={0.16}
          y={0.335}
          w={0.42}
          h={0.035}
          color="#FFD426"
          rotate={a}
        />
      ))}
      <Disc size={size} cx={0.37} cy={0.35} d={0.28} color="#FFD426" />
      {/* Cloud: three discs plus a base bar, the classic iOS cloud silhouette. */}
      <Disc size={size} cx={0.46} cy={0.63} d={0.26} color="#FFFFFF" />
      <Disc size={size} cx={0.65} cy={0.6} d={0.32} color="#FFFFFF" />
      <Disc size={size} cx={0.8} cy={0.67} d={0.22} color="#FFFFFF" />
      <Bar size={size} x={0.34} y={0.63} w={0.56} h={0.15} color="#FFFFFF" radius={0.075} />
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
  const cols = 4;
  const rows = 5;
  const pad = 0.14;
  const gap = 0.035;
  const keyW = (1 - pad * 2 - gap * (cols - 1)) / cols;
  const keyH = (1 - pad * 2 - gap * (rows - 1)) / rows;
  const keys: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isTopRow = r === 0;
      const isOperatorCol = c === cols - 1 && !isTopRow;
      keys.push(
        <Bar
          key={`${r}-${c}`}
          size={size}
          x={pad + c * (keyW + gap)}
          y={pad + r * (keyH + gap)}
          w={keyW}
          h={keyH}
          radius={keyW * 0.3}
          color={isOperatorCol ? IOS.calcAccent : isTopRow ? IOS.calcTopKey : IOS.calcKey}
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
  return (
    <>
      <Ground size={size} color="#FFFFFF" />
      <LinearGradient
        colors={[IOS.heartTop, IOS.heartBottom]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          position: 'absolute',
          left: size * 0.28,
          top: size * 0.33,
          width: size * 0.44,
          height: size * 0.44,
          borderRadius: size * 0.06,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <Disc size={size} cx={0.36} cy={0.41} d={0.315} color={IOS.heartTop} />
      <Disc size={size} cx={0.64} cy={0.41} d={0.315} color={IOS.heartTop} />
    </>
  );
}

// ─── Shortcuts ──────────────────────────────────────────────────────────────
function ShortcutsIcon({ size }: ArtworkProps) {
  return (
    <>
      <Ground
        size={size}
        gradient={['#F857A6', '#8E5BF7', '#3A8DFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <Bar size={size} x={0.24} y={0.24} w={0.36} h={0.36} color="#FFFFFF" radius={0.11} opacity={0.95} />
      <Bar size={size} x={0.42} y={0.42} w={0.36} h={0.36} color="#FFFFFF" radius={0.11} opacity={0.6} />
    </>
  );
}

// ─── Maps ───────────────────────────────────────────────────────────────────
// The real icon is a cartographic scrap: green parkland, a pale road grid and a
// blue highway cutting across, with the location pin on top.
function MapsIcon({ size }: ArtworkProps) {
  return (
    <>
      <Ground size={size} gradient={['#8BD98F', '#4CAF63']} />
      <Bar size={size} x={-0.1} y={0.14} w={1.2} h={0.09} color="#F7F7EF" radius={0} rotate={-14} />
      <Bar size={size} x={-0.1} y={0.72} w={1.2} h={0.075} color="#F7F7EF" radius={0} rotate={-14} />
      <Bar size={size} x={0.2} y={-0.1} w={0.085} color="#F7F7EF" h={1.2} radius={0} rotate={10} />
      <Bar size={size} x={-0.15} y={0.42} w={1.35} h={0.13} color="#4E9BE8" radius={0} rotate={-22} />
      {/* Location pin: a disc head over a rotated square that reads as the tip. */}
      <Bar size={size} x={0.44} y={0.53} w={0.12} h={0.12} color={IOS.red} radius={0.02} rotate={45} />
      <Disc size={size} cx={0.5} cy={0.47} d={0.26} color={IOS.red} />
      <Disc size={size} cx={0.5} cy={0.47} d={0.1} color="#FFFFFF" />
    </>
  );
}

// ─── Find My ────────────────────────────────────────────────────────────────
// Concentric radar rings with the same pin as Maps at the centre, on white.
function FindMyIcon({ size }: ArtworkProps) {
  return (
    <>
      <Ground size={size} color="#FFFFFF" />
      <Disc size={size} cx={0.5} cy={0.5} d={0.86} color="#34C759" opacity={0.16} />
      <Disc size={size} cx={0.5} cy={0.5} d={0.62} color="#34C759" opacity={0.24} />
      <Disc size={size} cx={0.5} cy={0.5} d={0.4} color="#34C759" opacity={0.34} />
      <Bar size={size} x={0.44} y={0.56} w={0.12} h={0.12} color="#2FA84F" radius={0.02} rotate={45} />
      <Disc size={size} cx={0.5} cy={0.5} d={0.24} color="#2FA84F" />
      <Disc size={size} cx={0.5} cy={0.5} d={0.09} color="#FFFFFF" />
    </>
  );
}

// ─── App Store ──────────────────────────────────────────────────────────────
// Blue gradient with the three-stroke "A" built from crossed bars, which is
// what the real mark is: a stylised A drawn as an ice-lolly-stick assembly.
function AppStoreIcon({ size }: ArtworkProps) {
  return (
    <>
      <Ground size={size} gradient={['#3FB6FF', '#0A6CF5']} />
      <Hand size={size} cx={0.385} cy={0.72} length={0.4} thickness={0.075} angle={22} color="#FFFFFF" />
      <Hand size={size} cx={0.615} cy={0.72} length={0.4} thickness={0.075} angle={-22} color="#FFFFFF" />
      <Bar size={size} x={0.245} y={0.585} w={0.51} h={0.072} color="#FFFFFF" />
      <Bar size={size} x={0.6} y={0.66} w={0.17} h={0.072} color="#FFFFFF" rotate={-22} />
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
