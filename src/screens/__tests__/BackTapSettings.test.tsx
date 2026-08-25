import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, waitFor } from '../../test-utils';
import { AlertProvider } from '../../components/AlertProvider';
import { useSettings } from '../../store/SettingsStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SettingsScreen } from '../SettingsScreen';

// SettingsScreen calls useNavigation() for the "Open Back Tap Settings"
// deep-link; pin it to a shared mock so the test can assert the navigation.
const mockNav = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn(() => false),
  getParent: () => ({ navigate: jest.fn() }),
};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useRoute: () => ({ params: {} }),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
}));

// Reads settings.backTap directly from the global SettingsStore — proves the
// inline picker actually reached the store, not just a local screen copy
// (issue #506's exact symptom, repeated for #625/#772).
function BackTapReader() {
  const { settings } = useSettings();
  return (
    <Text testID="backtap-store">
      {`en=${settings.backTap.enabled}|d=${settings.backTap.double.action}|t=${settings.backTap.triple.action}`}
    </Text>
  );
}

function renderScreen() {
  return render(
    <AlertProvider>
      <SettingsScreen />
      <BackTapReader />
    </AlertProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
});

describe('SettingsScreen — Back Tap inline section (#772)', () => {
  it('renders a Back Tap section with an enable switch', () => {
    const { getAllByText, getByText } = renderScreen();
    // Header + the master switch tile both read "Back Tap"
    expect(getAllByText('Back Tap').length).toBeGreaterThanOrEqual(1);
    expect(getByText(/Double or triple tap the back of your device/)).toBeTruthy();
  });

  it('defaults Back Tap to off and hides the gesture rows', () => {
    const { getByText, queryByText, getByTestId } = renderScreen();
    expect(getByTestId('backtap-store').props.children).toBe('en=false|d=none|t=none');
    expect(queryByText('Double Tap')).toBeNull();
    expect(queryByText('Triple Tap')).toBeNull();
  });

  it('enabling Back Tap reveals the Double and Triple Tap rows', () => {
    const { getAllByRole, getByText } = renderScreen();
    fireEvent.press(getAllByRole('switch')[0]);
    expect(getByText('Double Tap')).toBeTruthy();
    expect(getByText('Triple Tap')).toBeTruthy();
  });

  // Core acceptance criterion: select Flashlight for Double Tap, the store
  // reflects backTap.double.action === 'flash'.
  it('selecting Flashlight for Double Tap persists to SettingsStore', () => {
    const { getAllByRole, getByText, getByTestId } = renderScreen();
    fireEvent.press(getAllByRole('switch')[0]);
    fireEvent.press(getByText('Double Tap'));
    expect(getByText('Back Tap — Double Tap')).toBeTruthy();
    fireEvent.press(getByText('Flashlight'));
    expect(getByTestId('backtap-store').props.children).toBe('en=true|d=flash|t=none');
    // The row itself renders the chosen label
    expect(getByText('Flashlight')).toBeTruthy();
  });

  it('selecting Toggle Wi-Fi for Triple Tap does not disturb Double Tap', () => {
    const { getAllByRole, getByText, getByTestId } = renderScreen();
    fireEvent.press(getAllByRole('switch')[0]);
    fireEvent.press(getByText('Double Tap'));
    fireEvent.press(getByText('Flashlight'));
    fireEvent.press(getByText('Triple Tap'));
    fireEvent.press(getByText('Toggle Wi-Fi'));
    expect(getByTestId('backtap-store').props.children).toBe('en=true|d=flash|t=toggleWifi');
  });

  it('re-picking None clears a previously assigned Double Tap action', () => {
    const { getAllByRole, getByText, getAllByText, getByTestId } = renderScreen();
    fireEvent.press(getAllByRole('switch')[0]);
    fireEvent.press(getByText('Double Tap'));
    fireEvent.press(getByText('Flashlight'));
    expect(getByTestId('backtap-store').props.children).toBe('en=true|d=flash|t=none');
    fireEvent.press(getByText('Double Tap'));
    const noneMatches = getAllByText('None');
    fireEvent.press(noneMatches[noneMatches.length - 1]);
    expect(getByTestId('backtap-store').props.children).toBe('en=true|d=none|t=none');
  });

  // Inverse of the fix: toggling Back Tap off again hides the gesture rows.
  it('disabling Back Tap hides the gesture rows again', () => {
    const { getAllByRole, getByText, queryByText } = renderScreen();
    fireEvent.press(getAllByRole('switch')[0]);
    expect(getByText('Double Tap')).toBeTruthy();
    fireEvent.press(getAllByRole('switch')[0]);
    expect(queryByText('Double Tap')).toBeNull();
    expect(queryByText('Triple Tap')).toBeNull();
  });

  it('"Open Back Tap Settings" deep-links to the full Back Tap screen', () => {
    const { getAllByRole, getByText } = renderScreen();
    fireEvent.press(getAllByRole('switch')[0]);
    fireEvent.press(getByText('Open Back Tap Settings'));
    expect(mockNav.navigate).toHaveBeenCalledWith('BackTapSettings');
  });

  it('persists the chosen mapping to AsyncStorage', async () => {
    const { getAllByRole, getByText } = renderScreen();
    fireEvent.press(getAllByRole('switch')[0]);
    fireEvent.press(getByText('Double Tap'));
    fireEvent.press(getByText('Flashlight'));
    await waitFor(() =>
      expect(AsyncStorage.setItem as jest.Mock).toHaveBeenCalled(),
    );
    const [, storedJson] = (AsyncStorage.setItem as jest.Mock).mock.calls.at(-1) as [
      string,
      string,
    ];
    const stored = JSON.parse(storedJson);
    expect(stored.backTap.double).toEqual({ action: 'flash' });
  });

  // Async: a mapping written to AsyncStorage before mount is hydrated and
  // reflected in the inline section on first render.
  it('reloads a persisted mapping from AsyncStorage on mount', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(
        key === '@iostoandroid/settings'
          ? JSON.stringify({
              backTap: {
                enabled: true,
                double: { action: 'flash' },
                triple: { action: 'none' },
              },
            })
          : null,
      ),
    );
    const { getByText, getByTestId } = renderScreen();
    await waitFor(() =>
      expect(getByTestId('backtap-store').props.children).toBe('en=true|d=flash|t=none'),
    );
    expect(getByText('Double Tap')).toBeTruthy();
    // The persisted action is shown without re-selecting it
    expect(getByText('Flashlight')).toBeTruthy();
  });
});
