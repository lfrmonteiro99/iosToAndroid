import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import { SiriScreen } from '../SiriScreen';
import type { AppNavigationProp } from '../../navigation/types';
import type { InstalledApp } from '../../store/AppsStore';
import * as Speech from 'expo-speech';

// expo-speech is a native module with no implementation under jest; mock it
// the same way ClockScreen.test.tsx mocks expo-notifications.
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
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
  (Speech.speak as jest.Mock).mockClear();
  (Speech.stop as jest.Mock).mockClear();
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

  // ── SET_ALARM / UNRECOGNIZED ─────────────────────────────────────────────
  it('tells the user alarms are not supported yet, without navigating', () => {
    const { getByText, nav } = submit('Set alarm for 7:30 am');
    expect(getByText(/not supported yet/i)).toBeTruthy();
    expect(nav.navigate).not.toHaveBeenCalled();
  });

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

  // ── Speech (issue #256) ──────────────────────────────────────────────────
  it('speaks the response exactly once when a command yields a response', () => {
    submit('Open Calculator');
    expect(Speech.speak).toHaveBeenCalledTimes(1);
    expect(Speech.speak).toHaveBeenCalledWith('Opening Calculator.');
  });

  it('does not speak the greeting on initial mount', () => {
    render(<SiriScreen navigation={makeNav()} />);
    expect(Speech.speak).not.toHaveBeenCalled();
  });

  it('speaks the launchApp-failure response when launchApp rejects', async () => {
    mockLaunchApp.mockRejectedValueOnce(new Error('launch failed'));
    submit('Open Calculator');
    // Success response set synchronously, failure response set in async .catch.
    expect(Speech.speak).toHaveBeenCalledWith('Opening Calculator.');
    await waitFor(() =>
      expect(Speech.speak).toHaveBeenCalledWith("Couldn't open Calculator."),
    );
    expect(Speech.speak).toHaveBeenCalledTimes(2);
  });

  it('calls stopSpeaking (Speech.stop) on unmount', () => {
    const { unmount } = render(<SiriScreen navigation={makeNav()} />);
    expect(Speech.stop).not.toHaveBeenCalled();
    unmount();
    expect(Speech.stop).toHaveBeenCalledTimes(1);
  });

  it('does not double-speak when the same response text is set twice in a row', () => {
    const nav = makeNav();
    const { getByLabelText } = render(<SiriScreen navigation={nav} />);
    const field = getByLabelText('Ask Siri');
    fireEvent.changeText(field, 'Open Calculator');
    fireEvent(field, 'submitEditing');
    fireEvent.changeText(field, 'Open Calculator');
    fireEvent(field, 'submitEditing');
    expect(Speech.speak).toHaveBeenCalledTimes(1);
  });
});
