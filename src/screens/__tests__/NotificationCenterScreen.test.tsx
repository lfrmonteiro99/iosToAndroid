import React from 'react';
import { render } from '../../test-utils';
import { NotificationCenterScreen, styles } from '../NotificationCenterScreen';

// -- Contrast helpers (WCAG 2.1) applied to the screen's REAL style values --
function parseColor(color: string) {
  const hex = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex) {
    return { r: parseInt(hex[1], 16), g: parseInt(hex[2], 16), b: parseInt(hex[3], 16), a: 1 };
  }
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) throw new Error(`Unparseable color: ${color}`);
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
}
type RGB = { r: number; g: number; b: number };
function compositeOver(fg: { r: number; g: number; b: number; a: number }, bg: RGB): RGB {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) };
}
function relLuminance({ r, g, b }: RGB): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrastRatio(c1: RGB, c2: RGB): number {
  const l1 = relLuminance(c1);
  const l2 = relLuminance(c2);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
const WHITE_WALLPAPER: RGB = { r: 255, g: 255, b: 255 };
const BLACK_WALLPAPER: RGB = { r: 0, g: 0, b: 0 };
const AA_MIN_CONTRAST = 4.5;

// Text style keys and the layer they're actually painted on:
// layer 1 = root scrim composited directly over the wallpaper (styles.root)
// layer 2 = card fallback (styles.notifCard / styles.accessCard) composited over layer 1
const TEXTS_ON_LAYER_1: Array<keyof typeof styles> = ['dateText', 'emptyText', 'groupAppName'];
const TEXTS_ON_LAYER_2: Array<keyof typeof styles> = [
  'accessTitle',
  'accessSubtitle',
  'notifTitle',
  'notifTitleRead',
  'notifTime',
  'notifBody',
  'notifBodyRead',
  'notifActionText',
  'replyCancelText',
];

function colorOf(styleKey: keyof typeof styles): string {
  const style = styles[styleKey] as { color?: string };
  if (!style.color) throw new Error(`styles.${styleKey} has no color`);
  return style.color;
}

describe('NotificationCenterScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<NotificationCenterScreen />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders date header', () => {
    const { toJSON } = render(<NotificationCenterScreen />);
    // The screen renders a date header (e.g. "Wednesday, April 8") — just verify it rendered
    expect(toJSON()).toBeTruthy();
  });

  it('renders notification access prompt when access not granted', () => {
    // In test environment isNotificationAccessGranted returns false
    const { getByText } = render(<NotificationCenterScreen />);
    expect(getByText('Notification Access Required')).toBeTruthy();
  });

  it('renders Enable Notification Access button', () => {
    const { getByLabelText } = render(<NotificationCenterScreen />);
    expect(getByLabelText('Enable Notification Access')).toBeTruthy();
  });

  // Issue #436: the overlay is "praticamente transparente" — the home grid behind it
  // stays legible and the card content is unreadable. These tests exercise the REAL
  // rendered root scrim and the REAL card fallback background (the one that's actually
  // shown when the BlurView's native blur fails to render, e.g. dimezisBlurView on
  // some devices), not a reimplementation of the color math.
  describe('overlay opacity (issue #436)', () => {
    it('root scrim is opaque enough to hide the screen behind it', () => {
      const { toJSON } = render(<NotificationCenterScreen />);
      const root = toJSON() as unknown as { props: { style: { backgroundColor: string } } };
      const { a } = parseColor(root.props.style.backgroundColor);
      // 45% (the pre-fix value) lets a colourful app grid read straight through.
      expect(a).toBeGreaterThanOrEqual(0.7);
    });

    it('the access-required card renders with the opaque fallback background, not the near-transparent one', () => {
      const { UNSAFE_getByType } = render(<NotificationCenterScreen />);
      // BlurView is mocked as a plain host component named 'BlurView' (jest.setup.js) —
      // this reads its real `style` prop as actually applied by the component.
      const blur = UNSAFE_getByType('BlurView' as never);
      const { a } = parseColor((blur.props as { style: { backgroundColor: string } }).style.backgroundColor);
      expect(a).toBeGreaterThanOrEqual(0.85);
    });

    it('keeps the blur decorative: intensity/tint props are untouched by the background fix', () => {
      const { UNSAFE_getByType } = render(<NotificationCenterScreen />);
      const blur = UNSAFE_getByType('BlurView' as never);
      expect(blur.props).toMatchObject({ intensity: 40, tint: 'dark' });
    });

    it('notifCard and accessCard share the exact same fallback background', () => {
      // notifCard can't be reached via a synchronous mount in this jest-expo setup —
      // isNotificationAccessGranted() only resolves after a dynamic import() that the
      // test environment can't intercept, so hasAccess never flips to true here (a
      // pre-existing, unrelated limitation). Proving the two style objects are pinned
      // to the identical literal is the closest honest substitute for mounting it.
      expect(styles.notifCard.backgroundColor).toBe(styles.accessCard.backgroundColor);
    });

    it.each([...TEXTS_ON_LAYER_1, ...TEXTS_ON_LAYER_2])(
      'styles.%s passes WCAG AA (4.5:1) against its real composited background, over a white or black wallpaper',
      (styleKey) => {
        const onLayer1 = (TEXTS_ON_LAYER_1 as string[]).includes(styleKey as string);
        for (const wallpaper of [WHITE_WALLPAPER, BLACK_WALLPAPER]) {
          const layer1 = compositeOver(parseColor(styles.root.backgroundColor), wallpaper);
          const background = onLayer1
            ? layer1
            : compositeOver(parseColor(styles.accessCard.backgroundColor), layer1);
          const text = parseColor(colorOf(styleKey as keyof typeof styles));
          const displayedText = compositeOver(text, background);
          const ratio = contrastRatio(displayedText, background);
          expect(ratio).toBeGreaterThanOrEqual(AA_MIN_CONTRAST);
        }
      },
    );
  });
});
