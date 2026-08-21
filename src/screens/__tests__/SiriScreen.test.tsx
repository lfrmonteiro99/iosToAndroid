import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import { SiriScreen } from '../SiriScreen';
import type { AppNavigationProp } from '../../navigation/types';
import type { InstalledApp } from '../../store/AppsStore';
import type { Alarm } from '../../utils/alarmScheduling';

const mockCreateQuickAlarm = jest.fn<Promise<Alarm>, [number, number, string?]>(
  (hour: number, minute: number, label?: string) =>
    Promise.resolve({
      id: 'quick-1',
      hour,
      minute,
      label: label?.trim() || 'Alarm',
      days: [],
      enabled: true,
      notificationIds: ['notification-id'],
    }),
);

// The whole module is replaced: SiriScreen only uses `createQuickAlarm` from it,
// and loading the real module pulls in expo-notifications' native channel manager.
jest.mock('../../utils/alarmScheduling', () => ({
  createQuickAlarm: (...args: [number, number, string?]) => mockCreateQuickAlarm(...args),
}));

const mockLaunchApp = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
const mockApps: InstalledApp[] = [
  { name: 'Calculator', packageName: 'com.iostoandroid.calculator', icon: '', isSystem: false },
  { name: 'Weather', packageName: 'com.iostoandroid.weather', icon: '', isSystem: false },
];

// Only `useApps` is stubbed: `AppsProvider` (used by test-utils) stays real, and
// the real provider yields an empty app list under jest because the native
// launcher module is unavailable, so app-matching could never be exercised.
jest.mock('../../store/AppsStore', () => {
  const actual = jest.requireActual('../../store/AppsStore');
  return {
    ...actual,
    useApps: () => ({ apps: mockApps, launchApp: mockLaunchApp }),
  };
});

