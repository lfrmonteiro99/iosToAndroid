import React from 'react';
import { Pressable, Text } from 'react-native';
import { render, fireEvent } from '../../test-utils';
import { CallScreen } from '../CallScreen';
import { useSettings } from '../../store/SettingsStore';

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

  describe('mute and speaker controls are inert (disabled)', () => {
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
  });

  it('shows disclosure text that audio controls are managed by the system phone', () => {
    const { getByText } = renderCall({ number: '+15551234567', name: 'Jane Doe' });
    expect(getByText(/audio controls unavailable/i)).toBeTruthy();
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
