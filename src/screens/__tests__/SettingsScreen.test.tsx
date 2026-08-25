import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { SettingsScreen } from '../SettingsScreen';

describe('SettingsScreen', () => {
  it('renders Settings title', () => {
    const { getAllByText } = render(<SettingsScreen />);
    // The collapsing nav bar renders title in both the inline and large-title areas
    const titles = getAllByText('Settings');
    expect(titles.length).toBeGreaterThan(0);
  });

  it('renders profile card', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('John Appleseed')).toBeTruthy();
  });

  it('renders all setting sections', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Wi-Fi')).toBeTruthy();
    expect(getByText('Bluetooth')).toBeTruthy();
    expect(getByText('General')).toBeTruthy();
    expect(getByText('Battery')).toBeTruthy();
  });

  // The binary "Dark Mode" switch was replaced by a three-way segmented control
  // (Light / Dark / Automatic), which is what iOS actually offers. Assert the
  // control that exists now rather than the toggle that no longer does.
  it('renders the Appearance theme control', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Light')).toBeTruthy();
    expect(getByText('Dark')).toBeTruthy();
    expect(getByText('Automatic')).toBeTruthy();
  });

  it('renders Airplane Mode', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Airplane Mode')).toBeTruthy();
  });

  it('search filters settings', () => {
    const { getByText, queryByText, getByPlaceholderText } = render(<SettingsScreen />);
    const searchInput = getByPlaceholderText('Search Settings');
    fireEvent.changeText(searchInput, 'Wi-Fi');
    expect(getByText('Wi-Fi')).toBeTruthy();
    expect(queryByText('General')).toBeNull();
    expect(queryByText('Battery')).toBeNull();
  });
});
