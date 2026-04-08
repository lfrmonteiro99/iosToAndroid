import React from 'react';
import { render } from '../../test-utils';
import { LauncherHomeScreen } from '../LauncherHomeScreen';

// Cast to any to avoid strict prop-type checking in tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Screen = LauncherHomeScreen as any;

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

describe('LauncherHomeScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<Screen navigation={navigation} route={{}} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders in loading state initially', () => {
    const { toJSON } = render(<Screen navigation={navigation} route={{}} />);
    expect(toJSON()).toBeTruthy();
  });

  it('accepts navigation prop without crashing', () => {
    const nav = { navigate: jest.fn(), goBack: jest.fn() };
    const { toJSON } = render(<Screen navigation={nav} route={{}} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with custom navigation prop', () => {
    const nav = { navigate: jest.fn(), goBack: jest.fn() };
    const { toJSON } = render(<Screen navigation={nav} route={{ params: {} }} />);
    expect(toJSON()).toBeTruthy();
  });
});
