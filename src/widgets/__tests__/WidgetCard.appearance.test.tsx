/**
 * #934: today the six widget types share one fixed-dark glass frame
 * (`WidgetCard.tsx` hardcoded `tint="dark"`, `rgba(30,30,35,0.6)`) — Weather and
 * Up Next were visually indistinguishable from each other and from every other
 * widget, and never lightened in light theme.
 *
 * This locks the new contract for the two widgets migrated by this issue
 * (Weather → gradient-by-condition, Up Next → themed solid "calendar" card),
 * while proving the four unmigrated widgets keep today's fixed-dark glass
 * frame byte-for-byte (the issue's own "current appearance stays the
 * omitted default" clause).
 */
import React from 'react';
import { Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { render, act, fireEvent } from '../../test-utils';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import { WeatherWidget, UpNextWidget, BatteryWidget, type CalendarEventItem } from '../TodayWidgets';
import { WidgetWeatherGradients, WidgetGlassText } from '../../theme/CupertinoTheme';

// ---------------------------------------------------------------------------
// WCAG contrast helpers (mirrors the standard relative-luminance formula —
// see https://www.w3.org/TR/WCAG21/#contrast-minimum). Reads the real
// exported tokens; nothing here is a copy of production values.
// ---------------------------------------------------------------------------

function parseColor(color: string): { r: number; g: number; b: number; a: number } {
  if (color.startsWith('rgba') || color.startsWith('rgb')) {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
      return {
        r: parseInt(match[1], 10),
        g: parseInt(match[2], 10),
        b: parseInt(match[3], 10),
        a: match[4] !== undefined ? parseFloat(match[4]) : 1,
      };
    }
  }
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }
  throw new Error(`Unsupported color: ${color}`);
}

function relativeLuminance(c: { r: number; g: number; b: number }): number {
  const linearize = (channel: number) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearize(c.r) + 0.7152 * linearize(c.g) + 0.0722 * linearize(c.b);
}

/** WCAG contrast ratio between a (possibly translucent) foreground and an opaque background. */
function contrastRatio(fg: string, bg: string): number {
  const fgColor = parseColor(fg);
  const bgColor = parseColor(bg);
  const blended = {
    r: fgColor.r * fgColor.a + bgColor.r * (1 - fgColor.a),
    g: fgColor.g * fgColor.a + bgColor.g * (1 - fgColor.a),
    b: fgColor.b * fgColor.a + bgColor.b * (1 - fgColor.a),
  };
  const L1 = relativeLuminance(blended);
  const L2 = relativeLuminance(bgColor);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface TestJsonNode {
  type: string;
  props: Record<string, unknown>;
  children: (TestJsonNode | string)[] | null;
}

/** Depth-first walk of the react-test-renderer JSON tree, collecting nodes by host type. */
function collectByType(
  node: TestJsonNode | TestJsonNode[] | null,
  type: string,
  out: TestJsonNode[] = [],
): TestJsonNode[] {
  if (!node) return out;
  const nodes = Array.isArray(node) ? node : [node];
  for (const n of nodes) {
    if (n && typeof n === 'object') {
      if (n.type === type) out.push(n);
      if (n.children) collectByType(n.children.filter((c): c is TestJsonNode => typeof c !== 'string'), type, out);
    }
  }
  return out;
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.filter(Boolean).map(flattenStyle));
  return style as Record<string, unknown>;
}

function Controls() {
  const { setThemeMode } = useTheme();
  const { update } = useSettings();
  return (
    <>
      <Pressable testID="set-light" onPress={() => setThemeMode('light')}><Text>light</Text></Pressable>
      <Pressable testID="set-dark" onPress={() => setThemeMode('dark')}><Text>dark</Text></Pressable>
      <Pressable testID="enable-reduce-transparency" onPress={() => update('reduceTransparency', true)}><Text>reduce</Text></Pressable>
      <Pressable testID="set-text-large" onPress={() => update('textSizeIndex', 3)}><Text>large</Text></Pressable>
    </>
  );
}

function makeEvent(over: Partial<CalendarEventItem> = {}): CalendarEventItem {
  return {
    id: 'e1',
    title: 'Standup',
    start: new Date(2026, 7, 25, 9, 30).getTime(),
    end: new Date(2026, 7, 25, 10, 30).getTime(),
    allDay: false,
    location: '',
    ...over,
  };
}

