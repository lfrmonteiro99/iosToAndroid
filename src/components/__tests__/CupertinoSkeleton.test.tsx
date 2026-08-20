import React from 'react';
import * as Reanimated from 'react-native-reanimated';
import { render as rtlRender } from '@testing-library/react-native';
import { CupertinoSkeleton } from '../CupertinoSkeleton';
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

describe('CupertinoSkeleton', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<CupertinoSkeleton width={100} height={20} />);
    expect(toJSON()).toBeTruthy();
  });
});

describe('CupertinoSkeleton Reduce Motion', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not call withRepeat when reduceMotion is active at mount', () => {
    jest.spyOn(gestureReduceMotionModule, 'useGestureReduceMotion').mockReturnValue(true);
    const withRepeatSpy = jest.spyOn(Reanimated, 'withRepeat');

    render(<CupertinoSkeleton width={100} height={20} />);

    expect(withRepeatSpy).not.toHaveBeenCalled();
  });

  it('calls withRepeat when reduceMotion is inactive', () => {
    jest.spyOn(gestureReduceMotionModule, 'useGestureReduceMotion').mockReturnValue(false);
    const withRepeatSpy = jest.spyOn(Reanimated, 'withRepeat');

    render(<CupertinoSkeleton width={100} height={20} />);

    expect(withRepeatSpy).toHaveBeenCalledTimes(1);
  });
});
