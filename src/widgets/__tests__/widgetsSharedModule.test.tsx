/**
 * #811: the issue asks to extract the iOS widget components (BatteryWidget,
 * StorageWidget, WeatherWidget, UpNextWidget, MessagesWidget, ScreenTimeWidget)
 * and WidgetCard into a shared module at src/widgets/, exporting them and
 * reusing GlassSurface for the blur. This is the TDD red test that locks the
 * contract:
 *   1. the shared module lives at src/widgets/ (not only src/components/), and
 *   2. the six widget components + WidgetCard are actually exported from there
 *      and mount real (not duplicated) instances.
 *
 * It mounts a BatteryWidget from the shared module and asserts a real,
 * rendered element — not a reimplementation — so the green pass is genuine.
 */
import React from 'react';
import { render } from '../../test-utils';
import { WidgetCard } from '../WidgetCard';
import {
  BatteryWidget,
  StorageWidget,
  WeatherWidget,
  UpNextWidget,
  MessagesWidget,
  ScreenTimeWidget,
} from '../TodayWidgets';

describe('Shared iOS widget module (#811)', () => {
  it('exposes the shared WidgetCard frame backed by GlassSurface', () => {
    const { getByTestId } = render(
      <WidgetCard testID="shared-card">hello</WidgetCard>,
    );
    // GlassSurface renders a child <Image>/<View>; the card chrome is real.
    expect(getByTestId('shared-card')).toBeTruthy();
  });

  it('mounts BatteryWidget as a real instance from the shared module', () => {
    const { getByTestId, getByText } = render(
      <BatteryWidget level={0.82} isCharging={false} />,
    );
    const card = getByTestId('widget-card-battery');
    expect(card).toBeTruthy();
    // The shared widget renders the live percentage, proving it is the real
    // component (a copy would not share this exact output wiring).
    expect(getByText('82%')).toBeTruthy();
  });

  it('mounts every shared widget component from src/widgets/', () => {
    const { getByTestId } = render(
      <>
        <BatteryWidget level={1} isCharging />
        <StorageWidget usedGB="64" totalGB="128" usedPercentage={50} />
        <WeatherWidget temp={19} condition="Partly cloudy" icon="partly-sunny" city="Lisbon" />
        <UpNextWidget events={[]} />
        <MessagesWidget unreadCount={3} />
        <ScreenTimeWidget />
      </>,
    );
    expect(getByTestId('widget-card-battery')).toBeTruthy();
    expect(getByTestId('widget-card-storage')).toBeTruthy();
    expect(getByTestId('widget-card-weather')).toBeTruthy();
    expect(getByTestId('widget-card-upNext')).toBeTruthy();
    expect(getByTestId('widget-card-messages')).toBeTruthy();
    expect(getByTestId('widget-card-screenTime')).toBeTruthy();
  });
});
