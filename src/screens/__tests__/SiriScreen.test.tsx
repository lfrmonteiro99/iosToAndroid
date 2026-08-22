import React from 'react';
import { render, fireEvent, waitFor, act } from '../../test-utils';
import { SiriScreen } from '../SiriScreen';
import type { AppNavigationProp } from '../../navigation/types';
import type { InstalledApp } from '../../store/AppsStore';
import type { Alarm } from '../../utils/alarmScheduling';
import * as Speech from 'expo-speech';

// expo-speech is a native module with no implementation under jest; mock it
// the same way ClockScreen.test.tsx mocks expo-notifications. `stop` resolves
// like the real API (a Promise), so the wrapper's `.catch` never warns.
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(() => Promise.resolve()),
}));

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
  (Speech.speak as jest.Mock).mockClear();
  (Speech.stop as jest.Mock).mockClear();
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

// ── Voice input ────────────────────────────────────────────────────────────
// Hoisted mock of the launcher module. Tests then reach into
// jest.requireMock(...) to capture the listener callbacks and to drive them.
jest.mock('../../../modules/launcher-module/src', () => {
  const listeners: {
    result?: (t: string) => void;
    partial?: (t: string) => void;
    error?: (e: string) => void;
  } = {};
  return {
    __esModule: true,
    addHomePressedListener: jest.fn(() => jest.fn()),
    addPackageChangedListener: jest.fn(() => jest.fn()),
    addSpeechResultListener: jest.fn((fn: (t: string) => void) => {
      listeners.result = fn;
      return jest.fn();
    }),
    addSpeechPartialResultListener: jest.fn((fn: (t: string) => void) => {
      listeners.partial = fn;
      return jest.fn();
    }),
    addSpeechErrorListener: jest.fn((fn: (e: string) => void) => {
      listeners.error = fn;
      return jest.fn();
    }),
    __listeners: listeners,
    default: {
      // Fill in the AppsStore-touched surfaces so its background refresh does
      // not spam "not a function" during these tests. Everything else is
      // stubbed to a benign resolved value.
      getInstalledApps: jest.fn(() => Promise.resolve([])),
      isDefaultLauncher: jest.fn(() => Promise.resolve(false)),
      getProcessStartAgeMs: jest.fn(() => Promise.resolve(-1)),
      launchApp: jest.fn(() => Promise.resolve(true)),
      startSpeechRecognition: jest.fn(() => Promise.resolve(true)),
      stopSpeechRecognition: jest.fn(() => Promise.resolve(true)),
      isSpeechRecognitionAvailable: jest.fn(() => Promise.resolve(true)),
    },
  };
});

describe('SiriScreen voice input', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const launcher = jest.requireMock('../../../modules/launcher-module/src');
  const listeners = launcher.__listeners as {
    result?: (t: string) => void;
    partial?: (t: string) => void;
    error?: (e: string) => void;
  };

  beforeEach(() => {
    launcher.default.startSpeechRecognition.mockClear();
    launcher.default.stopSpeechRecognition.mockClear();
    launcher.default.isSpeechRecognitionAvailable.mockClear();
    launcher.default.isSpeechRecognitionAvailable.mockResolvedValue(true);
    listeners.result = undefined;
    listeners.partial = undefined;
    listeners.error = undefined;
  });

  async function renderScreen() {
    const nav = makeNav();
    const utils = render(<SiriScreen navigation={nav} />);
    // Let the availability effect and the AppsStore background load settle.
    await new Promise((r) => setTimeout(r, 0));
    return { ...utils, nav };
  }

  async function tapMic(getByLabelText: (l: string) => unknown) {
    await fireEvent.press(getByLabelText('Start voice input'));
    // Allow the async permission + start chain to resolve and the listener
    // effect to attach.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  }

  it('exposes a mic button labelled for a voice-off state initially', async () => {
    const { getByLabelText } = await renderScreen();
    expect(getByLabelText('Start voice input')).toBeTruthy();
  });

  it('tapping the mic calls startSpeechRecognition and shows the listening state', async () => {
    const { getByLabelText, getByText } = await renderScreen();
    await tapMic(getByLabelText);
    expect(launcher.default.startSpeechRecognition).toHaveBeenCalled();
    expect(getByText('Listening…')).toBeTruthy();
    expect(getByLabelText('Stop listening')).toBeTruthy();
  });

  it('an incoming final speech result runs the same command pipeline as typed input', async () => {
    const { getByLabelText } = await renderScreen();
    await tapMic(getByLabelText);
    expect(listeners.result).toBeDefined();
    await act(async () => { listeners.result?.('Open Calculator'); });
    expect(mockLaunchApp).toHaveBeenCalledWith('com.iostoandroid.calculator');
  });

  it('a partial result populates the text field so the user sees the transcript', async () => {
    const { getByLabelText } = await renderScreen();
    await tapMic(getByLabelText);
    expect(listeners.partial).toBeDefined();
    await act(async () => { listeners.partial?.('open cal'); });
    expect(getByLabelText('Ask Siri').props.value).toBe('open cal');
  });

  it('a speech error stops listening and surfaces the message', async () => {
    const { getByLabelText, getByText } = await renderScreen();
    await tapMic(getByLabelText);
    expect(listeners.error).toBeDefined();
    await act(async () => { listeners.error?.('no-match'); });
    expect(getByText(/Couldn't hear you/i)).toBeTruthy();
    expect(getByLabelText('Start voice input')).toBeTruthy();
  });

  it('tapping the mic while listening calls stopSpeechRecognition', async () => {
    const { getByLabelText } = await renderScreen();
    await tapMic(getByLabelText);
    await fireEvent.press(getByLabelText('Stop listening'));
    await new Promise((r) => setTimeout(r, 0));
    expect(launcher.default.stopSpeechRecognition).toHaveBeenCalled();
  });

  it('when the recognizer is unavailable, tapping the mic does not start listening', async () => {
    // isSpeechRecognitionAvailable resolves to false BEFORE render so the
    // effect stores voiceAvailable=false. The warning itself is an alert, and
    // asserting its text needs an AlertProvider in the tree — the point of
    // this test is the guard, not the alert plumbing.
    launcher.default.isSpeechRecognitionAvailable.mockResolvedValueOnce(false);
    const { getByLabelText } = await renderScreen();
    // Let the availability effect's three microtasks settle.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await fireEvent.press(getByLabelText('Start voice input'));
    await new Promise((r) => setTimeout(r, 0));
    expect(launcher.default.startSpeechRecognition).not.toHaveBeenCalled();
  });
});
