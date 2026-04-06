import React from 'react';
import { render } from '../../test-utils';
import { HomeScreen } from '../HomeScreen';

describe('HomeScreen', () => {
  it('renders Home title', () => {
    const { getByText } = render(<HomeScreen />);
    expect(getByText('Home')).toBeTruthy();
  });

  it('renders greeting based on time', () => {
    const { queryByText } = render(<HomeScreen />);
    const hasGreeting =
      queryByText('Good Morning') !== null ||
      queryByText('Good Afternoon') !== null ||
      queryByText('Good Evening') !== null;
    expect(hasGreeting).toBe(true);
  });

  it('renders battery widget', () => {
    const { getAllByText } = render(<HomeScreen />);
    // "Battery" appears as both a widget label and in the stat row
    const batteryNodes = getAllByText('Battery');
    expect(batteryNodes.length).toBeGreaterThan(0);
  });

  it('renders storage widget', () => {
    const { getByText } = render(<HomeScreen />);
    expect(getByText('Storage')).toBeTruthy();
  });

  it('renders quick actions', () => {
    const { getByText } = render(<HomeScreen />);
    expect(getByText('Camera')).toBeTruthy();
    expect(getByText('Photos')).toBeTruthy();
    expect(getByText('Music')).toBeTruthy();
    expect(getByText('Files')).toBeTruthy();
  });

  it('renders recent activity section', () => {
    const { getByText } = render(<HomeScreen />);
    // CupertinoListSection renders header via .toUpperCase()
    expect(getByText('RECENT ACTIVITY')).toBeTruthy();
  });
});
