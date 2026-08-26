import React from 'react';
import { Pressable, Text } from 'react-native';
import { act } from '@testing-library/react-native';
import { render, fireEvent } from '../../test-utils';
import { CallScreen } from '../CallScreen';
import { useSettings } from '../../store/SettingsStore';
import LauncherModule, { addCallAudioStateListener } from '../../../modules/launcher-module/src';

type AudioListener = (state: { isMuted: boolean; route: string }) => void;

/**
 * addCallAudioStateListener (#920) is mocked in src/__mocks__/launcherModule.js
 * as a bare `jest.fn()` — capture the callback CallScreen registers on mount
 * and drive it directly to simulate LauncherInCallService emitting real
 * CallAudioState events, without a device.
 */
function emitAudioState(state: { isMuted: boolean; route: string }) {
  const mockFn = addCallAudioStateListener as jest.Mock;
  const lastCall = mockFn.mock.calls[mockFn.mock.calls.length - 1];
  const listener = lastCall?.[0] as AudioListener | undefined;
  if (!listener) throw new Error('addCallAudioStateListener was not called by CallScreen');
  act(() => listener(state));
}

function getEffectiveFontSize(element: { props: { style: unknown } }): number {
  const styles = Array.isArray(element.props.style) ? element.props.style : [element.props.style];
  let fontSize = 0;
  for (const s of styles) {
    if (s && typeof s === 'object' && 'fontSize' in (s as object)) {
      fontSize = (s as { fontSize: number }).fontSize;
    }
  }
  return fontSize;
}