const FIXED_NOW = new Date(2026, 7, 25); // Tuesday, 25th (local)

// ---------------------------------------------------------------------------
// Red-step contract: Weather vs Up Next vs the old shared fixed-dark frame
// ---------------------------------------------------------------------------

describe('Widget visual identity (#934)', () => {
  it('gives Weather a gradient surface and Up Next a solid one — never the shared fixed-dark glass', () => {
    const { toJSON } = render(
      <>
        <WeatherWidget temp={19} condition="Sunny" icon="sunny" city="Lisbon" />
        <UpNextWidget events={[]} now={FIXED_NOW} />
      </>,
    );
    const json = toJSON();

    // Weather: a real gradient background, keyed by condition.
    const gradients = collectByType(json as TestJsonNode, 'LinearGradient');
    expect(gradients).toHaveLength(1);
    expect(gradients[0].props.colors).toEqual(WidgetWeatherGradients.clear);

    // Up Next: no blur at all — it renders through WidgetCard's opaque 'solid' path.
    const blurViews = collectByType(json as TestJsonNode, 'BlurView');
    expect(blurViews).toHaveLength(0);
  });

  it('resolves different backgrounds for Weather and Up Next (today both are rgba(30,30,35,0.6))', () => {
    const { toJSON } = render(
      <>
        <WeatherWidget temp={19} condition="Rain" icon="rainy" city="Porto" />
        <UpNextWidget events={[]} now={FIXED_NOW} />
      </>,
    );
    const json = toJSON();
    const gradients = collectByType(json as TestJsonNode, 'LinearGradient');
    const upNextSolidViews = collectByType(json as TestJsonNode, 'View').filter(
      (v) => flattenStyle(v.props.style).backgroundColor === '#FFFFFF',
    );
    expect(gradients[0].props.colors).toEqual(WidgetWeatherGradients.rain);
    expect(gradients[0].props.colors).not.toContain('#FFFFFF');
    // Up Next resolved to the light theme's systemBackground (#FFFFFF, see below) —
    // distinct from Weather's rain gradient.
    expect(upNextSolidViews.length).toBeGreaterThan(0);
  });

  it('renders Up Next light (not the fixed dark tint) when the app theme is light', () => {
    const { getByTestId, toJSON } = render(
      <>
        <Controls />
        <UpNextWidget events={[]} now={FIXED_NOW} />
      </>,
    );
    act(() => { fireEvent.press(getByTestId('set-light')); });

    const views = collectByType(toJSON() as TestJsonNode, 'View');
    const lightCard = views.find((v) => flattenStyle(v.props.style).backgroundColor === '#FFFFFF');
    expect(lightCard).toBeTruthy();
  });

  it('renders Up Next with the dark theme tone (not the old fixed rgba(30,30,35,0.6)) when the app theme is dark', () => {
    const { getByTestId, toJSON } = render(
      <>
        <Controls />
        <UpNextWidget events={[]} now={FIXED_NOW} />
      </>,
    );
    act(() => { fireEvent.press(getByTestId('set-dark')); });

    const views = collectByType(toJSON() as TestJsonNode, 'View');
    const darkCard = views.find((v) => flattenStyle(v.props.style).backgroundColor === '#1C1C1E');
    expect(darkCard).toBeTruthy();
    const staleFixedCard = views.find((v) => flattenStyle(v.props.style).backgroundColor === 'rgba(30,30,35,0.6)');
    expect(staleFixedCard).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Unmigrated widgets keep today's fixed-dark glass frame (no regression)
// ---------------------------------------------------------------------------

// #963 gave every type a palette and #965 rebuilt Battery around a ring, so
// Battery is no longer one of the "unmigrated" widgets this described. What it
// asserted — that a migrated widget owns an opaque surface instead of the shared
// glass, in either theme — is still worth holding, so it is asserted directly.
describe('Battery owns its surface (#963), rather than the shared glass frame', () => {
  it('paints no blur in either theme — the palette gradient is its ground', () => {
    const { getByTestId, toJSON } = render(
      <>
        <Controls />
        <BatteryWidget level={0.5} isCharging={false} />
      </>,
    );

    act(() => { fireEvent.press(getByTestId('set-light')); });
    expect(collectByType(toJSON() as TestJsonNode, 'BlurView')).toHaveLength(0);

    act(() => { fireEvent.press(getByTestId('set-dark')); });
    expect(collectByType(toJSON() as TestJsonNode, 'BlurView')).toHaveLength(0);
  });

  it('falls back to a flat fill when Reduce Transparency is on', () => {
    const { getByTestId, toJSON } = render(
      <>
        <Controls />
        <BatteryWidget level={0.5} isCharging={false} />
      </>,
    );
    act(() => { fireEvent.press(getByTestId('enable-reduce-transparency')); });

    expect(collectByType(toJSON() as TestJsonNode, 'BlurView')).toHaveLength(0);
    const views = collectByType(toJSON() as TestJsonNode, 'View');
    const solid = views.find((v) => flattenStyle(v.props.style).backgroundColor === '#12331F');
    expect(solid).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Reduce Transparency: gradient/solid surfaces also fall back to a flat fill
// ---------------------------------------------------------------------------

describe('Reduce Transparency (#934 surfaces)', () => {
  it('drops the Weather gradient for a flat fill', () => {
    const { getByTestId, toJSON } = render(
      <>
        <Controls />
        <WeatherWidget temp={19} condition="Sunny" icon="sunny" city="Lisbon" />
      </>,
    );
    act(() => { fireEvent.press(getByTestId('enable-reduce-transparency')); });

    expect(collectByType(toJSON() as TestJsonNode, 'LinearGradient')).toHaveLength(0);
    const views = collectByType(toJSON() as TestJsonNode, 'View');
    const flatFill = views.find((v) => flattenStyle(v.props.style).backgroundColor === WidgetWeatherGradients.clear[1]);
    expect(flatFill).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Weather: high/low temperature
// ---------------------------------------------------------------------------

describe('Weather high/low (#934 AC)', () => {
  it('shows the forecast high and low when provided', () => {
    const { getByText } = render(
      <WeatherWidget temp={24} condition="Sunny" icon="sunny" city="Lisbon" maxTemp={27} minTemp={19} />,
    );
    expect(getByText('H:27°  L:19°')).toBeTruthy();
  });

  it('shows nothing extra when the forecast has no high/low (boundary: absent data)', () => {
    const { queryByText } = render(
      <WeatherWidget temp={24} condition="Sunny" icon="sunny" city="Lisbon" />,
    );
    expect(queryByText(/H:.*L:/)).toBeNull();
  });

  it('respects textScale for the large temperature body (Dynamic Type)', () => {
    const { getByTestId, getByText } = render(
      <>
        <Controls />
        <WeatherWidget temp={24} condition="Sunny" icon="sunny" city="Lisbon" />
      </>,
    );
    act(() => { fireEvent.press(getByTestId('set-text-large')); });

    const tempNode = getByText('24°');
    const flat = flattenStyle(tempNode.props.style);
    expect(flat.fontSize).toBe(40 * 1.3);
  });
});

// ---------------------------------------------------------------------------
// Weather: WCAG AA contrast for every gradient stop (#934 reviewer round 1)
// ---------------------------------------------------------------------------

describe('Weather gradient contrast (#934 WCAG AA)', () => {
  const WCAG_AA_NORMAL_TEXT = 4.5;

  it.each(Object.entries(WidgetWeatherGradients))(
    '%s: both stops hold >=4.5:1 against opaque white text (not just the darker one)',
    (_condition, stops) => {
      for (const stop of stops) {
        const ratio = contrastRatio(WidgetGlassText.primary, stop);
        expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
      }
    },
  );

  it('the lighter stop of every condition is the binding constraint (linear RGB interpolation is monotonic in luminance)', () => {
    // Confirms the "check both endpoints" strategy above actually covers the
    // worst case: for every condition the first (lighter) stop has a lower
    // contrast ratio than the second (darker) one, so no interior point of
    // the two-stop LinearGradient can fall outside [min(ratio0, ratio1)].
    for (const stops of Object.values(WidgetWeatherGradients)) {
      const [lighter, darker] = stops;
      expect(contrastRatio(WidgetGlassText.primary, lighter)).toBeLessThanOrEqual(
        contrastRatio(WidgetGlassText.primary, darker),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Weather: the RENDERED nodes actually use the opaque tone (#934 reviewer r2)
//
// The block above only proves the *token* WidgetGlassText.primary clears AA on
// every gradient stop — it says nothing about which tone each node picks. The
// translucent tones are still exported and still baked into the shared
// `styles.widgetTitle` / `styles.widgetSubtext` / `styles.weatherDesc` bases,
// so a dropped inline override would silently put `title` (3.81:1) or
// `secondary` (2.78:1) back on a gradient stop. These tests read the resolved
// `color` off the real rendered nodes and then push that resolved value
// through the same WCAG formula, so the guard is end-to-end.
// ---------------------------------------------------------------------------

describe('Weather text tone on the gradient surface (#934 reviewer r2)', () => {
  const WCAG_AA_NORMAL_TEXT = 4.5;

  /** Resolved `color` of a rendered host node, after style-array flattening. */
  function resolvedColor(node: { props: { style?: unknown } }): unknown {
    return flattenStyle(node.props.style).color;
  }

  it('renders title, city, condition, temperature and H:/L: in the opaque primary tone', () => {
    const view = render(
      <WeatherWidget temp={24} condition="Sunny" icon="sunny" city="Lisbon" maxTemp={27} minTemp={19} />,
    );

    for (const label of ['Weather', 'Lisbon', 'Sunny', '24°', 'H:27°  L:19°']) {
      expect(resolvedColor(view.getByText(label))).toBe(WidgetGlassText.primary);
    }
    const icons = view.UNSAFE_getAllByType(Ionicons);
    expect(icons).toHaveLength(1);
    expect(icons[0].props.color).toBe(WidgetGlassText.primary);
  });

  it('renders the "Unable to load weather" path in the opaque primary tone too', () => {
    const view = render(<WeatherWidget temp={0} condition="" icon="" city="Lisbon" />);

    for (const label of ['Weather', 'Unable to load weather']) {
      expect(resolvedColor(view.getByText(label))).toBe(WidgetGlassText.primary);
    }
    const icons = view.UNSAFE_getAllByType(Ionicons);
    expect(icons).toHaveLength(1);
    expect(icons[0].props.name).toBe('cloud-offline');
    expect(icons[0].props.color).toBe(WidgetGlassText.primary);
  });

  it.each([
    ['sunny', 'clear'],
    ['cloud', 'cloudy'],
    ['rainy', 'rain'],
    ['snow', 'snow'],
  ] as const)(
    'icon "%s" (%s gradient): every resolved text color clears 4.5:1 on both stops of the gradient it is actually painted on',
    (icon, condition) => {
      const view = render(
        <WeatherWidget temp={24} condition="Sunny" icon={icon} city="Lisbon" maxTemp={27} minTemp={19} />,
      );

      // The surface this widget really rendered — not an assumed one.
      const gradients = collectByType(view.toJSON() as TestJsonNode, 'LinearGradient');
      expect(gradients[0].props.colors).toEqual(WidgetWeatherGradients[condition]);

      const colors = ['Weather', 'Lisbon', 'Sunny', '24°', 'H:27°  L:19°'].map((label) =>
        String(resolvedColor(view.getByText(label))),
      );
      colors.push(String(view.UNSAFE_getAllByType(Ionicons)[0].props.color));

      for (const color of colors) {
        for (const stop of WidgetWeatherGradients[condition]) {
          expect(contrastRatio(color, stop)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
        }
      }
    },
  );

  it('keeps the opaque tone in light theme (the widget owns its surface, so it must not follow the app tint)', () => {
    const view = render(
      <>
        <Controls />
        <WeatherWidget temp={24} condition="Sunny" icon="sunny" city="Lisbon" maxTemp={27} minTemp={19} />
      </>,
    );
    act(() => { fireEvent.press(view.getByTestId('set-light')); });

    for (const label of ['Weather', 'Lisbon', 'Sunny', '24°', 'H:27°  L:19°']) {
      expect(resolvedColor(view.getByText(label))).toBe(WidgetGlassText.primary);
    }
  });

  it('keeps the opaque tone with Reduce Transparency on, where the flat fill is the gradient\'s darker stop', () => {
    const view = render(
      <>
        <Controls />
        <WeatherWidget temp={24} condition="Sunny" icon="sunny" city="Lisbon" maxTemp={27} minTemp={19} />
      </>,
    );
    act(() => { fireEvent.press(view.getByTestId('enable-reduce-transparency')); });

    expect(collectByType(view.toJSON() as TestJsonNode, 'LinearGradient')).toHaveLength(0);
    for (const label of ['Weather', 'Lisbon', 'Sunny', '24°', 'H:27°  L:19°']) {
      expect(resolvedColor(view.getByText(label))).toBe(WidgetGlassText.primary);
    }
  });

  it('keeps the opaque tone at the largest textScale (inline fontSize must not clobber the inline color)', () => {
    const view = render(
      <>
        <Controls />
        <WeatherWidget temp={24} condition="Sunny" icon="sunny" city="Lisbon" maxTemp={27} minTemp={19} />
      </>,
    );
    act(() => { fireEvent.press(view.getByTestId('set-text-large')); });

    for (const label of ['Weather', 'Lisbon', 'Sunny', '24°', 'H:27°  L:19°']) {
      expect(resolvedColor(view.getByText(label))).toBe(WidgetGlassText.primary);
    }
  });

  it('keeps the remaining nodes opaque when the city is empty (no city node is rendered at all)', () => {
    const view = render(
      <WeatherWidget temp={24} condition="Sunny" icon="sunny" city="" maxTemp={27} minTemp={19} />,
    );

    expect(view.queryByText('Lisbon')).toBeNull();
    for (const label of ['Weather', 'Sunny', '24°', 'H:27°  L:19°']) {
      expect(resolvedColor(view.getByText(label))).toBe(WidgetGlassText.primary);
    }
  });

  it('leaves the translucent tones in place for the unmigrated glass widgets (the inverse of the fix)', () => {
    // Battery still renders on the fixed-dark glass frame, where
    // WidgetGlassText.title/.secondary were tuned and still read fine — the
    // Weather fix must not have been applied across the board.
    const view = render(<BatteryWidget level={0.5} isCharging={false} />);
    expect(resolvedColor(view.getByText('Battery'))).toBe(WidgetGlassText.title);
  });
});

// ---------------------------------------------------------------------------
// Up Next: header format, event range, colored bar
// ---------------------------------------------------------------------------

describe('Up Next content (#934 AC)', () => {
  it('shows the weekday (uppercase, red) and day number in the reference format', () => {
    const { getByText } = render(<UpNextWidget events={[]} now={FIXED_NOW} />);
    expect(getByText('TUESDAY')).toBeTruthy();
    expect(getByText('25')).toBeTruthy();
  });

  it('shows the start–end range instead of just the start time', () => {
    const { getByText, queryByText } = render(
      <UpNextWidget events={[makeEvent()]} now={FIXED_NOW} />,
    );
    expect(getByText(/09:30–10:30/)).toBeTruthy();
    // The old start-only format must not survive alongside the range.
    expect(queryByText('09:30')).toBeNull();
  });

  it('falls back to "All day" for an all-day event instead of a bogus range', () => {
    const { getByText } = render(
      <UpNextWidget events={[makeEvent({ allDay: true })]} now={FIXED_NOW} />,
    );
    expect(getByText(/All day/)).toBeTruthy();
  });

  it('renders a colored left bar per event row, not the old dot', () => {
    const { toJSON } = render(
      <UpNextWidget events={[makeEvent({ id: 'a' }), makeEvent({ id: 'b', title: 'Lunch' })]} now={FIXED_NOW} />,
    );
    const views = collectByType(toJSON() as TestJsonNode, 'View');
    const bars = views.filter((v) => flattenStyle(v.props.style).width === 4);
    expect(bars).toHaveLength(2);
    // Distinct colors per row, not a single flat orange dot.
    expect(flattenStyle(bars[0].props.style).backgroundColor).not.toBe(
      flattenStyle(bars[1].props.style).backgroundColor,
    );
    // No leftover 8x8 rounded dot.
    const dots = views.filter((v) => flattenStyle(v.props.style).width === 8 && flattenStyle(v.props.style).height === 8);
    expect(dots).toHaveLength(0);
  });
});
