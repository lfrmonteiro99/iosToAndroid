import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppsProvider, useApps } from '../AppsStore';
import { SettingsProvider, useSettings } from '../SettingsStore';
import { resetIconMaskForTests } from '../../utils/iconShape';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- default export of the jest-mocked module
const LauncherModule = require('../../../modules/launcher-module/src').default;

const app = { name: 'Apple', packageName: 'com.example.apple', icon: 'file:///icons/a_1_squircle4.7.png', isSystem: false };

function wrapper({ children }: { children: React.ReactNode }) {
  return <SettingsProvider gateFirstRender={false}>{children}</SettingsProvider>;
}

/** Monta settings e apps juntos, para mudar a forma e ver a grelha reagir. */
function useBoth() {
  return { settings: useSettings(), apps: useApps() };
}

function bothWrapper({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider gateFirstRender={false}>
      <AppsProvider>{children}</AppsProvider>
    </SettingsProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  // A máscara activa vive ao nível do módulo (utils/iconShape), como a cache de
  // haptics: sem reset, a forma escolhida num teste vazava para o seguinte.
  resetIconMaskForTests();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue([app]);
  (LauncherModule.isDefaultLauncher as jest.Mock).mockResolvedValue(false);
});

describe('AppsStore — a forma dos ícones desce até à ponte nativa (#482)', () => {
  it('passa a máscara default (squircle 4.7) a getInstalledApps', async () => {
    renderHook(() => useApps(), { wrapper: bothWrapper });
    await act(async () => {});

    expect(LauncherModule.getInstalledApps).toHaveBeenCalledWith(
      expect.objectContaining({ shape: 'squircle', exponent: 4.7, cacheKey: 'squircle4.7' }),
      // #486: a ponte recebe também o tratamento (default quando sem prop).
      'mask-adaptive-only',
    );
  });

  it('mudar a forma volta a pedir os ícones com a chave de cache nova — a grelha actualiza sem reinstalar', async () => {
    const { result } = renderHook(() => useBoth(), { wrapper: bothWrapper });
    await act(async () => {});

    const callsBefore = (LauncherModule.getInstalledApps as jest.Mock).mock.calls.length;

    await act(async () => {
      result.current.settings.update('iconShape', 'circle');
    });
    await act(async () => {});

    const calls = (LauncherModule.getInstalledApps as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(callsBefore);
    expect(calls[calls.length - 1][0]).toMatchObject({ shape: 'circle', cacheKey: 'circle2.0' });
  });

  it('mudar só o expoente também invalida a cache (chave diferente)', async () => {
    const { result } = renderHook(() => useBoth(), { wrapper: bothWrapper });
    await act(async () => {});
    const callsBefore = (LauncherModule.getInstalledApps as jest.Mock).mock.calls.length;

    await act(async () => {
      result.current.settings.update('iconShapeExponent', 3.0);
    });
    await act(async () => {});

    const calls = (LauncherModule.getInstalledApps as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(callsBefore);
    expect(calls[calls.length - 1][0]).toMatchObject({ cacheKey: 'squircle3.0' });
  });

  it("'original' pede ao nativo sem máscara: exponent null", async () => {
    const { result } = renderHook(() => useBoth(), { wrapper: bothWrapper });
    await act(async () => {});

    await act(async () => {
      result.current.settings.update('iconShape', 'original');
    });
    await act(async () => {});

    const calls = (LauncherModule.getInstalledApps as jest.Mock).mock.calls;
    expect(calls[calls.length - 1][0]).toMatchObject({ shape: 'original', exponent: null });
  });

  it('subscreve e cancela: depois de desmontar, uma mudança de forma não actualiza nada', async () => {
    const { result, unmount } = renderHook(() => useBoth(), { wrapper: bothWrapper });
    await act(async () => {});
    unmount();
    const callsAfterUnmount = (LauncherModule.getInstalledApps as jest.Mock).mock.calls.length;

    await act(async () => {
      result.current.settings.update('iconShape', 'rounded');
    });
    await act(async () => {});

    expect((LauncherModule.getInstalledApps as jest.Mock).mock.calls.length).toBe(callsAfterUnmount);
  });

  it('o inverso do fix: escolher a MESMA forma outra vez não volta a varrer os pacotes', async () => {
    const { result } = renderHook(() => useBoth(), { wrapper: bothWrapper });
    await act(async () => {});
    const callsBefore = (LauncherModule.getInstalledApps as jest.Mock).mock.calls.length;

    // Duplo toque no mesmo segmento — defeito recorrente neste repositório.
    await act(async () => {
      result.current.settings.update('iconShape', 'squircle');
    });
    await act(async () => {
      result.current.settings.update('iconShape', 'squircle');
    });
    await act(async () => {});

    expect((LauncherModule.getInstalledApps as jest.Mock).mock.calls.length).toBe(callsBefore);
  });

  it('AppsProvider sozinho, sem SettingsProvider, continua a montar e usa os defaults', async () => {
    const { result } = renderHook(() => useApps(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <AppsProvider>{children}</AppsProvider>,
    });
    await act(async () => {});

    expect(result.current.isLoading).toBe(false);
    expect(LauncherModule.getInstalledApps).toHaveBeenCalledWith(
      expect.objectContaining({ shape: 'squircle' }),
      // #486: sem prop, o AppsProvider usa o default 'mask-adaptive-only'.
      'mask-adaptive-only',
    );
  });
});

describe('SettingsStore — forma dos ícones persiste e é validada (#482)', () => {
  it('tem os defaults da especificação: squircle e 4.7', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});

    expect(result.current.settings.iconShape).toBe('squircle');
    expect(result.current.settings.iconShapeExponent).toBe(4.7);
  });

  it('grava a forma escolhida no AsyncStorage — persiste entre arranques', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.update('iconShape', 'rounded');
    });

    const writes = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(
      ([key]) => key === '@iostoandroid/settings',
    );
    expect(writes.length).toBeGreaterThan(0);
    expect(JSON.parse(writes[writes.length - 1][1]).iconShape).toBe('rounded');
  });

  it('lê a forma persistida no arranque seguinte', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(
        key === '@iostoandroid/settings'
          ? JSON.stringify({ iconShape: 'circle', iconShapeExponent: 3.5 })
          : null,
      ),
    );

    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});

    expect(result.current.settings.iconShape).toBe('circle');
    expect(result.current.settings.iconShapeExponent).toBe(3.5);
  });

  it('um valor corrompido em disco não desce até ao Kotlin: normaliza na leitura', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(
        key === '@iostoandroid/settings'
          ? JSON.stringify({ iconShape: 'blob', iconShapeExponent: 999 })
          : null,
      ),
    );

    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});

    expect(result.current.settings.iconShape).toBe('squircle');
    expect(result.current.settings.iconShapeExponent).toBe(8.0);
  });
});
