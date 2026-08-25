import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, waitFor } from '../../../test-utils';
import { AlertProvider } from '../../../components/AlertProvider';
import { useSettings } from '../../../store/SettingsStore';
import { useApps } from '../../../store/AppsStore';
import { BackTapSettingsScreen } from '../BackTapSettingsScreen';
import launcherModule from '../../../../modules/launcher-module/src';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

const NATIVE_APPS = [
  { name: 'Camera', packageName: 'com.example.camera', icon: '', isSystem: false, category: 'undefined' },
  { name: 'Notes', packageName: 'com.example.notes', icon: '', isSystem: false, category: 'undefined' },
] as never;

// Reads settings.backTap directly from the global SettingsStore — proves the
// picker reached the store, not just local screen state (issue #506's exact
// symptom, repeated for #625).
function BackTapReader() {
  const { settings } = useSettings();
  return (
    <Text testID="backtap-value">
      {`${settings.backTap.enabled}|${settings.backTap.double.action}|${settings.backTap.double.packageName ?? ''}|${settings.backTap.triple.action}|${settings.backTap.triple.shortcutId ?? ''}`}
    </Text>
  );
}

// Exposes AppsStore's load state so tests can wait for the async
// getInstalledApps() to resolve before opening the Open App picker.
function AppsCountReader() {
  const { apps } = useApps();
  return <Text testID="apps-count">{apps.length}</Text>;
}

function renderScreen() {
  return render(
    <AlertProvider>
      <BackTapSettingsScreen navigation={mockNavigation as never} />
      <BackTapReader />
      <AppsCountReader />
    </AlertProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (launcherModule.getInstalledApps as jest.Mock).mockResolvedValue(NATIVE_APPS);
  (launcherModule.isFlashlightOn as jest.Mock).mockResolvedValue(false);
  (launcherModule.setFlashlight as jest.Mock).mockResolvedValue(true);
  (launcherModule.getWifiInfo as jest.Mock).mockResolvedValue({ enabled: false, ssid: '', rssi: 0, linkSpeed: 0, ip: '' });
  (launcherModule.setWifiEnabled as jest.Mock).mockResolvedValue(true);
  (launcherModule.launchApp as jest.Mock).mockResolvedValue(true);
});

