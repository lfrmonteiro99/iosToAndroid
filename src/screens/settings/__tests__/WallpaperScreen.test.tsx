import React from 'react';
import { render, fireEvent, waitFor } from '../../../test-utils';
import { WallpaperScreen } from '../WallpaperScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

jest.mock('../../../store/SettingsStore', () => ({
  useSettings: () => ({
    settings: {
      wallpaperIndex: 0,
    },
    update: jest.fn(),
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
});
