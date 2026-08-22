import React from 'react';
import { render, fireEvent, waitFor, act } from '../../../test-utils';
import { WallpaperScreen, formatIconCacheSize } from '../WallpaperScreen';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- default export of the jest-mocked module, needed to control resolution timing per test
const LauncherModule = require('../../../../modules/launcher-module/src').default;
import { CupertinoSwitch, CupertinoSlider } from '../../../components';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

const mockUpdate = jest.fn();
const mockSettings: {
  wallpaperIndex: number;
  iconTreatment: string;
  appLaunchAnimation: boolean;
  appLaunchDurationMs: number;
} = {
  wallpaperIndex: 0,
  iconTreatment: 'mask-adaptive-only',
  appLaunchAnimation: true,
  appLaunchDurationMs: 280,
};
// Alias para os testes do #512 (§6.3) que flipam appLaunchAnimation sem
// redefinir a factory do jest.mock (Jest hoists jest.mock — só bindings com
// prefixo `mock` são seguros para fechar).
const mockSettingsState = mockSettings;

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

describe('WallpaperScreen icon treatment (#486)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mutar o objecto partilhado (não reatribuir): a factory do jest.mock lê a
    // variável `mockSettings`, e o alias mockSettingsState tem de continuar a
    // apontar para o MESMO objecto, senão o describe anterior mexia num objeto
    // órfão e este noutro.
    mockSettingsState.wallpaperIndex = 0;
    mockSettingsState.iconTreatment = 'mask-adaptive-only';
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
    // #486/#482: o redraw passa a MESMA máscara (forma/expoente) que a grelha e
    // o tratamento actual — o rebuild não pode devolver ícones com outra silhueta.
    expect(LauncherModule.getAppInfo).toHaveBeenCalledWith(
      'com.example.a',
      expect.objectContaining({ shape: 'squircle', cacheKey: 'squircle4.7' }),
      'mask-adaptive-only',
    );
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
