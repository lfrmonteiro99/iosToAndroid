import React from 'react';
import { Appearance } from 'react-native';
import { render } from '../../test-utils';
import { ErrorBoundary } from '../ErrorBoundary';
import { SystemColors } from '../../theme/CupertinoTheme';

// Suppress console.error noise from intentional throws
beforeEach(() => { jest.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { jest.restoreAllMocks(); });

function Bomb(): React.ReactElement {
  throw new Error('test error');
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <React.Fragment><React.Fragment /></React.Fragment>
      </ErrorBoundary>,
    );
    // No error UI should appear
    expect(() => getByText('Try Again')).toThrow();
  });

  it('shows recovery UI after a crash', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(getByText('Recovering...')).toBeTruthy();
  });
});

describe('ErrorBoundary dark mode accent', () => {
  it('uses dark accent color for ActivityIndicator in dark mode', () => {
    // Red step: broken code used SystemColors.light.accent (#007AFF) unconditionally.
    // Fixed code uses SystemColors.dark.accent (#0A84FF) when dark mode is active.
    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('dark');

    const { UNSAFE_getByType } = render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ActivityIndicator } = require('react-native');
    const spinner = UNSAFE_getByType(ActivityIndicator);

    expect(spinner.props.color).toBe(SystemColors['dark'].accent);
    expect(spinner.props.color).not.toBe(SystemColors['light'].accent);
  });

  it('uses light accent color for ActivityIndicator in light mode', () => {
    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('light');

    const { UNSAFE_getByType } = render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ActivityIndicator } = require('react-native');
    const spinner = UNSAFE_getByType(ActivityIndicator);

    expect(spinner.props.color).toBe(SystemColors['light'].accent);
    expect(spinner.props.color).not.toBe(SystemColors['dark'].accent);
  });
});
