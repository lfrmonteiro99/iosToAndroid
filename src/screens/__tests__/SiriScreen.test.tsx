import React from 'react';
import { render, fireEvent, waitFor, act } from '../../test-utils';
import { SiriScreen } from '../SiriScreen';
import type { AppNavigationProp } from '../../navigation/types';
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

// Mock the launcher module so SiriScreen's voice path never touches the native
// SpeechRecognizer. The listener callbacks are captured so the trailing
// "voice input" block can simulate a recognized utterance. The default
// `launchApp` is overridden to resolve true (AppsStore.launchApp is a no-op on
// non-Android under jest, so we spy on the hook's launchApp below instead).
const listeners: {
  result?: (t: string) => void;
  partial?: (t: string) => void;
  error?: (e: string) => void;
} = {};

jest.mock('../../../modules/launcher-module/src', () => {
  const actual = jest.requireActual('../../../modules/launcher-module/src');
  return {
    __esModule: true,
    ...actual,
    default: {
      ...actual.default,
      launchApp: jest.fn(async () => true),
      startSpeechRecognition: jest.fn(async () => true),
      stopSpeechRecognition: jest.fn(async () => true),
      isSpeechRecognitionAvailable: jest.fn(async () => true),
    },
    addSpeechResultListener: jest.fn((cb: (text: string) => void) => {
      listeners.result = cb;
      return () => {};
    }),
    addSpeechPartialResultListener: jest.fn((cb: (text: string) => void) => {
      listeners.partial = cb;
      return () => {};
    }),
    addSpeechErrorListener: jest.fn((cb: (e: string) => void) => {
      listeners.error = cb;
      return () => {};
    }),
  };
});

// Provide a minimal app list (Calculator) so the resolved SiriScreen's
// `findApp` actually resolves "Open Calculator" → launchApp. We also expose a
// spyable `mockLaunchApp`: AppsStore.launchApp is a no-op on non-Android under
// jest (Platform.OS === 'ios' in the test env), so we replace the hook's
// launchApp with a spy that resolves true, exactly as the upstream SiriScreen
// test did.
const mockLaunchApp = jest.fn(async () => true);

jest.mock('../../store/AppsStore', () => {
  const actual = jest.requireActual('../../store/AppsStore');
  return {
    __esModule: true,
    ...actual,
    useApps: () => ({
      apps: [{ name: 'Calculator', packageName: 'com.iostoandroid.calculator' }],
      launchApp: mockLaunchApp,
      loadApps: jest.fn(),
    }),
  };
});

// Same mocked module instance the component imports.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const launcherModule = jest.requireMock('../../../modules/launcher-module/src') as {
  default: {
    launchApp: jest.Mock;
    startSpeechRecognition: jest.Mock;
    stopSpeechRecognition: jest.Mock;
    isSpeechRecognitionAvailable: jest.Mock;
  };
};

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
  launcherModule.default.startSpeechRecognition.mockClear();
  launcherModule.default.stopSpeechRecognition.mockClear();
  launcherModule.default.isSpeechRecognitionAvailable.mockResolvedValue(true);
  (Speech.speak as jest.Mock).mockClear();
  (Speech.stop as jest.Mock).mockClear();
  mockCreateQuickAlarm.mockClear();
  mockLaunchApp.mockClear();
  listeners.result = undefined;
  listeners.partial = undefined;
  listeners.error = undefined;
});

