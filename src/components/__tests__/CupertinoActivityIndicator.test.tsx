import React from 'react';
import * as Reanimated from 'react-native-reanimated';
import { render as rtlRender } from '@testing-library/react-native';
import { CupertinoActivityIndicator } from '../CupertinoActivityIndicator';
import { SettingsProvider } from '../../store/SettingsStore';
import { ThemeProvider } from '../../theme/ThemeContext';
import * as gestureReduceMotionModule from '../../utils/useGestureReduceMotion';

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider gateFirstRender={false}>
      <ThemeProvider gateFirstRender={false}>
        {children}
      </ThemeProvider>
    </SettingsProvider>
  );
}

function render(ui: React.ReactElement) {
  return rtlRender(ui, { wrapper: Providers });
}

describe('CupertinoActivityIndicator', () => {
  it('renders without crashing when animating', () => {
    const { toJSON } = render(<CupertinoActivityIndicator animating />);
    expect(toJSON()).toBeTruthy();
  });

  it('returns null when not animating', () => {
    const { toJSON } = render(<CupertinoActivityIndicator animating={false} />);
    expect(toJSON()).toBeNull();
  });
});

describe('CupertinoActivityIndicator Reduce Motion', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not call withRepeat when reduceMotion is active at mount', () => {
    jest.spyOn(gestureReduceMotionModule, 'useGestureReduceMotion').mockReturnValue(true);
    const withRepeatSpy = jest.spyOn(Reanimated, 'withRepeat');

    render(<CupertinoActivityIndicator animating />);

    expect(withRepeatSpy).not.toHaveBeenCalled();
  });

  it('calls withRepeat when reduceMotion is inactive', () => {
    jest.spyOn(gestureReduceMotionModule, 'useGestureReduceMotion').mockReturnValue(false);
    const withRepeatSpy = jest.spyOn(Reanimated, 'withRepeat');

    render(<CupertinoActivityIndicator animating />);

    expect(withRepeatSpy).toHaveBeenCalledTimes(1);
  });
});
