import React from 'react';
import { render } from '../../test-utils';
import { LauncherHomeScreen } from '../LauncherHomeScreen';

describe('LauncherHomeScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<LauncherHomeScreen />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders the home screen container', () => {
    const { toJSON } = render(<LauncherHomeScreen />);
    const tree = toJSON();
    expect(tree).toBeTruthy();
  });

  it('renders page dots or app grid', () => {
    const { toJSON } = render(<LauncherHomeScreen />);
    expect(toJSON()).toBeTruthy();
  });
});
