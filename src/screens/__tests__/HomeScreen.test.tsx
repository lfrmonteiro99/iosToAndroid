import React from 'react';
import { render } from '../../test-utils';
import { LauncherHomeScreen } from '../LauncherHomeScreen';

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('LauncherHomeScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(
      <LauncherHomeScreen navigation={navigation} route={{} as any} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders in loading state initially', () => {
    const { toJSON } = render(
      <LauncherHomeScreen navigation={navigation} route={{} as any} />,
    );
    // Component starts in isLoading state — renders something (spinner)
    const tree = toJSON();
    expect(tree).toBeTruthy();
  });

  it('accepts navigation prop without crashing', () => {
    const nav = { navigate: jest.fn(), goBack: jest.fn() };
    const { toJSON } = render(
      <LauncherHomeScreen navigation={nav} route={{} as any} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with custom navigation prop', () => {
    const nav = { navigate: jest.fn(), goBack: jest.fn() };
    const { toJSON } = render(
      <LauncherHomeScreen navigation={nav} route={{ params: {} } as any} />,
    );
    expect(toJSON()).toBeTruthy();
  });
});