describe('SiriScreen', () => {
  it('renders the greeting', () => {
    const { getByText } = render(<SiriScreen navigation={makeNav()} />);
    expect(getByText('What can I help you with?')).toBeTruthy();
  });

  it('text "What time is it" responds and speaks', async () => {
    const { getByText, getByPlaceholderText } = render(
      <SiriScreen navigation={makeNav()} />,
    );
    const input = getByPlaceholderText('Type a request');
    fireEvent.changeText(input, 'What time is it');
    fireEvent(input, 'submitEditing');

    await waitFor(() => {
      expect(getByText(/It's/)).toBeTruthy();
    });
    expect(Speech.speak).toHaveBeenCalledWith(expect.stringMatching(/^It's /));
  });

  it('spoken command (native result) routes through the same parser', async () => {
    const { getByText, getByLabelText } = render(<SiriScreen navigation={makeNav()} />);
    // Let the availability effect and AppsStore load settle.
    await new Promise((r) => setTimeout(r, 0));

    // Start listening so the result listener attaches, then simulate the
    // native SpeechRecognizer returning "What time is it".
    await fireEvent.press(getByLabelText('Start voice input'));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await act(async () => {
      listeners.result?.('What time is it');
    });

    await waitFor(() => {
      expect(getByText(/It's/)).toBeTruthy();
    });
    expect(Speech.speak).toHaveBeenCalledWith(expect.stringMatching(/^It's /));
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
  });

  // ── Empty / boundary input ───────────────────────────────────────────────
  it('ignores an empty submit: no navigation, no response text change', () => {
    const nav = makeNav();
    const { getByLabelText, queryByText } = render(<SiriScreen navigation={nav} />);
    fireEvent(getByLabelText('Ask Siri'), 'submitEditing');
    expect(nav.navigate).not.toHaveBeenCalled();
    expect(queryByText(/Couldn't find/i)).toBeNull();
  });

  it('ignores a whitespace-only submit', () => {
    const nav = makeNav();
    const { getByLabelText, queryByText } = render(<SiriScreen navigation={nav} />);
    fireEvent.changeText(getByLabelText('Ask Siri'), '   ');
    fireEvent(getByLabelText('Ask Siri'), 'submitEditing');
    expect(nav.navigate).not.toHaveBeenCalled();
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
    const { getByLabelText, queryByText, getByText } = render(<SiriScreen navigation={nav} />);
    const field = getByLabelText('Ask Siri');
    fireEvent.changeText(field, 'Open Photoshop');
    fireEvent(field, 'submitEditing');
    expect(queryByText(/Couldn't find/i)).toBeTruthy();
    fireEvent.changeText(field, 'Open Calculator');
    fireEvent(field, 'submitEditing');
    expect(getByText('Opening Calculator.')).toBeTruthy();
    expect(mockLaunchApp).toHaveBeenCalledWith('com.iostoandroid.calculator');
    expect(queryByText(/Couldn't find/i)).toBeNull();
  });

  // ── Async ────────────────────────────────────────────────────────────────
  it('does not throw when the launch fails', () => {
    mockLaunchApp.mockRejectedValueOnce(new Error('launch failed'));
    expect(() => submit('Open Calculator')).not.toThrow();
    expect(mockLaunchApp).toHaveBeenCalledWith('com.iostoandroid.calculator');
  });

  // ── Speech (issue #256) ──────────────────────────────────────────────────
  it('speaks the response exactly once when a command yields a response', () => {
    submit('Open Calculator');
    expect(mockLaunchApp).toHaveBeenCalledWith('com.iostoandroid.calculator');
    expect(Speech.speak).toHaveBeenCalledTimes(1);
    expect(Speech.speak).toHaveBeenCalledWith('Opening Calculator.');
  });

  it('does not speak the greeting on initial mount', () => {
    render(<SiriScreen navigation={makeNav()} />);
    expect(Speech.speak).not.toHaveBeenCalled();
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
// The launcher module mock above captures the listener callbacks in `listeners`
// and exposes the start/stop/availability functions. These tests drive the
// mic button (labelled "Start voice input" once the recognizer is available)
// and feed synthesized speech events through the captured callbacks. The voice
// listeners only attach while listening, so each test taps the mic first.
describe('SiriScreen voice input', () => {
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
    // effect to attach. Two ticks: one for the startListening await, one for
    // the effect's getLauncherModuleExports().then() attaching the listeners.
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
    expect(launcherModule.default.startSpeechRecognition).toHaveBeenCalled();
    expect(getByText('Listening…')).toBeTruthy();
    expect(getByLabelText('Stop listening')).toBeTruthy();
  });

  it('an incoming final speech result runs the same command pipeline as typed input', async () => {
    const { getByLabelText, getByText } = await renderScreen();
    await tapMic(getByLabelText);
    expect(listeners.result).toBeDefined();
    await act(async () => { listeners.result?.('Open Calculator'); });
    await waitFor(() => expect(getByText('Opening Calculator.')).toBeTruthy());
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
    expect(launcherModule.default.stopSpeechRecognition).toHaveBeenCalled();
  });

  it('when the recognizer is unavailable, tapping the mic does not start listening', async () => {
    // isSpeechRecognitionAvailable resolves to false BEFORE render so the
    // effect stores voiceAvailable=false. The warning itself is an alert, and
    // asserting its text needs an AlertProvider in the tree — the point of
    // this test is the guard, not the alert plumbing.
    launcherModule.default.isSpeechRecognitionAvailable.mockResolvedValueOnce(false);
    const { getByLabelText } = await renderScreen();
    // Let the availability effect's microtasks settle.
    await new Promise((r) => setTimeout(r, 0));
    await fireEvent.press(getByLabelText('Start voice input'));
    await new Promise((r) => setTimeout(r, 0));
    expect(launcherModule.default.startSpeechRecognition).not.toHaveBeenCalled();
  });
});
