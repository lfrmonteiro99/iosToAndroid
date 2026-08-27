/**
 * The rules taken from Apple's own guidance for widgets (#965), asserted rather
 * than remembered.
 *
 * Sources, quoted in the assertions below:
 *  - HIG, Widgets: "Small widgets use their limited space to typically show a
 *    single piece of information while larger sizes support additional layers of
 *    information and actions"; "use the standard margin width for widgets — 16
 *    points for most widgets"; "display text using fonts at 11 points or
 *    larger"; "Balance information density".
 *  - The stock small Forecast widget shows current temperature, daily high/low
 *    and current conditions.
 *  - iOS 18 Tinted appearance: the chosen colour "shows up virtually everywhere
 *    on the Home Screen", widgets included, rendered in the accented mode.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { Pressable, Text } from 'react-native';
import { render, fireEvent, act } from '../../test-utils';
import { BatteryWidget, StorageWidget, WeatherWidget } from '../TodayWidgets';
import { ClockWidget } from '../ClockWidget';
import { clampProgress } from '../WidgetRing';
import { WIDGET_INK, shadeHex, systemTintPalette, widgetSurface, widgetPalette } from '../widgetPalettes';
import { useSettings } from '../../store/SettingsStore';

const WIDGETS_DIR = path.resolve(__dirname, '..');

function widgetSources(): { file: string; text: string }[] {
  return fs.readdirSync(WIDGETS_DIR)
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => ({ file: f, text: fs.readFileSync(path.join(WIDGETS_DIR, f), 'utf8') }));
}

describe('the small card shows one figure, not five', () => {
  it('Battery is a ring with the percentage inside — no bar, no caption stack', () => {
    const { getByTestId, getByText, queryByText } = render(
      <BatteryWidget level={0.42} isCharging={false} />,
    );
    expect(getByTestId('battery-ring')).toBeTruthy();
    expect(getByText('42%')).toBeTruthy();
    // The pieces the density rule removes.
    expect(queryByText('On battery')).toBeNull();
    expect(queryByText('42%')).toBeTruthy();
  });

  it('Storage is a ring with the used share inside, and the total as its one line', () => {
    const { getByTestId, getByText, queryByText, getByLabelText } = render(
      <StorageWidget usedGB="89.3" totalGB="128.0" usedPercentage={70} />,
    );
    expect(getByLabelText('Storage: 89.3 GB of 128.0 GB used')).toBeTruthy();
    expect(getByTestId('storage-ring')).toBeTruthy();
    expect(getByText('70%')).toBeTruthy();
    // The caption names the widget; the GB figures move to the label, since a
    // ring reading "70%" beside a Battery ring reading "42%" needs to say which
    // is which.
    expect(getByText('Storage')).toBeTruthy();
    expect(queryByText('70% full')).toBeNull();
    expect(queryByText('89.3 GB')).toBeNull();
  });

  it('the ring cannot overdraw or read as NaN', () => {
    expect(clampProgress(1.7)).toBe(1);
    expect(clampProgress(-1)).toBe(0);
    expect(clampProgress(NaN)).toBe(0);
    expect(clampProgress(0.25)).toBe(0.25);
  });

  it('charging is shown inside the ring rather than as a line of prose', () => {
    const charging = render(<BatteryWidget level={0.42} isCharging />);
    expect(charging.getByTestId('battery-charging-bolt')).toBeTruthy();
    // The state still reaches VoiceOver, through the card's own label.
    expect(charging.getByLabelText(/charging/i)).toBeTruthy();
    expect(render(<BatteryWidget level={0.42} isCharging={false} />)
      .queryByTestId('battery-charging-bolt')).toBeNull();
  });
});

describe('the small Weather card matches the stock one', () => {
  const PROPS = {
    temp: 20, condition: 'Clear', icon: 'sunny', city: 'Lisbon', maxTemp: 25, minTemp: 15,
  };

  it('keeps the temperature, the condition, the city and the high/low', () => {
    const { getByText } = render(<WeatherWidget {...PROPS} size="small" />);
    expect(getByText('20°')).toBeTruthy();
    expect(getByText('Clear')).toBeTruthy();
    expect(getByText('Lisbon')).toBeTruthy();
    expect(getByText('H:25°  L:15°')).toBeTruthy();
  });

  it('drops the redundant title row at small, and keeps it at medium', () => {
    expect(render(<WeatherWidget {...PROPS} size="small" />).queryByText('Weather')).toBeNull();
    expect(render(<WeatherWidget {...PROPS} size="medium" />).getByText('Weather')).toBeTruthy();
  });
});

// A control to flip the tinted-icons setting from inside the providers.
function TintControls() {
  const { update } = useSettings();
  return (
    <Pressable
      testID="enable-tint"
      onPress={() => { update('iconTintEnabled', true); update('iconTintColor', '#FF3B30'); }}
    >
      <Text>tint</Text>
    </Pressable>
  );
}

describe('widgets follow the tinted home screen, as iOS does', () => {
  it('the system tint replaces the type palette', () => {
    const tinted = widgetSurface('battery', undefined, '#FF3B30');
    expect(tinted?.appearance.gradientColors?.[0]).toBe('#FF3B30');
    expect(tinted?.accent).toBe('#FFFFFF');
    // Accented rendering tints primary content white.
    expect(WIDGET_INK[tinted!.ink]).toBe(WIDGET_INK.onDark);
  });

  it('the system tint outranks a per-widget tint — it is a statement about the whole screen', () => {
    const tinted = widgetSurface('battery', { tint: 'paper' }, '#0A84FF');
    expect(tinted?.appearance.gradientColors?.[0]).toBe('#0A84FF');
  });

  it('with no system tint, the per-widget tint and then the type palette decide', () => {
    expect(widgetSurface('battery', undefined, null)).toBe(widgetPalette('battery'));
    expect(widgetSurface('battery', { tint: 'pink' }, null)?.appearance.gradientColors?.[0])
      .toBe('#D8497A');
  });

  it('a malformed tint colour degrades instead of throwing inside a render', () => {
    expect(shadeHex('not a colour', 0.5)).toBe('not a colour');
    expect(() => systemTintPalette('rgb(1,2,3)')).not.toThrow();
  });

  it('the darker gradient stop is darker, and stays a valid hex', () => {
    expect(shadeHex('#FF3B30', 0.55)).toMatch(/^#[0-9a-f]{6}$/);
    expect(shadeHex('#FFFFFF', 0.55)).toBe('#8c8c8c');
    expect(shadeHex('#000000', 0.55)).toBe('#000000');
  });
});

describe('the numbers Apple states', () => {
  it('no widget renders text below 11 points', () => {
    // "In general, display text using fonts at 11 points or larger."
    const offenders: string[] = [];
    for (const { file, text } of widgetSources()) {
      for (const [i, line] of text.split('\n').entries()) {
        if (/^\s*(\/\/|\*)/.test(line)) continue;
        for (const m of line.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)) {
          if (Number(m[1]) < 11) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the card keeps the 16-point standard margin', () => {
    // "Use the standard margin width for widgets — 16 points for most widgets."
    const card = fs.readFileSync(path.join(WIDGETS_DIR, 'WidgetCard.tsx'), 'utf8');
    expect(card).toMatch(/padding:\s*16/);
  });

  it('a tinted clock still draws its face — the tint changes the ground, not the content', () => {
    const { getByTestId, getByTestId: byId } = render(
      <>
        <TintControls />
        <ClockWidget now={new Date(2026, 0, 1, 10, 9)} />
      </>,
    );
    act(() => { fireEvent.press(byId('enable-tint')); });
    expect(getByTestId('clock-face')).toBeTruthy();
  });
});
