import React from 'react';
import { render, fireEvent } from '../../../test-utils';
import type { RenderAPI } from '@testing-library/react-native';
import { DisplayBrightnessScreen } from '../DisplayBrightnessScreen';
import { CupertinoSegmentedControl } from '../../../components/CupertinoSegmentedControl';
import { useSettings } from '../../../store/SettingsStore';
import type { AppNavigationProp } from '../../../navigation/types';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() } as unknown as AppNavigationProp;

/** Tap the i-th segment of the appearance segmented control. */
function selectAppearance(api: RenderAPI, index: number) {
  const controls = api.UNSAFE_getAllByType(CupertinoSegmentedControl);
  const control = controls.find(
    (c) => c.props.testID === 'appearance-segmented',
  );
  const labels = ['Light', 'Dark', 'Automatic'];
  // The segment's Pressable wraps a Text carrying the label; press that Text.
  const textNode = control.findAllByType('Text').find(
    (t: { props: { children: unknown } }) => t.props.children === labels[index],
  );
  fireEvent.press(textNode);
}

function renderScreen() {
  return render(<DisplayBrightnessScreen navigation={mockNavigation} />);
}

describe('Display & Brightness — Custom Dark Mode schedule', () => {
  it('hides Light Until / Dark Until when a fixed Light mode is selected', () => {
    const api = renderScreen();
    // Default mode is 'system' but darkModeAutomatic is false → schedule hidden.
    expect(api.queryByText('Light Until')).toBeNull();
    expect(api.queryByText('Dark Until')).toBeNull();
    // Select the Light segment (index 0).
    selectAppearance(api, 0);
    expect(api.queryByText('Light Until')).toBeNull();
    expect(api.queryByText('Dark Until')).toBeNull();
  });

  it('exposes Light Until / Dark Until only when Automatic with custom schedule is active', () => {
    const api = renderScreen();
    // Switch to Automatic (index 2) → enables darkModeAutomatic + system mode.
    selectAppearance(api, 2);
    expect(api.queryByText('Light Until')).not.toBeNull();
    expect(api.queryByText('Dark Until')).not.toBeNull();
  });

  it('shows the persisted schedule values and updates them from the picker', () => {
    const api = renderScreen();
    selectAppearance(api, 2);

    expect(api.getByTestId('dark-mode-light-until-value').props.children).toBe('07:00');
    expect(api.getByTestId('dark-mode-dark-until-value').props.children).toBe('19:00');

    // Open and pick a new Light Until value.
    fireEvent.press(api.getByText('Light Until'));
    fireEvent.press(api.getByText('06:30'));

    expect(api.getByTestId('dark-mode-light-until-value').props.children).toBe('06:30');
    // Dark Until untouched.
    expect(api.getByTestId('dark-mode-dark-until-value').props.children).toBe('19:00');
  });

  it('persists the schedule into settings state', () => {
    const api = renderScreen();
    selectAppearance(api, 2);
    fireEvent.press(api.getByText('Dark Until'));
    fireEvent.press(api.getByText('21:00'));

    // Read settings through a component consumer (hooks may not run at top level).
    const captured: { darkModeAutomatic?: boolean; darkModeLightUntil?: string; darkModeDarkUntil?: string } = {};
    function Reader() {
      const { settings } = useSettings();
      captured.darkModeAutomatic = settings.darkModeAutomatic;
      captured.darkModeLightUntil = settings.darkModeLightUntil;
      captured.darkModeDarkUntil = settings.darkModeDarkUntil;
      return null;
    }
    api.rerender(
      <>
        <DisplayBrightnessScreen navigation={mockNavigation} />
        <Reader />
      </>,
    );
    expect(captured.darkModeAutomatic).toBe(true);
    expect(captured.darkModeLightUntil).toBe('07:00');
    expect(captured.darkModeDarkUntil).toBe('21:00');
  });

  it('switching away from Automatic keeps the schedule hidden', () => {
    const api = renderScreen();
    selectAppearance(api, 2);
    expect(api.queryByText('Light Until')).not.toBeNull();
    // Go back to a fixed Light mode.
    selectAppearance(api, 0);
    expect(api.queryByText('Light Until')).toBeNull();
    expect(api.queryByText('Dark Until')).toBeNull();
  });
});
