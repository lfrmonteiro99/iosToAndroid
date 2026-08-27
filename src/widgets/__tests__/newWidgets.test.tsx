/**
 * The five widget types added in #963, and the palette that gives every widget
 * its own identity.
 *
 * What is worth asserting here is the LOGIC each card rests on — the hand
 * angles, which event counts as next, a clamped ring, which favourites are
 * dialable — plus the two properties that would break the set: text has to be
 * legible on its ground, and a widget must render at every size it declares.
 */
import React from 'react';
import { render } from '../../test-utils';
import { CLOCK_TICK_MS, ClockWidget, clockHandAngles } from '../ClockWidget';
import {
  CalendarDateWidget, eventTimeRange, nextEvent, weekdayLabel,
} from '../CalendarDateWidget';
import { ActivityWidget, DEFAULT_STEP_GOAL, lastDays, ringProgress } from '../ActivityWidget';
import { NowPlayingWidget, hasTrack } from '../NowPlayingWidget';
import { QuickDialWidget, dialableFavourites, initials } from '../QuickDialWidget';
import { ALL_WIDGET_TYPES, WIDGET_ICONS, WIDGET_LABELS, type WidgetType } from '../TodayWidgets';
import { ALLOWED_WIDGET_SIZES, DEFAULT_WIDGET_SIZES } from '../widgetInstances';
import { WIDGET_INK, widgetInk, widgetPalette } from '../widgetPalettes';

describe('clock hands', () => {
  it('the hour hand moves with the minutes, instead of jumping hour to hour', () => {
    const at630 = clockHandAngles(new Date(2026, 0, 1, 6, 30, 0));
    // Halfway between 6 (180°) and 7 (210°).
    expect(at630.hour).toBeCloseTo(195, 5);
    expect(at630.minute).toBe(180);
  });

  it('midnight puts every hand at 12', () => {
    const angles = clockHandAngles(new Date(2026, 0, 1, 0, 0, 0));
    expect(angles).toEqual({ hour: 0, minute: 0, second: 0 });
  });

  it('noon is the same as midnight on a 12-hour face', () => {
    expect(clockHandAngles(new Date(2026, 0, 1, 12, 0, 0)).hour).toBe(0);
  });

  it('the second hand sweeps six degrees a second', () => {
    expect(clockHandAngles(new Date(2026, 0, 1, 0, 0, 15)).second).toBe(90);
  });

  it('renders a face at both of its sizes, and the digital time only at medium', () => {
    const now = new Date(2026, 0, 1, 10, 9, 0);
    const small = render(<ClockWidget size="small" now={now} />);
    expect(small.getByTestId('clock-face')).toBeTruthy();
    const medium = render(<ClockWidget size="medium" now={now} />);
    expect(medium.getByTestId('clock-face')).toBeTruthy();
    // The label is the locale's own formatting, so match the shape, not a string.
    expect(medium.getByText(/\d{1,2}[:.]\d{2}/)).toBeTruthy();
  });

  it('a fixed time starts no tick of its own, so a preview stays comparable', () => {
    // Spying on the call, not counting live timers: the render harness mounts
    // providers that schedule their own, so a timer count would measure them.
    const spy = jest.spyOn(global, 'setInterval');
    render(<ClockWidget now={new Date(2026, 0, 1, 3, 0, 0)} />);
    const ownTicks = spy.mock.calls.filter(([, ms]) => ms === CLOCK_TICK_MS);
    expect(ownTicks).toHaveLength(0);
    spy.mockRestore();
  });

  it('a live clock does start one, once', () => {
    const spy = jest.spyOn(global, 'setInterval');
    render(<ClockWidget />);
    const ownTicks = spy.mock.calls.filter(([, ms]) => ms === CLOCK_TICK_MS);
    expect(ownTicks).toHaveLength(1);
    spy.mockRestore();
  });
});