/** The clock time the assistant speaks for a given hour/minute in this locale. */
function spokenTime(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function makeNav() {
  return { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() } as unknown as AppNavigationProp;
}

function submit(input: string, nav: AppNavigationProp = makeNav()) {
  const utils = render(<SiriScreen navigation={nav} />);
  const field = utils.getByLabelText('Ask Siri');
  fireEvent.changeText(field, input);
  fireEvent(field, 'submitEditing');
  return { ...utils, nav, field };
}

beforeEach(() => {
  mockLaunchApp.mockClear();
  mockCreateQuickAlarm.mockClear();
});

describe('SiriScreen', () => {
  it('renders without crashing and shows the text input', () => {
    const { getByLabelText, toJSON } = render(<SiriScreen navigation={makeNav()} />);
    expect(toJSON()).toBeTruthy();
    expect(getByLabelText('Ask Siri')).toBeTruthy();
  });

  // ── OPEN_APP ─────────────────────────────────────────────────────────────
  it('routes "Open Calculator" to launchApp with the Calculator package name', () => {
    const { nav } = submit('Open Calculator');
    expect(mockLaunchApp).toHaveBeenCalledWith('com.iostoandroid.calculator');
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('matches the app name case-insensitively and by substring', () => {
    submit('Open calcul');
    expect(mockLaunchApp).toHaveBeenCalledWith('com.iostoandroid.calculator');
  });

  it('shows a "Couldn\'t find" response and does not launch when no app matches', () => {
    const { getByText, nav } = submit('Open Photoshop');
    expect(getByText(/Couldn't find/i)).toBeTruthy();
    expect(getByText(/Photoshop/)).toBeTruthy();
    expect(mockLaunchApp).not.toHaveBeenCalled();
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  // ── CALL_CONTACT ─────────────────────────────────────────────────────────
  it('routes "Call Alice" to CallScreen with Alice\'s number', () => {
    const { nav } = submit('Call Alice');
    expect(nav.navigate).toHaveBeenCalledWith('CallScreen', {
      name: 'Alice Anderson',
      number: '+1 (555) 100-0001',
    });
  });

  it('matches a contact by last name too', () => {
    const { nav } = submit('Call anderson');
    expect(nav.navigate).toHaveBeenCalledWith('CallScreen', {
      name: 'Alice Anderson',
      number: '+1 (555) 100-0001',
    });
  });

  it('shows a "Couldn\'t find" response and does not navigate for an unknown contact', () => {
    const { getByText, nav } = submit('Call Zebediah');
    expect(getByText(/Couldn't find/i)).toBeTruthy();
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  // ── SEND_MESSAGE ─────────────────────────────────────────────────────────
  it('routes "Send message to Alice" to Conversation with her phone as address', () => {
    const { nav } = submit('Send message to Alice');
    expect(nav.navigate).toHaveBeenCalledWith('Conversation', { address: '+1 (555) 100-0001' });
  });

  it('does not navigate to Conversation for an unknown message recipient', () => {
    const { getByText, nav } = submit('Send a message to Nobody');
    expect(getByText(/Couldn't find/i)).toBeTruthy();
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  // ── WHAT_TIME ────────────────────────────────────────────────────────────
  it('answers "What time is it" with the current time and navigates nowhere', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 0, 2, 14, 5, 0));
    try {
      const { getByText, nav } = submit('What time is it');
      const expected = new Date(2026, 0, 2, 14, 5, 0).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      });
      expect(getByText(`It's ${expected}`)).toBeTruthy();
      expect(nav.navigate).not.toHaveBeenCalled();
      expect(mockLaunchApp).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  // ── SET_ALARM ────────────────────────────────────────────────────────────
  it('creates the alarm and confirms the time, without navigating', async () => {
    const { getByText, nav } = submit('Set alarm for 7:30 am');
    await waitFor(() => expect(getByText(`Alarm set for ${spokenTime(7, 30)}`)).toBeTruthy());
    expect(mockCreateQuickAlarm).toHaveBeenCalledWith(7, 30);
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('passes a 12-hour PM command through as a 24-hour hour', async () => {
    const { getByText } = submit('Set alarm for 7pm');
    await waitFor(() => expect(getByText(`Alarm set for ${spokenTime(19, 0)}`)).toBeTruthy());
    expect(mockCreateQuickAlarm).toHaveBeenCalledWith(19, 0);
  });

  it('creates two alarms when the command is repeated', async () => {
    const nav = makeNav();
    const { getByLabelText } = render(<SiriScreen navigation={nav} />);
    const field = getByLabelText('Ask Siri');
    fireEvent.changeText(field, 'Set alarm for 7pm');
    fireEvent(field, 'submitEditing');
    fireEvent.changeText(field, 'Set alarm for 8pm');
    fireEvent(field, 'submitEditing');
    await waitFor(() => expect(mockCreateQuickAlarm).toHaveBeenCalledTimes(2));
    expect(mockCreateQuickAlarm).toHaveBeenNthCalledWith(1, 19, 0);
    expect(mockCreateQuickAlarm).toHaveBeenNthCalledWith(2, 20, 0);
  });

  it('reports a failure instead of a confirmation when createQuickAlarm rejects', async () => {
    mockCreateQuickAlarm.mockRejectedValueOnce(new Error('storage full'));
    const { getByText, queryByText, nav } = submit('Set alarm for 7pm');
    await waitFor(() => expect(getByText(/couldn't set that alarm/i)).toBeTruthy());
    expect(queryByText(/alarm set for/i)).toBeNull();
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('does not create an alarm for an unparseable time (stays unrecognized)', () => {
    const { getByText } = submit('Set alarm for banana');
    expect(mockCreateQuickAlarm).not.toHaveBeenCalled();
    expect(getByText(/not supported yet|didn't catch/i)).toBeTruthy();
  });

  // ── UNRECOGNIZED ─────────────────────────────────────────────────────────

  it('responds to an unrecognized command without throwing or navigating', () => {
    const { getByText, nav } = submit('Make me a sandwich');
    expect(getByText(/not supported yet|didn't catch/i)).toBeTruthy();
    expect(nav.navigate).not.toHaveBeenCalled();
    expect(mockLaunchApp).not.toHaveBeenCalled();
  });

  // ── Empty / boundary input ───────────────────────────────────────────────
  it('ignores an empty submit: no navigation, no launch, no response text change', () => {
    const nav = makeNav();
    const { getByLabelText, queryByText } = render(<SiriScreen navigation={nav} />);
    fireEvent(getByLabelText('Ask Siri'), 'submitEditing');
    expect(nav.navigate).not.toHaveBeenCalled();
    expect(mockLaunchApp).not.toHaveBeenCalled();
    expect(queryByText(/Couldn't find/i)).toBeNull();
  });

  it('ignores a whitespace-only submit', () => {
    const nav = makeNav();
    const { getByLabelText, queryByText } = render(<SiriScreen navigation={nav} />);
    fireEvent.changeText(getByLabelText('Ask Siri'), '   ');
    fireEvent(getByLabelText('Ask Siri'), 'submitEditing');
    expect(nav.navigate).not.toHaveBeenCalled();
    expect(mockLaunchApp).not.toHaveBeenCalled();
    expect(queryByText(/Couldn't find/i)).toBeNull();
  });

  // ── Repetition / order ───────────────────────────────────────────────────
  it('launches twice when the same command is submitted twice (no stale-state swallow)', () => {
    const nav = makeNav();
    const { getByLabelText } = render(<SiriScreen navigation={nav} />);
    const field = getByLabelText('Ask Siri');
    fireEvent.changeText(field, 'Open Calculator');
    fireEvent(field, 'submitEditing');
    fireEvent.changeText(field, 'Open Calculator');
    fireEvent(field, 'submitEditing');
    expect(mockLaunchApp).toHaveBeenCalledTimes(2);
  });

  it('clears the previous "couldn\'t find" answer once a later command succeeds', () => {
    const nav = makeNav();
    const { getByLabelText, queryByText } = render(<SiriScreen navigation={nav} />);
    const field = getByLabelText('Ask Siri');
    fireEvent.changeText(field, 'Open Photoshop');
    fireEvent(field, 'submitEditing');
    expect(queryByText(/Couldn't find/i)).toBeTruthy();
    fireEvent.changeText(field, 'Open Calculator');
    fireEvent(field, 'submitEditing');
    expect(queryByText(/Couldn't find/i)).toBeNull();
  });

  // ── Async ────────────────────────────────────────────────────────────────
  it('does not throw when launchApp rejects', () => {
    mockLaunchApp.mockRejectedValueOnce(new Error('launch failed'));
    expect(() => submit('Open Calculator')).not.toThrow();
    expect(mockLaunchApp).toHaveBeenCalledWith('com.iostoandroid.calculator');
  });
});