describe('BackTapSettingsScreen (#625)', () => {
  it('renders without crashing, defaulting to disabled', () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId('backtap-value').props.children).toBe('false|none||none|');
  });

  it('hides the Gestures and Test sections while disabled', () => {
    const { queryByText } = renderScreen();
    expect(queryByText('Double Tap')).toBeNull();
    expect(queryByText('Test Double Tap')).toBeNull();
  });

  it('toggling the master switch enables Back Tap and reveals the gesture rows', () => {
    const { getAllByRole, getByText, getByTestId } = renderScreen();
    fireEvent.press(getAllByRole('switch')[0]);
    expect(getByTestId('backtap-value').props.children).toBe('true|none||none|');
    expect(getByText('Double Tap')).toBeTruthy();
    expect(getByText('Triple Tap')).toBeTruthy();
  });

  it('defaults both gestures to "None"', () => {
    const { getAllByRole, getAllByText } = renderScreen();
    fireEvent.press(getAllByRole('switch')[0]);
    expect(getAllByText('None').length).toBeGreaterThanOrEqual(2);
  });

  it('picking Flashlight for Double Tap persists the action with no target', () => {
    const { getAllByRole, getByText, getByTestId } = renderScreen();
    fireEvent.press(getAllByRole('switch')[0]);
    fireEvent.press(getByText('Double Tap'));
    fireEvent.press(getByText('Flashlight'));
    expect(getByTestId('backtap-value').props.children).toBe('true|flash||none|');
  });

  it('picking Toggle Wi-Fi for Triple Tap does not disturb Double Tap', () => {
    const { getAllByRole, getByText, getByTestId } = renderScreen();
    fireEvent.press(getAllByRole('switch')[0]);
    fireEvent.press(getByText('Double Tap'));
    fireEvent.press(getByText('Flashlight'));
    fireEvent.press(getByText('Triple Tap'));
    fireEvent.press(getByText('Toggle Wi-Fi'));
    expect(getByTestId('backtap-value').props.children).toBe('true|flash||toggleWifi|');
  });

  it('picking Open App opens an app picker and persists the chosen packageName', async () => {
    const { getAllByRole, getByText, getByTestId } = renderScreen();
    await waitFor(() => expect(getByTestId('apps-count').props.children).toBe(2));
    fireEvent.press(getAllByRole('switch')[0]);
    fireEvent.press(getByText('Double Tap'));
    fireEvent.press(getByText('Open App'));
    expect(getByText('Choose App')).toBeTruthy();
    fireEvent.press(getByText('Notes'));
    expect(getByTestId('backtap-value').props.children).toBe('true|openApp|com.example.notes|none|');
  });

  // Inverse of the fix: with no installed apps, Open App must not offer an
  // unusable empty picker (mirrors AssistiveTouchSettingsScreen's Add Item cap).
  it('picking Open App with zero installed apps warns instead of opening an empty picker', async () => {
    (launcherModule.getInstalledApps as jest.Mock).mockResolvedValue([]);
    const { getAllByRole, getByText, getByTestId, queryByText } = renderScreen();
    await waitFor(() => expect(getByTestId('apps-count').props.children).toBe(0));
    fireEvent.press(getAllByRole('switch')[0]);
    fireEvent.press(getByText('Double Tap'));
    fireEvent.press(getByText('Open App'));
    expect(getByText('No Apps Found')).toBeTruthy();
    expect(queryByText('Choose App')).toBeNull();
  });

  it('picking Shortcut opens a shortcut catalog and persists the chosen shortcutId', () => {
    const { getAllByRole, getByText, getByTestId } = renderScreen();
    fireEvent.press(getAllByRole('switch')[0]);
    fireEvent.press(getByText('Triple Tap'));
    fireEvent.press(getByText('Shortcut'));
    fireEvent.press(getByText('Siri'));
    expect(getByTestId('backtap-value').props.children).toBe('true|none||shortcut|siri');
  });

  it('re-picking None after Flashlight clears the action (no stuck state)', () => {
    const { getAllByRole, getByText, getAllByText, getByTestId } = renderScreen();
    fireEvent.press(getAllByRole('switch')[0]);
    fireEvent.press(getByText('Double Tap'));
    fireEvent.press(getByText('Flashlight'));
    expect(getByTestId('backtap-value').props.children).toBe('true|flash||none|');

    // 'None' also labels the still-unset Triple Tap row; the picker option is
    // the last match, added when the alert modal renders.
    fireEvent.press(getByText('Double Tap'));
    const matches = getAllByText('None');
    fireEvent.press(matches[matches.length - 1]);
    expect(getByTestId('backtap-value').props.children).toBe('true|none||none|');
  });

  it('Test Double Tap with no action assigned warns instead of calling the bridge', () => {
    const { getAllByRole, getByText } = renderScreen();
    fireEvent.press(getAllByRole('switch')[0]);
    fireEvent.press(getByText('Test Double Tap'));
    expect(getByText('Nothing to Test')).toBeTruthy();
    expect(launcherModule.setFlashlight).not.toHaveBeenCalled();
  });

  it('Test Double Tap with Flashlight assigned calls the flashlight bridge', async () => {
    const { getAllByRole, getByText } = renderScreen();
    fireEvent.press(getAllByRole('switch')[0]);
    fireEvent.press(getByText('Double Tap'));
    fireEvent.press(getByText('Flashlight'));
    fireEvent.press(getByText('Test Double Tap'));
    await waitFor(() => expect(launcherModule.setFlashlight).toHaveBeenCalledWith(true));
  });
});