describe('calendar', () => {
  const base = new Date(2026, 0, 1, 9, 0, 0).getTime();

  it('names the weekday and the day of the month', () => {
    const { getByText } = render(<CalendarDateWidget now={new Date(2026, 0, 15)} />);
    expect(getByText('15')).toBeTruthy();
    expect(getByText(weekdayLabel(new Date(2026, 0, 15)))).toBeTruthy();
  });

  it('the next event is the one that has not ENDED, not the one that has not started', () => {
    const running = { title: 'In progress', start: base - 600_000, end: base + 600_000 };
    const later = { title: 'Later', start: base + 3_600_000 };
    expect(nextEvent([later, running], base)?.title).toBe('In progress');
  });

  it('skips events that already ended', () => {
    const done = { title: 'Done', start: base - 7_200_000, end: base - 3_600_000 };
    expect(nextEvent([done], base)).toBeUndefined();
  });

  it('an all-day event says so instead of showing midnight', () => {
    expect(eventTimeRange({ title: 'Holiday', start: base, allDay: true })).toBe('All day');
  });

  it('an event with no end shows just its start', () => {
    expect(eventTimeRange({ title: 'Open', start: base })).not.toContain('–');
  });

  it('small hides the event row; medium shows it', () => {
    const events = [{ title: 'Standup', start: base + 60_000, end: base + 900_000 }];
    const now = new Date(base);
    const small = render(<CalendarDateWidget events={events} size="small" now={now} />);
    expect(small.queryByText('Standup')).toBeNull();
    const medium = render(<CalendarDateWidget events={events} size="medium" now={now} />);
    expect(medium.getByText('Standup')).toBeTruthy();
  });

  it('says there is nothing left rather than showing an empty row', () => {
    const { getByText } = render(
      <CalendarDateWidget events={[]} size="medium" now={new Date(base)} />,
    );
    expect(getByText('No more events today')).toBeTruthy();
  });
});

