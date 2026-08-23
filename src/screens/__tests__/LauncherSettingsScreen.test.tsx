/**
 * #602 — secção «App Library» em LauncherSettingsScreen com dois toggles:
 * Show Notifications e Show Suggestions (ambos default true).
 */
import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import { LauncherSettingsScreen } from '../LauncherSettingsScreen';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: {} }),
}));

describe('LauncherSettingsScreen — secção App Library (#602)', () => {
  it('tem a secção App Library com dois toggles, ambos default ligados', () => {
    const { getByText, getByTestId } = render(<LauncherSettingsScreen />);
    // Secção presente (o header é renderizado em maiúsculas pelo CupertinoListSection).
    expect(getByText('APP LIBRARY')).toBeTruthy();
    // Dois toggles com os títulos esperados.
    expect(getByText('Show Notifications')).toBeTruthy();
    expect(getByText('Show Suggestions')).toBeTruthy();
    // Default on (accessibilityState.checked === true).
    expect(getByTestId('toggle-appLibraryShowNotifications').props.accessibilityState.checked).toBe(true);
    expect(getByTestId('toggle-appLibraryShowSuggestions').props.accessibilityState.checked).toBe(true);
  });

  it('Show Notifications toggle desliga e reflete o estado', async () => {
    const { getByTestId } = render(<LauncherSettingsScreen />);
    const toggle = getByTestId('toggle-appLibraryShowNotifications');
    expect(toggle.props.accessibilityState.checked).toBe(true);
    fireEvent.press(toggle);
    await waitFor(() =>
      expect(getByTestId('toggle-appLibraryShowNotifications').props.accessibilityState.checked).toBe(false),
    );
  });

  it('Show Suggestions toggle desliga e reflete o estado', async () => {
    const { getByTestId } = render(<LauncherSettingsScreen />);
    const toggle = getByTestId('toggle-appLibraryShowSuggestions');
    expect(toggle.props.accessibilityState.checked).toBe(true);
    fireEvent.press(toggle);
    await waitFor(() =>
      expect(getByTestId('toggle-appLibraryShowSuggestions').props.accessibilityState.checked).toBe(false),
    );
  });
});
