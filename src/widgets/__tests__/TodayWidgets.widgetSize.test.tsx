/**
 * #937 AC 8: "O conteúdo do widget difere entre tamanhos — não é o layout
 * pequeno esticado."
 *
 * Only Weather and Up Next declare more than one ALLOWED_WIDGET_SIZES entry
 * (widgetInstances.ts) — the other four are single-stat widgets with nothing
 * in the rest of the app's data to fill a bigger card without inventing it,
 * so they stay single-size and have no content-by-size to test here. These
 * two are exactly where the issue's "not the small layout stretched" claim is
 * checkable: hide/show real fields (city, H/L range, event count), not resize
 * a container.
 */
import React from 'react';
import { render } from '../../test-utils';
import { WeatherWidget, UpNextWidget, type CalendarEventItem } from '../TodayWidgets';

const WEATHER_PROPS = {
  temp: 22,
  condition: 'Sunny',
  icon: 'sunny',
  city: 'Lisbon',
  maxTemp: 25,
  minTemp: 15,
};

describe('WeatherWidget content by size (#937)', () => {
  it('small hides the city and the H/L range', () => {
    const { queryByText } = render(<WeatherWidget {...WEATHER_PROPS} size="small" />);
    expect(queryByText('Lisbon')).toBeNull();
    expect(queryByText('H:25°  L:15°')).toBeNull();
  });

  it('medium shows the city and the H/L range', () => {
    const { queryByText } = render(<WeatherWidget {...WEATHER_PROPS} size="medium" />);
    expect(queryByText('Lisbon')).toBeTruthy();
    expect(queryByText('H:25°  L:15°')).toBeTruthy();
  });

  it('large also shows the city and the H/L range', () => {
    const { queryByText } = render(<WeatherWidget {...WEATHER_PROPS} size="large" />);
    expect(queryByText('Lisbon')).toBeTruthy();
    expect(queryByText('H:25°  L:15°')).toBeTruthy();
  });

  it('omitting size keeps the full content — every existing caller (Today View, gallery preview)', () => {
    const { queryByText } = render(<WeatherWidget {...WEATHER_PROPS} />);
    expect(queryByText('Lisbon')).toBeTruthy();
    expect(queryByText('H:25°  L:15°')).toBeTruthy();
  });
});

const EVENTS: CalendarEventItem[] = [
  { id: '1', title: 'Standup', start: 1000, end: 2000, allDay: false, location: '' },
  { id: '2', title: 'Lunch', start: 3000, end: 4000, allDay: false, location: '' },
  { id: '3', title: 'Review', start: 5000, end: 6000, allDay: false, location: '' },
];

describe('UpNextWidget content by size (#937)', () => {
  it('medium shows only the next event', () => {
    const { queryByText } = render(<UpNextWidget events={EVENTS} size="medium" />);
    expect(queryByText('Standup')).toBeTruthy();
    expect(queryByText('Lunch')).toBeNull();
    expect(queryByText('Review')).toBeNull();
  });

  it('large shows up to 3 events', () => {
    const { queryByText } = render(<UpNextWidget events={EVENTS} size="large" />);
    expect(queryByText('Standup')).toBeTruthy();
    expect(queryByText('Lunch')).toBeTruthy();
    expect(queryByText('Review')).toBeTruthy();
  });

  it('omitting size keeps the full up-to-3 content — every existing caller', () => {
    const { queryByText } = render(<UpNextWidget events={EVENTS} />);
    expect(queryByText('Standup')).toBeTruthy();
    expect(queryByText('Lunch')).toBeTruthy();
    expect(queryByText('Review')).toBeTruthy();
  });
});