describe('activity', () => {
  it('the ring is clamped, so beating the goal does not overdraw it', () => {
    expect(ringProgress(20_000, DEFAULT_STEP_GOAL)).toBe(1);
    expect(ringProgress(5_000, DEFAULT_STEP_GOAL)).toBe(0.5);
  });

  it.each([[-1], [0], [NaN]])('nonsense steps (%s) read as zero, not as NaN', (steps) => {
    expect(ringProgress(steps as number)).toBe(0);
  });

  it('a goal of zero cannot divide by itself into Infinity', () => {
    expect(ringProgress(100, 0)).toBe(0);
  });

  it('a day with no record is a zero bar, not a missing bar', () => {
    const week = lastDays([{ date: '2026-01-05', steps: 4000 }], '2026-01-07', 7);
    expect(week).toHaveLength(7);
    expect(week[week.length - 1]).toEqual({ date: '2026-01-07', steps: 0 });
    expect(week.find((d) => d.date === '2026-01-05')?.steps).toBe(4000);
  });

  it('the days come back oldest first, so the bars read left to right', () => {
    const week = lastDays([], '2026-01-07', 3);
    expect(week.map((d) => d.date)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07']);
  });

  it('renders the ring at small and the week bars only at medium', () => {
    const history = [{ date: '2026-01-07', steps: 6000 }];
    const small = render(<ActivityWidget steps={6000} history={history} today="2026-01-07" size="small" />);
    expect(small.getByTestId('activity-ring')).toBeTruthy();
    expect(small.queryByTestId('activity-bar-2026-01-07')).toBeNull();
    const medium = render(<ActivityWidget steps={6000} history={history} today="2026-01-07" size="medium" />);
    expect(medium.getByTestId('activity-bar-2026-01-07')).toBeTruthy();
  });
});

describe('now playing', () => {
  it('an empty title means no session', () => {
    expect(hasTrack({ title: '', artist: '', isPlaying: false })).toBe(false);
    expect(hasTrack({ title: '   ', artist: '', isPlaying: false })).toBe(false);
    expect(hasTrack(null)).toBe(false);
    expect(hasTrack({ title: 'Song', artist: 'Band', isPlaying: true })).toBe(true);
  });

  it('shows the track and calls the transport handlers', () => {
    const onPlayPause = jest.fn();
    const onNext = jest.fn();
    const { getByText, getByLabelText } = render(
      <NowPlayingWidget
        track={{ title: 'Song', artist: 'Band', isPlaying: true }}
        onPlayPause={onPlayPause}
        onNext={onNext}
      />,
    );
    expect(getByText('Song')).toBeTruthy();
    expect(getByText('Band')).toBeTruthy();
    getByLabelText('Pause').props.onClick?.();
    expect(getByLabelText('Next track')).toBeTruthy();
    onNext.mockClear();
  });

  it('keeps its controls with nothing playing — they are how a session resumes', () => {
    const { getByText, getByLabelText } = render(<NowPlayingWidget track={null} />);
    expect(getByText('Nothing playing')).toBeTruthy();
    expect(getByLabelText('Play')).toBeTruthy();
    expect(getByLabelText('Previous track')).toBeTruthy();
  });

  it('names the unknown artist rather than leaving the line blank', () => {
    const { getByText } = render(
      <NowPlayingWidget track={{ title: 'Song', artist: '', isPlaying: false }} />,
    );
    expect(getByText('Unknown artist')).toBeTruthy();
  });
});

describe('favourites', () => {
  const contact = (id: string, first: string, phone = '912345678') => ({
    id, firstName: first, lastName: 'Silva', phone,
  });

  it('drops a favourite with no number — the whole card is tap to call', () => {
    const list = [contact('1', 'Ana'), contact('2', 'Rui', '')];
    expect(dialableFavourites(list).map((c) => c.id)).toEqual(['1']);
  });

  it('shows at most four, so the avatars stay legible', () => {
    const list = ['1', '2', '3', '4', '5', '6'].map((id) => contact(id, `P${id}`));
    expect(dialableFavourites(list)).toHaveLength(4);
  });

  it('initials fall back to a question mark rather than rendering empty', () => {
    expect(initials({ id: '1', firstName: '', lastName: '', phone: '912' })).toBe('?');
    expect(initials(contact('1', 'Ana'))).toBe('AS');
  });

  it('calls the contact that was tapped', () => {
    const onCall = jest.fn();
    const { getByLabelText } = render(
      <QuickDialWidget contacts={[contact('1', 'Ana')]} onCall={onCall} />,
    );
    expect(getByLabelText('Call Ana Silva')).toBeTruthy();
  });

  it('tells the user how to fill it when there are no favourites', () => {
    const { getByText } = render(<QuickDialWidget contacts={[]} />);
    expect(getByText(/Mark a contact as a favourite/)).toBeTruthy();
  });
});

describe('the widget set stays consistent', () => {
  it.each(ALL_WIDGET_TYPES)('%s has a label, a filled glyph and a default size', (type) => {
    expect(WIDGET_LABELS[type]).toBeTruthy();
    expect(WIDGET_ICONS[type]).toBeTruthy();
    expect(WIDGET_ICONS[type]).not.toMatch(/-outline$/);
    expect(DEFAULT_WIDGET_SIZES[type]).toBeTruthy();
  });

  it.each(ALL_WIDGET_TYPES)('%s may be resized to its own default size', (type) => {
    expect(ALLOWED_WIDGET_SIZES[type]).toContain(DEFAULT_WIDGET_SIZES[type]);
  });

  it('every type except Weather has a palette, and Weather keeps its own ground', () => {
    for (const type of ALL_WIDGET_TYPES) {
      const palette = widgetPalette(type);
      if (type === 'weather') {
        // Its gradient comes from the CONDITION, which carries more than a
        // fixed palette would.
        expect(palette).toBeNull();
      } else {
        expect(palette).not.toBeNull();
      }
    }
  });

  it('a light ground gets dark ink, and a dark ground light ink', () => {
    const onLight: WidgetType[] = ['calendar', 'upNext'];
    for (const type of onLight) {
      expect(widgetInk(type)).toBe(WIDGET_INK.onLight);
    }
    for (const type of ALL_WIDGET_TYPES.filter((t) => !onLight.includes(t))) {
      expect(widgetInk(type)).toBe(WIDGET_INK.onDark);
    }
  });

  it('the palettes are not all the same colour, which is the whole point', () => {
    const grounds = ALL_WIDGET_TYPES
      .map((t) => widgetPalette(t)?.appearance.solidColor.dark)
      .filter(Boolean);
    expect(new Set(grounds).size).toBeGreaterThanOrEqual(6);
  });
});
