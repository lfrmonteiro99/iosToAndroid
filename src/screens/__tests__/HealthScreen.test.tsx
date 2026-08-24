import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid } from 'react-native';
import { Pedometer } from 'expo-sensors';
import { render } from '../../test-utils';
import { HealthScreen } from '../HealthScreen';

/** Fires the callback `watchStepCount` registered, with a raw step count. */
function emitSteps(steps: number) {
  const cb = (Pedometer.watchStepCount as jest.Mock).mock.calls[0][0];
  cb({ steps });
}

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (Pedometer.isAvailableAsync as jest.Mock).mockResolvedValue(true);
  (Pedometer.watchStepCount as jest.Mock).mockReturnValue({ remove: jest.fn() });
  jest
    .spyOn(PermissionsAndroid, 'request')
    .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('HealthScreen distance and active energy cards', () => {
  it('renders Distance and Active Energy cards, each labelled as estimated', async () => {
    const screen = render(<HealthScreen />);
    await act(async () => {});

    expect(screen.getByText('Distance')).toBeTruthy();
    expect(screen.getByText('Active Energy')).toBeTruthy();
    expect(screen.getAllByText('Estimated from steps')).toHaveLength(2);
  });

  it('shows — in both derived cards while no permission has been granted', async () => {
    const screen = render(<HealthScreen />);
    await act(async () => {});

    // Steps card and both derived cards all use the same placeholder.
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.queryByText('0.0 km')).toBeNull();
    expect(screen.queryByText('0 kcal')).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('shows 7.6 km and 400 kcal for 10000 steps, keeping the steps card intact', async () => {
    const screen = render(<HealthScreen />);
    await act(async () => {});

    await act(async () => {
      fireEvent.press(screen.getByText('Grant Activity Permission'));
    });
    await act(async () => {
      emitSteps(10000);
    });

    expect(screen.getByText('7.6 km')).toBeTruthy();
    expect(screen.getByText('400 kcal')).toBeTruthy();
    // Regression guard: the foundation's steps card is unchanged.
    expect(screen.getByText('10000')).toBeTruthy();
    expect(screen.getByText('steps today')).toBeTruthy();
    expect(screen.queryByText('—')).toBeNull();
  });

  it('still shows — for every card when permission is denied', async () => {
    (PermissionsAndroid.request as jest.Mock).mockResolvedValue(
      PermissionsAndroid.RESULTS.DENIED,
    );
    const screen = render(<HealthScreen />);
    await act(async () => {});

    await act(async () => {
      fireEvent.press(screen.getByText('Grant Activity Permission'));
    });

    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.queryByText('0.0 km')).toBeNull();
    expect(screen.queryByText('0 kcal')).toBeNull();
  });

  it('shows — (never 0.0 km) when permission is granted but the day is still at 0 steps', async () => {
    const screen = render(<HealthScreen />);
    await act(async () => {});

    await act(async () => {
      fireEvent.press(screen.getByText('Grant Activity Permission'));
    });
    await act(async () => {
      emitSteps(0);
    });

    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.queryByText('0.0 km')).toBeNull();
    expect(screen.queryByText('0 kcal')).toBeNull();
  });

  it('rounds a single step down to 0.0 km only after it is a real reading', async () => {
    const screen = render(<HealthScreen />);
    await act(async () => {});

    await act(async () => {
      fireEvent.press(screen.getByText('Grant Activity Permission'));
    });
    await act(async () => {
      emitSteps(1);
    });

    // One step IS a real reading, so a rounded 0.0 km / 0 kcal is honest here —
    // the placeholder is reserved for "no steps at all".
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('0.0 km')).toBeTruthy();
    expect(screen.getByText('0 kcal')).toBeTruthy();
    expect(screen.queryByText('—')).toBeNull();
  });

  it('renders the derived cards, still labelled estimated, when the pedometer is unavailable', async () => {
    (Pedometer.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    const screen = render(<HealthScreen />);
    await act(async () => {});

    expect(screen.getByText('Step counting is not available on this device.')).toBeTruthy();
    expect(screen.queryByText('Grant Activity Permission')).toBeNull();
    expect(screen.getByText('Distance')).toBeTruthy();
    expect(screen.getByText('Active Energy')).toBeTruthy();
    expect(screen.getAllByText('Estimated from steps')).toHaveLength(2);
    expect(screen.getAllByText('—')).toHaveLength(3);
  });

  it('pressing Grant twice does not double the displayed estimates', async () => {
    const screen = render(<HealthScreen />);
    await act(async () => {});

    await act(async () => {
      fireEvent.press(screen.getByText('Grant Activity Permission'));
    });
    await act(async () => {});
    // After a successful grant the button is gone, so a stray double tap cannot
    // register a second watcher — assert the watcher count directly.
    await act(async () => {
      emitSteps(5000);
    });

    expect((Pedometer.watchStepCount as jest.Mock).mock.calls).toHaveLength(1);
    expect(screen.getByText('3.8 km')).toBeTruthy();
    expect(screen.getByText('200 kcal')).toBeTruthy();
  });

  it('renders a large step count without breaking the estimate formatting', async () => {
    const screen = render(<HealthScreen />);
    await act(async () => {});

    await act(async () => {
      fireEvent.press(screen.getByText('Grant Activity Permission'));
    });
    await act(async () => {
      emitSteps(999999);
    });

    expect(screen.getByText('762.0 km')).toBeTruthy();
    expect(screen.getByText('40000 kcal')).toBeTruthy();
  });
});
