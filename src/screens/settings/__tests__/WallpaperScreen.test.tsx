import React from 'react';
import { render, fireEvent, waitFor } from '../../../test-utils';
import { WallpaperScreen } from '../WallpaperScreen';
import { CupertinoSwitch, CupertinoSlider } from '../../../components';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

const mockUpdate = jest.fn();
// Mutable so individual tests can flip appLaunchAnimation without redefining
// the whole jest.mock factory (Jest hoists jest.mock — only `mock`-prefixed
// bindings are safe to close over).
const mockSettingsState = {
  wallpaperIndex: 0,
  appLaunchAnimation: true,
  appLaunchDurationMs: 280,
};

jest.mock('../../../store/SettingsStore', () => ({
  useSettings: () => ({
    settings: mockSettingsState,
    update: mockUpdate,
  }),
  SettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    getMany: jest.fn(() => Promise.resolve({})),
  },
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({
    canceled: true,
    assets: [],
  })),
  launchCameraAsync: jest.fn(() => Promise.resolve({
    canceled: true,
    assets: [],
  })),
}));

describe('WallpaperScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSettingsState.wallpaperIndex = 0;
    mockSettingsState.appLaunchAnimation = true;
    mockSettingsState.appLaunchDurationMs = 280;
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<WallpaperScreen navigation={mockNavigation} />);
    expect(toJSON()).toBeTruthy();
  });

  it('shows Choose from Photos tile', () => {
    const { getByText } = render(<WallpaperScreen navigation={mockNavigation} />);
    expect(getByText('Choose from Photos')).toBeTruthy();
  });

  it('shows Take Photo tile', () => {
    const { getByText } = render(<WallpaperScreen navigation={mockNavigation} />);
    expect(getByText('Take Photo')).toBeTruthy();
  });

  it('shows Set Lock Screen and Set Home Screen tiles', () => {
    const { getByText } = render(<WallpaperScreen navigation={mockNavigation} />);
    expect(getByText('Set Lock Screen')).toBeTruthy();
    expect(getByText('Set Home Screen')).toBeTruthy();
  });

  it('shows the selected wallpaper label', async () => {
    const { getByText } = render(<WallpaperScreen navigation={mockNavigation} />);
    await waitFor(() => {
      expect(getByText(/Selected:/i)).toBeTruthy();
    }, { timeout: 2000 });
  });

  it('can press Choose from Photos tile', () => {
    const { getByText } = render(<WallpaperScreen navigation={mockNavigation} />);
    const photosButton = getByText('Choose from Photos');
    fireEvent.press(photosButton);
  });

  it('can press Take Photo tile', () => {
    const { getByText } = render(<WallpaperScreen navigation={mockNavigation} />);
    const cameraButton = getByText('Take Photo');
    fireEvent.press(cameraButton);
  });

  it('can press Set Lock Screen tile', () => {
    const { getByText } = render(<WallpaperScreen navigation={mockNavigation} />);
    const lockScreenButton = getByText('Set Lock Screen');
    fireEvent.press(lockScreenButton);
  });

  it('can press Set Home Screen tile', () => {
    const { getByText } = render(<WallpaperScreen navigation={mockNavigation} />);
    const homeScreenButton = getByText('Set Home Screen');
    fireEvent.press(homeScreenButton);
  });

  // #512 §6.3: appLaunchAnimation / appLaunchDurationMs controls, exposed
  // next to the wallpaper settings (no dedicated "Home Screen" screen exists
  // yet — epics #465/#469).
  describe('App Opening animation controls (#512 §6.3)', () => {
    it('shows the "Animate App Opening" tile with the switch reflecting the current setting', () => {
      const { getByText, UNSAFE_getAllByType } = render(<WallpaperScreen navigation={mockNavigation} />);

      expect(getByText('Animate App Opening')).toBeTruthy();
      const switches = UNSAFE_getAllByType(CupertinoSwitch);
      const appLaunchSwitch = switches.find((s) => s.props.value === true);
      expect(appLaunchSwitch).toBeTruthy();
    });

    it('toggling the switch off calls update("appLaunchAnimation", false)', () => {
      const { UNSAFE_getAllByType } = render(<WallpaperScreen navigation={mockNavigation} />);

      const switches = UNSAFE_getAllByType(CupertinoSwitch);
      const appLaunchSwitch = switches.find((s) => s.props.value === true);
      appLaunchSwitch!.props.onValueChange(false);

      expect(mockUpdate).toHaveBeenCalledWith('appLaunchAnimation', false);
    });

    it('shows the duration slider (150-450ms) when the animation is on', () => {
      const { UNSAFE_getAllByType } = render(<WallpaperScreen navigation={mockNavigation} />);

      const sliders = UNSAFE_getAllByType(CupertinoSlider);
      const durationSlider = sliders.find((s) => s.props.value === 280);
      expect(durationSlider).toBeTruthy();
      expect(durationSlider!.props.minimumValue).toBe(150);
      expect(durationSlider!.props.maximumValue).toBe(450);
    });

    it('moving the slider calls update("appLaunchDurationMs", <rounded ms>)', () => {
      const { UNSAFE_getAllByType } = render(<WallpaperScreen navigation={mockNavigation} />);

      const sliders = UNSAFE_getAllByType(CupertinoSlider);
      const durationSlider = sliders.find((s) => s.props.value === 280);
      durationSlider!.props.onValueChange(150.4);

      expect(mockUpdate).toHaveBeenCalledWith('appLaunchDurationMs', 150);
    });

    it('hides the duration slider entirely when the animation is off — no dead control left visible', () => {
      mockSettingsState.appLaunchAnimation = false;
      const { UNSAFE_queryAllByType } = render(<WallpaperScreen navigation={mockNavigation} />);

      const sliders = UNSAFE_queryAllByType(CupertinoSlider);
      expect(sliders.find((s) => s.props.minimumValue === 150)).toBeUndefined();
    });

    it('mentions the fixed duration in the footer when the animation is on, and instant-open with suppressed transition when off', () => {
      mockSettingsState.appLaunchDurationMs = 280;
      mockSettingsState.appLaunchAnimation = true;
      const on = render(<WallpaperScreen navigation={mockNavigation} />);
      expect(on.getByText(/280ms/)).toBeTruthy();
      on.unmount();

      mockSettingsState.appLaunchAnimation = false;
      const off = render(<WallpaperScreen navigation={mockNavigation} />);
      expect(off.getByText(/instantly/)).toBeTruthy();
      expect(off.getByText(/suppressed/)).toBeTruthy();
    });
  });
});
