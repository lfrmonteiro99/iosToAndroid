import React from 'react';
import { Text } from 'react-native';
import { render, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SettingsProvider, useSettings } from '../SettingsStore';

// issue #493: `motionIntensity` ('full'|'reduced'|'off') substitui e
// generaliza `reduceMotion` (binário). `reduceMotion` continua exposto,
// derivado de motionIntensity !== 'full', para os ~20 consumidores actuais
// de useGestureReduceMotion(). Blobs persistidos antes do #493 só tinham
// `reduceMotion: true|false` — migram para motionIntensity 'reduced'|'full'.

function Probe() {
  const { settings, isReady } = useSettings();
  return (
    <Text>
      {`ready=${isReady} mi=${settings.motionIntensity} rm=${settings.reduceMotion} sd=${settings.scrollDeceleration}`}
    </Text>
  );
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

describe('SettingsProvider — motionIntensity (#493)', () => {
  it('default é "full" com reduceMotion derivado false, sem nada persistido', async () => {
    const utils = renderWithStored(null);
    await waitFor(() =>
      expect(utils.getByText('ready=true mi=full rm=false sd=normal')).toBeTruthy(),
    );
  });

  it('migra reduceMotion:true legado (pré-#493) para motionIntensity "reduced"', async () => {
    const utils = renderWithStored({ reduceMotion: true });
    await waitFor(() =>
      expect(utils.getByText('ready=true mi=reduced rm=true sd=normal')).toBeTruthy(),
    );
  });

  it('migra reduceMotion:false legado para motionIntensity "full"', async () => {
    const utils = renderWithStored({ reduceMotion: false });
    await waitFor(() =>
      expect(utils.getByText('ready=true mi=full rm=false sd=normal')).toBeTruthy(),
    );
  });

  it('um motionIntensity já persistido vence o campo reduceMotion legado', async () => {
    const utils = renderWithStored({ reduceMotion: false, motionIntensity: 'off' });
    await waitFor(() =>
      expect(utils.getByText('ready=true mi=off rm=true sd=normal')).toBeTruthy(),
    );
  });

  it('saneia motionIntensity corrompido (string inválida) para "full"', async () => {
    const utils = renderWithStored({ motionIntensity: 'ultra-fast' });
    await waitFor(() =>
      expect(utils.getByText('ready=true mi=full rm=false sd=normal')).toBeTruthy(),
    );
  });

  it('hidrata scrollDeceleration "fast" persistido', async () => {
    const utils = renderWithStored({ scrollDeceleration: 'fast' });
    await waitFor(() =>
      expect(utils.getByText('ready=true mi=full rm=false sd=fast')).toBeTruthy(),
    );
  });

  it('saneia scrollDeceleration corrompido para "normal"', async () => {
    const utils = renderWithStored({ scrollDeceleration: 'ludicrous' });
    await waitFor(() =>
      expect(utils.getByText('ready=true mi=full rm=false sd=normal')).toBeTruthy(),
    );
  });
});

describe('SettingsProvider — reduceMotion derivado (#493)', () => {
  function Toggler() {
    const { settings, update } = useSettings();
    return (
      <Text
        testID="toggle"
        onPress={() => update('motionIntensity', 'off')}
      >
        {`mi=${settings.motionIntensity} rm=${settings.reduceMotion}`}
      </Text>
    );
  }

  it('reduceMotion acompanha motionIntensity em tempo real quando actualizado via update()', async () => {
    const utils = render(
      <SettingsProvider gateFirstRender={false}>
        <Toggler />
      </SettingsProvider>,
    );
    await waitFor(() => expect(utils.getByText('mi=full rm=false')).toBeTruthy());

    act(() => {
      utils.getByText('mi=full rm=false').props.onPress();
    });

    await waitFor(() => expect(utils.getByText('mi=off rm=true')).toBeTruthy());
  });

  it('persiste motionIntensity entre "arranques" (escreve no AsyncStorage e a próxima hidratação lê o valor)', async () => {
    const utils = render(
      <SettingsProvider gateFirstRender={false}>
        <Toggler />
      </SettingsProvider>,
    );
    await waitFor(() => expect(utils.getByText('mi=full rm=false')).toBeTruthy());

    act(() => {
      utils.getByText('mi=full rm=false').props.onPress();
    });
    await waitFor(() => expect(utils.getByText('mi=off rm=true')).toBeTruthy());

    await waitFor(() => expect(AsyncStorage.setItem as jest.Mock).toHaveBeenCalled());
    const [, storedJson] = (AsyncStorage.setItem as jest.Mock).mock.calls.at(-1) as [string, string];
    const stored = JSON.parse(storedJson);
    expect(stored.motionIntensity).toBe('off');

    // Novo "arranque": nova instância do provider a ler o blob gravado.
    const second = renderWithStored(stored);
    await waitFor(() =>
      expect(second.getByText('ready=true mi=off rm=true sd=normal')).toBeTruthy(),
    );
  });
});
