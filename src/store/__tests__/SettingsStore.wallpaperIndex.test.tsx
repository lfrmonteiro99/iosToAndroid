import React from 'react';
import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SettingsProvider, useSettings } from '../SettingsStore';
import { clampWallpaperIndex, WALLPAPERS } from '../../utils/wallpapers';

// issue #674 (retrabalho): o saneamento de `wallpaperIndex` na hidratação do
// AsyncStorage tem de aceitar 6 como valor VÁLIDO — é o sentinel de wallpaper
// personalizado (WallpaperScreen.tsx:112/127/195 gravam 6; a home só mostra o
// ImageBackground custom em LauncherHomeScreen.tsx:1322 se o índice for === 6).
// Clampá-lo a WALLPAPERS.length-1 = 5 apagava silenciosamente a escolha do
// utilizador no relançamento seguinte.

/** Expõe o wallpaperIndex hidratado como texto, para assertar no que pintou. */
function Probe() {
  const { settings, isReady } = useSettings();
  return <Text>{`ready=${isReady} idx=${String(settings.wallpaperIndex)}`}</Text>;
}

function renderWithStored(blob: unknown) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(key === '@iostoandroid/settings' ? JSON.stringify(blob) : null),
  );
  return render(
    <SettingsProvider gateFirstRender={false}>
      <Probe />
    </SettingsProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
});

describe('clampWallpaperIndex (#674)', () => {
  it('preserva 6 (sentinel de wallpaper personalizado)', () => {
    expect(clampWallpaperIndex(6)).toBe(6);
  });

  it('preserva todos os índices de cor válidos e o limite ±1', () => {
    WALLPAPERS.forEach((_, i) => expect(clampWallpaperIndex(i)).toBe(i));
    expect(clampWallpaperIndex(5)).toBe(5);
    expect(clampWallpaperIndex(7)).toBe(6);
    expect(clampWallpaperIndex(Number.MAX_SAFE_INTEGER)).toBe(6);
  });

  it('saneia não-finito, negativo, vazio e não-numérico para 0', () => {
    expect(clampWallpaperIndex(NaN)).toBe(0);
    expect(clampWallpaperIndex(-1)).toBe(0);
    expect(clampWallpaperIndex(-999)).toBe(0);
    expect(clampWallpaperIndex(Infinity)).toBe(6);
    expect(clampWallpaperIndex(-Infinity)).toBe(0);
    expect(clampWallpaperIndex('não-um-número')).toBe(0);
    expect(clampWallpaperIndex(undefined)).toBe(0);
    expect(clampWallpaperIndex(null)).toBe(0);
    expect(clampWallpaperIndex({})).toBe(0);
    expect(clampWallpaperIndex([])).toBe(0);
  });

  it('aceita numérico em string e trunca fracções', () => {
    expect(clampWallpaperIndex('3')).toBe(3);
    expect(clampWallpaperIndex('6')).toBe(6);
    expect(clampWallpaperIndex(2.9)).toBe(2);
    expect(clampWallpaperIndex(6.9)).toBe(6);
  });
});

describe('SettingsProvider — hidratação de wallpaperIndex (#674)', () => {
  it('mantém wallpaperIndex=6 (custom) na hidratação, sem clampar para 5', async () => {
    const utils = renderWithStored({ wallpaperIndex: 6 });
    await waitFor(() => expect(utils.getByText('ready=true idx=6')).toBeTruthy());
  });

  it('saneia wallpaperIndex string não-numérica para 0', async () => {
    const utils = renderWithStored({ wallpaperIndex: 'roxo' });
    await waitFor(() => expect(utils.getByText('ready=true idx=0')).toBeTruthy());
  });

  it('saneia wallpaperIndex negativo para 0', async () => {
    const utils = renderWithStored({ wallpaperIndex: -3 });
    await waitFor(() => expect(utils.getByText('ready=true idx=0')).toBeTruthy());
  });

  it('clampa wallpaperIndex acima do domínio para 6', async () => {
    const utils = renderWithStored({ wallpaperIndex: 999 });
    await waitFor(() => expect(utils.getByText('ready=true idx=6')).toBeTruthy());
  });

  it('usa 0 quando o campo está totalmente ausente do blob', async () => {
    const utils = renderWithStored({ volume: 0.4 });
    await waitFor(() => expect(utils.getByText('ready=true idx=0')).toBeTruthy());
  });
});
