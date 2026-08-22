import React from 'react';
import { render, fireEvent, waitFor, act } from '../../../test-utils';
import { WallpaperScreen, formatIconCacheSize } from '../WallpaperScreen';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- default export of the jest-mocked module, needed to control resolution timing per test
const LauncherModule = require('../../../../modules/launcher-module/src').default;

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

const mockUpdate = jest.fn();
let mockSettings: { wallpaperIndex: number; iconTreatment: string } = {
  wallpaperIndex: 0,
  iconTreatment: 'mask-adaptive-only',
};

jest.mock('../../../store/SettingsStore', () => ({
  useSettings: () => ({
    settings: mockSettings,
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

describe('WallpaperScreen icon treatment (#486)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSettings = { wallpaperIndex: 0, iconTreatment: 'mask-adaptive-only' };
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue([]);
    (LauncherModule.isDefaultLauncher as jest.Mock).mockResolvedValue(false);
    (LauncherModule.getIconCacheSizeBytes as jest.Mock).mockResolvedValue(0);
    (LauncherModule.clearIconCache as jest.Mock).mockResolvedValue(0);
    (LauncherModule.getAppInfo as jest.Mock).mockResolvedValue(null);
  });

  it('shows all 3 treatment options', () => {
    const { getByText } = render(<WallpaperScreen navigation={mockNavigation} />);
    expect(getByText('All Icons')).toBeTruthy();
    expect(getByText('Adaptive Only')).toBeTruthy();
    expect(getByText('None')).toBeTruthy();
  });

  it('selecting a different treatment calls update with the corresponding value', () => {
    const { getByText } = render(<WallpaperScreen navigation={mockNavigation} />);

    fireEvent.press(getByText('All Icons'));
    expect(mockUpdate).toHaveBeenCalledWith('iconTreatment', 'mask-all');

    fireEvent.press(getByText('None'));
    expect(mockUpdate).toHaveBeenCalledWith('iconTreatment', 'none');
  });

  it('shows the icon cache size, formatted', async () => {
    (LauncherModule.getIconCacheSizeBytes as jest.Mock).mockResolvedValue(2 * 1024 * 1024);

    const { getByText } = render(<WallpaperScreen navigation={mockNavigation} />);

    await waitFor(() => {
      expect(getByText('2.0 MB')).toBeTruthy();
    });
  });

  it('shows 0 B for an empty cache', async () => {
    const { getByText } = render(<WallpaperScreen navigation={mockNavigation} />);
    await waitFor(() => {
      expect(getByText('0 B')).toBeTruthy();
    });
  });

  it('pressing Rebuild Icon Cache clears the cache and redraws every installed app', async () => {
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue([
      { name: 'App A', packageName: 'com.example.a', icon: '', isSystem: false },
    ]);

    const { getByText } = render(<WallpaperScreen navigation={mockNavigation} />);
    await waitFor(() => expect(LauncherModule.getInstalledApps).toHaveBeenCalled());

    await act(async () => {
      fireEvent.press(getByText('Rebuild Icon Cache'));
    });

    expect(LauncherModule.clearIconCache).toHaveBeenCalledTimes(1);
    expect(LauncherModule.getAppInfo).toHaveBeenCalledWith('com.example.a', 'mask-adaptive-only');
  });

  it('shows rebuild progress while a rebuild is in flight', async () => {
    (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue([
      { name: 'App A', packageName: 'com.example.a', icon: '', isSystem: false },
      { name: 'App B', packageName: 'com.example.b', icon: '', isSystem: false },
    ]);
    let resolveFirstRedraw: (v: unknown) => void = () => {};
    (LauncherModule.getAppInfo as jest.Mock).mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirstRedraw = resolve; }),
    );

    const { getByText } = render(<WallpaperScreen navigation={mockNavigation} />);
    await waitFor(() => expect(LauncherModule.getInstalledApps).toHaveBeenCalled());

    act(() => {
      fireEvent.press(getByText('Rebuild Icon Cache'));
    });

    await waitFor(() => {
      expect(getByText(/Rebuilding… 0 of 2/)).toBeTruthy();
    });

    await act(async () => {
      resolveFirstRedraw(null);
    });
  });
});

describe('formatIconCacheSize', () => {
  it('formats zero and negative sizes as 0 B', () => {
    expect(formatIconCacheSize(0)).toBe('0 B');
    expect(formatIconCacheSize(-5)).toBe('0 B');
  });

  it('formats sub-KB sizes in bytes', () => {
    expect(formatIconCacheSize(512)).toBe('512 B');
  });

  it('formats sub-MB sizes in KB with one decimal', () => {
    expect(formatIconCacheSize(1536)).toBe('1.5 KB');
  });

  it('formats MB-and-above sizes in MB with one decimal', () => {
    expect(formatIconCacheSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