function SetTextSize({ index }: { index: number }) {
  const { update } = useSettings();
  return (
    <Pressable testID="set-text-size" onPress={() => update('textSizeIndex', index)}>
      <Text>resize</Text>
    </Pressable>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

function renderCall(params: { number?: string; name?: string }) {
  return render(
    <CallScreen navigation={navigation} route={{ params } as any} />
  );
}

// CallScreen kicks off a native dialer call and starts a 10s fallback timeout
// on mount (see CallScreen.tsx's post-mount effect). Fake timers keep that
// timeout from firing mid-test/leaking across tests, and unmounting after
// each test clears its AppState listener + timeout.
beforeEach(() => {
  jest.useFakeTimers();
  navigation.navigate.mockClear();
  navigation.goBack.mockClear();
  (addCallAudioStateListener as jest.Mock).mockClear();
  (LauncherModule.setMuted as jest.Mock).mockClear();
  (LauncherModule.setAudioRoute as jest.Mock).mockClear();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('CallScreen', () => {
  describe('caller identity', () => {
    it('renders the caller name from route params', () => {
      const { getByText } = renderCall({ number: '+15551234567', name: 'Jane Doe' });
      expect(getByText('Jane Doe')).toBeTruthy();
    });

    it('derives avatar initials from the caller name', () => {
      const { getByText } = renderCall({ number: '+15551234567', name: 'Jane Doe' });
      expect(getByText('JD')).toBeTruthy();
    });

    it('falls back to the number when name is absent from params', () => {
      const { getByText, queryByText } = renderCall({ number: '+15551234567' });
      expect(getByText('+15551234567')).toBeTruthy();
      expect(queryByText('Jane Doe')).toBeNull();
    });

    it('falls back to the number when name is an empty string', () => {
      // Matches how PhoneScreen navigates here for numbers with no saved
      // contact: navigation.navigate('CallScreen', { number, name: name ?? '' })
      const { getByText } = renderCall({ number: '+15551234567', name: '' });
      expect(getByText('+15551234567')).toBeTruthy();
    });

    it("falls back to 'Unknown' when neither name nor number is present", () => {
      const { getByText, queryByText } = renderCall({});
      expect(getByText('Unknown')).toBeTruthy();
      expect(queryByText('+15551234567')).toBeNull();
    });
  });

  describe('ACTION_CALL path — no CallAudioState ever observed (#379, #920 AC)', () => {
    it('pressing Mute does not switch the mic icon', () => {
      // Red step: broken code (with isMuted state + toggleMute) renders mic-off after press.
      // Fixed code (disabled button, no state) keeps the icon as mic.
      const { getByLabelText, UNSAFE_queryByProps } = renderCall({
        number: '+15551234567',
        name: 'Jane Doe',
      });

      fireEvent.press(getByLabelText('Mute'));

      expect(UNSAFE_queryByProps({ name: 'mic-off' })).toBeNull();
    });

    it('pressing Speaker does not switch the speaker icon', () => {
      // Red step mirror: broken code renders volume-high after press; fixed code does not.
      const { getByLabelText, UNSAFE_queryByProps } = renderCall({
        number: '+15551234567',
        name: 'Jane Doe',
      });

      fireEvent.press(getByLabelText('Speaker'));

      expect(UNSAFE_queryByProps({ name: 'volume-high' })).toBeNull();
    });

    it('Mute and Speaker buttons report disabled accessibility state', () => {
      const { getByLabelText } = renderCall({ number: '+15551234567', name: 'Jane Doe' });
      expect(getByLabelText('Mute').props.accessibilityState?.disabled).toBe(true);
      expect(getByLabelText('Speaker').props.accessibilityState?.disabled).toBe(true);
    });

    it('pressing Mute or Speaker never calls the native bridge', () => {
      const { getByLabelText } = renderCall({ number: '+15551234567', name: 'Jane Doe' });

      fireEvent.press(getByLabelText('Mute'));
      fireEvent.press(getByLabelText('Speaker'));

      expect(LauncherModule.setMuted).not.toHaveBeenCalled();
      expect(LauncherModule.setAudioRoute).not.toHaveBeenCalled();
    });

    // AC (#920): "Teste que prova que, no caminho ACTION_CALL, os botões
    // continuam disabled e a divulgação continua visível."
    it('buttons stay disabled and the disclosure stays visible', () => {
      const { getByLabelText, getByText } = renderCall({ number: '+15551234567', name: 'Jane Doe' });

      expect(getByLabelText('Mute').props.accessibilityState?.disabled).toBe(true);
      expect(getByLabelText('Speaker').props.accessibilityState?.disabled).toBe(true);
      expect(getByText(/audio controls unavailable/i)).toBeTruthy();
    });
  });

  it('shows disclosure text that audio controls are managed by the system phone', () => {
    const { getByText } = renderCall({ number: '+15551234567', name: 'Jane Doe' });
    expect(getByText(/audio controls unavailable/i)).toBeTruthy();
  });

  describe('self-managed/Dialer path — CallAudioState observed (#920)', () => {
    it('enables Mute and Speaker once a CallAudioState event arrives', () => {
      const { getByLabelText } = renderCall({ number: '+15551234567', name: 'Jane Doe' });

      emitAudioState({ isMuted: false, route: 'earpiece' });

      expect(getByLabelText('Mute').props.accessibilityState?.disabled).toBe(false);
      expect(getByLabelText('Speaker').props.accessibilityState?.disabled).toBe(false);
    });

    it('hides the "audio controls unavailable" disclosure and hint once live', () => {
      const { getByText, queryByText } = renderCall({ number: '+15551234567', name: 'Jane Doe' });

      emitAudioState({ isMuted: false, route: 'earpiece' });

      expect(queryByText(/audio controls unavailable/i)).toBeNull();
      expect(queryByText(/audio controlled by system dialer/i)).toBeNull();
      // Everything else (name, status) is unaffected.
      expect(getByText('Jane Doe')).toBeTruthy();
    });

    it('reflects isMuted:true from the system as the mic-off icon', () => {
      const { getByLabelText, UNSAFE_queryByProps } = renderCall({ number: '+15551234567', name: 'Jane Doe' });

      emitAudioState({ isMuted: true, route: 'earpiece' });

      expect(UNSAFE_queryByProps({ name: 'mic-off' })).toBeTruthy();
      expect(getByLabelText('Mute').props.accessibilityState?.disabled).toBe(false);
    });

    it('reflects route:"speaker" from the system as the volume-high icon', () => {
      const { UNSAFE_queryByProps } = renderCall({ number: '+15551234567', name: 'Jane Doe' });

      emitAudioState({ isMuted: false, route: 'speaker' });

      expect(UNSAFE_queryByProps({ name: 'volume-high' })).toBeTruthy();
    });

    it('does not treat route:"speaker" as muted, or isMuted:true as speaker (independent flags)', () => {
      const { UNSAFE_queryByProps } = renderCall({ number: '+15551234567', name: 'Jane Doe' });

      emitAudioState({ isMuted: true, route: 'earpiece' });

      expect(UNSAFE_queryByProps({ name: 'mic-off' })).toBeTruthy();
      expect(UNSAFE_queryByProps({ name: 'volume-high' })).toBeNull();
    });

    it('pressing Mute commands setMuted with the inverse of the current system state', async () => {
      const { getByLabelText } = renderCall({ number: '+15551234567', name: 'Jane Doe' });
      emitAudioState({ isMuted: false, route: 'earpiece' });

      await act(async () => { fireEvent.press(getByLabelText('Mute')); });

      expect(LauncherModule.setMuted).toHaveBeenCalledWith(true);
    });

    it('pressing Mute again while already muted commands setMuted(false)', async () => {
      const { getByLabelText } = renderCall({ number: '+15551234567', name: 'Jane Doe' });
      emitAudioState({ isMuted: true, route: 'earpiece' });

      await act(async () => { fireEvent.press(getByLabelText('Mute')); });

      expect(LauncherModule.setMuted).toHaveBeenCalledWith(false);
    });

    it('pressing Speaker while on earpiece commands setAudioRoute("speaker")', async () => {
      const { getByLabelText } = renderCall({ number: '+15551234567', name: 'Jane Doe' });
      emitAudioState({ isMuted: false, route: 'earpiece' });

      await act(async () => { fireEvent.press(getByLabelText('Speaker')); });

      expect(LauncherModule.setAudioRoute).toHaveBeenCalledWith('speaker');
    });

    it('pressing Speaker while already on speaker commands setAudioRoute("earpiece")', async () => {
      const { getByLabelText } = renderCall({ number: '+15551234567', name: 'Jane Doe' });
      emitAudioState({ isMuted: false, route: 'speaker' });

      await act(async () => { fireEvent.press(getByLabelText('Speaker')); });

      expect(LauncherModule.setAudioRoute).toHaveBeenCalledWith('earpiece');
    });

    it('pressing Mute twice before the system confirms sends the same command twice (no optimistic local toggle)', async () => {
      // Locks in the AC that the visual state mirrors CallAudioState from the
      // system, never a local useState guess — so two rapid presses without an
      // intervening event both compute the toggle from the same stale isMuted.
      const { getByLabelText } = renderCall({ number: '+15551234567', name: 'Jane Doe' });
      emitAudioState({ isMuted: false, route: 'earpiece' });

      await act(async () => {
        fireEvent.press(getByLabelText('Mute'));
        fireEvent.press(getByLabelText('Mute'));
      });

      expect(LauncherModule.setMuted).toHaveBeenNthCalledWith(1, true);
      expect(LauncherModule.setMuted).toHaveBeenNthCalledWith(2, true);
      expect(LauncherModule.setMuted).toHaveBeenCalledTimes(2);
    });

    it('a later CallAudioState with route "bluetooth" is not shown as speaker-active', () => {
      const { UNSAFE_queryByProps } = renderCall({ number: '+15551234567', name: 'Jane Doe' });

      emitAudioState({ isMuted: false, route: 'speaker' });
      emitAudioState({ isMuted: false, route: 'bluetooth' });

      expect(UNSAFE_queryByProps({ name: 'volume-high' })).toBeNull();
      expect(UNSAFE_queryByProps({ name: 'volume-medium' })).toBeTruthy();
    });

    it('unsubscribes the CallAudioState listener on unmount', () => {
      const { unmount } = renderCall({ number: '+15551234567', name: 'Jane Doe' });
      const mockFn = addCallAudioStateListener as jest.Mock;
      const unsubscribe = mockFn.mock.results[mockFn.mock.results.length - 1].value;

      unmount();

      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('end call', () => {
    it('pressing End Call navigates back', () => {
      const { getByLabelText } = renderCall({ number: '+15551234567', name: 'Jane Doe' });

      fireEvent.press(getByLabelText('End Call'));

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
      expect(navigation.navigate).not.toHaveBeenCalled();
    });

    it('pressing Mute or Speaker does not navigate away from the call', () => {
      const { getByLabelText } = renderCall({ number: '+15551234567', name: 'Jane Doe' });

      fireEvent.press(getByLabelText('Mute'));
      fireEvent.press(getByLabelText('Speaker'));

      expect(navigation.goBack).not.toHaveBeenCalled();
      expect(navigation.navigate).not.toHaveBeenCalled();
    });
  });

  it('exposes accessible labels for all three call controls', () => {
    const { getByLabelText } = renderCall({ number: '+15551234567', name: 'Jane Doe' });

    expect(getByLabelText('Mute')).toBeTruthy();
    expect(getByLabelText('Speaker')).toBeTruthy();
    expect(getByLabelText('End Call')).toBeTruthy();
  });
});

describe('CallScreen Dynamic Type', () => {
  it('avatar initials fontSize scales with textSizeIndex (textScale multiplication)', () => {
    const { getByText, getByTestId } = render(
      <>
        <SetTextSize index={3} />
        <CallScreen
          navigation={navigation}
          route={{ params: { number: '+15551234567', name: 'Jane Doe' } } as never}
        />
      </>,
    );

    const defaultFontSize = getEffectiveFontSize(getByText('JD'));

    fireEvent.press(getByTestId('set-text-size'));

    const scaledFontSize = getEffectiveFontSize(getByText('JD'));
    expect(scaledFontSize).toBeGreaterThan(defaultFontSize);
  });
});
