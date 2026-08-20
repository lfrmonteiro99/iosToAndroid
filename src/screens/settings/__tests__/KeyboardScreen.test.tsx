import React from 'react';
import { fireEvent, render } from '../../../test-utils';
import { KeyboardScreen } from '../KeyboardScreen';

// getMany is not in the global mock — add it here
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    getMany: jest.fn(() => Promise.resolve({})),
  },
}));

const mockOpenSystemPanel = jest.fn();

jest.mock('../../../store/DeviceStore', () => ({
  useDevice: () => ({
    openSystemPanel: mockOpenSystemPanel,
    settings: {},
  }),
  DeviceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DeviceContext: null,
}));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

describe('KeyboardScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<KeyboardScreen navigation={mockNavigation as never} />);
    expect(toJSON()).toBeTruthy();
  });

  // Red step: before fix, pressing "Advanced Keyboard Settings" calls openSystemPanel
  // with 'input_method' (wrong — not a known panel in the Kotlin when).
  // After fix: calls with 'keyboard' (the correct case in LauncherModule.kt:435).
  it('pressing "Advanced Keyboard Settings" calls openSystemPanel with "keyboard"', () => {
    const { getByText } = render(<KeyboardScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByText('Advanced Keyboard Settings (System)'));

    expect(mockOpenSystemPanel).toHaveBeenCalledWith('keyboard');
    expect(mockOpenSystemPanel).not.toHaveBeenCalledWith('input_method');
  });
});
