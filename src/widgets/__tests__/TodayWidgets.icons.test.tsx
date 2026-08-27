/**
 * #934, point 6 of "O que fazer": «Glifos preenchidos em vez de `-outline`».
 *
 * `WIDGET_ICONS` is the per-type glyph table used by the "Edit Widgets" panel
 * (`TodayViewScreen.tsx:106`). The widget bodies themselves were already drawn
 * with filled glyphs (`server`, `calendar`, `chatbubble-ellipses`,
 * `hourglass`), so the outline table was the last place where the six types
 * still read as thin, monochrome line art — the exact row the issue's
 * reference table calls out ("Glifos | preenchidos, de marca | Ionicons
 * -outline | WIDGET_ICONS, TodayWidgets.tsx:36").
 *
 * Two layers on purpose:
 *   1. the exported constant (cheap, names the exact glyph per type);
 *   2. the rendered Edit Widgets panel (end-to-end — proves the panel really
 *      paints those glyphs and not the outline ones).
 */
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { render, fireEvent } from '../../test-utils';
import { ALL_WIDGET_TYPES, WIDGET_ICONS } from '../TodayWidgets';
import { TodayViewScreen } from '../../screens/TodayViewScreen';
import type { AppNavigationProp } from '../../navigation/types';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() } as unknown as AppNavigationProp;

/**
 * The outline glyphs shipped before this issue — none may come back.
 *
 * Only the six types that existed then: a type added later never had an outline
 * glyph to regress to, and listing one here would assert against a string the
 * repo has never contained.
 */
const LEGACY_OUTLINE_ICONS: Record<string, string> = {
  storage: 'server-outline',
  weather: 'partly-sunny-outline',
  upNext: 'calendar-outline',
  messages: 'chatbubble-ellipses-outline',
  screenTime: 'hourglass-outline',
};

describe('WIDGET_ICONS uses filled glyphs (#934)', () => {
  it.each([
    ['battery', 'battery-full'],
    ['storage', 'server'],
    ['weather', 'partly-sunny'],
    ['upNext', 'calendar'],
    ['messages', 'chatbubble-ellipses'],
    ['screenTime', 'hourglass'],
  ] as const)('%s maps to the filled glyph "%s"', (type, glyph) => {
    expect(WIDGET_ICONS[type]).toBe(glyph);
  });

  it('has no "-outline" glyph left for any of the six types', () => {
    const outlined = ALL_WIDGET_TYPES.filter((t) => WIDGET_ICONS[t].endsWith('-outline'));
    expect(outlined).toEqual([]);
  });

  it('covers every widget type exactly once (boundary: the table cannot drift from ALL_WIDGET_TYPES)', () => {
    expect(Object.keys(WIDGET_ICONS).sort()).toEqual([...ALL_WIDGET_TYPES].sort());
  });

  it('every glyph is a real Ionicons name (a typo would render nothing at all)', () => {
    for (const type of ALL_WIDGET_TYPES) {
      expect(Ionicons.glyphMap).toHaveProperty(WIDGET_ICONS[type]);
    }
  });
});

describe('Edit Widgets panel paints the filled glyphs (#934, end-to-end)', () => {
  /** Ionicons names rendered by the Edit Widgets panel. */
  function renderedIconNames(): string[] {
    const view = render(<TodayViewScreen navigation={mockNavigation} />);
    fireEvent.press(view.getByText('Edit Widgets'));
    return view.UNSAFE_getAllByType(Ionicons).map((n) => String(n.props.name));
  }

  it('renders the filled glyph of every widget type', () => {
    const names = renderedIconNames();
    for (const type of ALL_WIDGET_TYPES) {
      expect(names).toContain(WIDGET_ICONS[type]);
    }
  });

  it('renders none of the legacy outline glyphs (the inverse of the fix)', () => {
    const names = renderedIconNames();
    for (const legacy of Object.values(LEGACY_OUTLINE_ICONS)) {
      expect(names).not.toContain(legacy);
    }
  });
});
