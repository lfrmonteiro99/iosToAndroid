import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { CallScreen } from '../CallScreen';

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

  describe('mute toggle', () => {
    it('pressing Mute switches the icon from mic to mic-off', () => {
      const { getByLabelText, UNSAFE_getByProps, UNSAFE_queryByProps } = renderCall({
        number: '+15551234567',
        name: 'Jane Doe',
      });

      expect(UNSAFE_getByProps({ name: 'mic' })).toBeTruthy();
      expect(UNSAFE_queryByProps({ name: 'mic-off' })).toBeNull();

      fireEvent.press(getByLabelText('Mute'));

      expect(UNSAFE_getByProps({ name: 'mic-off' })).toBeTruthy();
      expect(UNSAFE_queryByProps({ name: 'mic' })).toBeNull();
    });

    it('pressing Mute twice returns to the unmuted icon', () => {
      const { getByLabelText, UNSAFE_getByProps, UNSAFE_queryByProps } = renderCall({
        number: '+15551234567',
        name: 'Jane Doe',
      });

      const mute = getByLabelText('Mute');
      fireEvent.press(mute);
      fireEvent.press(mute);

      expect(UNSAFE_getByProps({ name: 'mic' })).toBeTruthy();
      expect(UNSAFE_queryByProps({ name: 'mic-off' })).toBeNull();
    });

    it('toggling Mute does not affect the Speaker icon', () => {
      const { getByLabelText, UNSAFE_getByProps } = renderCall({
        number: '+15551234567',
        name: 'Jane Doe',
      });

      fireEvent.press(getByLabelText('Mute'));

      expect(UNSAFE_getByProps({ name: 'volume-medium' })).toBeTruthy();
    });
  });

  describe('speaker toggle', () => {
    it('pressing Speaker switches the icon from volume-medium to volume-high', () => {
      const { getByLabelText, UNSAFE_getByProps, UNSAFE_queryByProps } = renderCall({
        number: '+15551234567',
        name: 'Jane Doe',
      });

      expect(UNSAFE_getByProps({ name: 'volume-medium' })).toBeTruthy();
      expect(UNSAFE_queryByProps({ name: 'volume-high' })).toBeNull();

      fireEvent.press(getByLabelText('Speaker'));

      expect(UNSAFE_getByProps({ name: 'volume-high' })).toBeTruthy();
      expect(UNSAFE_queryByProps({ name: 'volume-medium' })).toBeNull();
    });

    it('pressing Speaker twice returns to the non-speaker icon', () => {
      const { getByLabelText, UNSAFE_getByProps, UNSAFE_queryByProps } = renderCall({
        number: '+15551234567',
        name: 'Jane Doe',
      });

      const speaker = getByLabelText('Speaker');
      fireEvent.press(speaker);
      fireEvent.press(speaker);

      expect(UNSAFE_getByProps({ name: 'volume-medium' })).toBeTruthy();
      expect(UNSAFE_queryByProps({ name: 'volume-high' })).toBeNull();
    });

    it('pressing Mute and Speaker both flips both icons independently', () => {
      const { getByLabelText, UNSAFE_getByProps } = renderCall({
        number: '+15551234567',
        name: 'Jane Doe',
      });

      fireEvent.press(getByLabelText('Mute'));
      fireEvent.press(getByLabelText('Speaker'));

      expect(UNSAFE_getByProps({ name: 'mic-off' })).toBeTruthy();
      expect(UNSAFE_getByProps({ name: 'volume-high' })).toBeTruthy();
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
