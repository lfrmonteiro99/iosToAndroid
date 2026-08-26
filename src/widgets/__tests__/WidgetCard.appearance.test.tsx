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
import { render, act, fireEvent } from '../../test-utils';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import { WeatherWidget, UpNextWidget, BatteryWidget, type CalendarEventItem } from '../TodayWidgets';
import { WidgetWeatherGradients } from '../../theme/CupertinoTheme';

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

describe('Unmigrated widgets keep the default glass frame (#934 scope)', () => {
  it('Battery keeps tint="dark" fixed in both light and dark theme', () => {
    const { getByTestId, toJSON } = render(
      <>
        <Controls />
        <BatteryWidget level={0.5} isCharging={false} />
      </>,
    );

    act(() => { fireEvent.press(getByTestId('set-light')); });
    let blurs = collectByType(toJSON() as TestJsonNode, 'BlurView');
    expect(blurs).toHaveLength(1);
    expect(blurs[0].props.tint).toBe('dark');

    act(() => { fireEvent.press(getByTestId('set-dark')); });
    blurs = collectByType(toJSON() as TestJsonNode, 'BlurView');
    expect(blurs[0].props.tint).toBe('dark');
  });

  it('falls back to the solid glass tone (no blur) when Reduce Transparency is on', () => {
    const { getByTestId, toJSON } = render(
      <>
        <Controls />
        <BatteryWidget level={0.5} isCharging={false} />
      </>,
    );
    act(() => { fireEvent.press(getByTestId('enable-reduce-transparency')); });

    expect(collectByType(toJSON() as TestJsonNode, 'BlurView')).toHaveLength(0);
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
