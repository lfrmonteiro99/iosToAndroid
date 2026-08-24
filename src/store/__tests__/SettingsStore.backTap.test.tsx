import React from 'react';
import { Text } from 'react-native';
import { render, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SettingsProvider, useSettings } from '../SettingsStore';

// issue #625 (Back Tap): o mapeamento gesto→acção vive em settings.backTap e
// é lido do mesmo blob não confiável do AsyncStorage que todo o resto. Estes
// testes exercitam a hidratação do provider (SettingsStore.tsx:519), não
// normalizeBackTap em isolado — a suite de src/utils/__tests__/backTap.test.ts
// já cobre a função pura. O que se prova aqui é que o provider a CHAMA: sem a
// linha, um blob corrompido chegaria intacto aos consumidores e um
// `openApp` sem packageName dispararia launchApp(undefined).

/**
 * Formata uma atribuição como `acção:alvo`. O alvo é lido do campo que a acção
 * usa (packageName para openApp, shortcutId para shortcut) sem privilegiar
 * nenhum dos dois, para que a mesma sonda sirva os dois gestos.
 */
function fmt(a: { action: string; packageName?: string; shortcutId?: string }): string {
  return `${a.action}:${a.packageName ?? a.shortcutId ?? '-'}`;
}

function Probe() {
  const { settings, isReady } = useSettings();
  const bt = settings.backTap;
  return (
    <Text>{`ready=${isReady} en=${bt.enabled} d=${fmt(bt.double)} t=${fmt(bt.triple)}`}</Text>
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

describe('SettingsProvider — hidratação de backTap (#625)', () => {
  it('sem nada persistido fica no default desligado, ambos os gestos em none', async () => {
    const utils = renderWithStored(null);
    await waitFor(() =>
      expect(utils.getByText('ready=true en=false d=none:- t=none:-')).toBeTruthy(),
    );
  });

  it('hidrata um backTap persistido válido (openApp + shortcut)', async () => {
    const utils = renderWithStored({
      backTap: {
        enabled: true,
        double: { action: 'openApp', packageName: 'com.example.notes' },
        triple: { action: 'shortcut', shortcutId: 'siri' },
      },
    });
    await waitFor(() =>
      expect(
        utils.getByText('ready=true en=true d=openApp:com.example.notes t=shortcut:siri'),
      ).toBeTruthy(),
    );
  });

  it('degrada openApp sem packageName para none (não deixa passar launchApp(undefined))', async () => {
    const utils = renderWithStored({
      backTap: { enabled: true, double: { action: 'openApp' }, triple: { action: 'flash' } },
    });
    await waitFor(() =>
      expect(utils.getByText('ready=true en=true d=none:- t=flash:-')).toBeTruthy(),
    );
  });

  it('descarta uma acção desconhecida persistida por outra versão', async () => {
    const utils = renderWithStored({
      backTap: { enabled: true, double: { action: 'selfDestruct' }, triple: { action: 'screenshot' } },
    });
    await waitFor(() =>
      expect(utils.getByText('ready=true en=true d=none:- t=screenshot:-')).toBeTruthy(),
    );
  });

  it('backTap não-objecto (array) cai no default inteiro', async () => {
    const utils = renderWithStored({ backTap: ['flash', 'screenshot'] });
    await waitFor(() =>
      expect(utils.getByText('ready=true en=false d=none:- t=none:-')).toBeTruthy(),
    );
  });

  it('enabled não-booleano persistido é forçado para false', async () => {
    const utils = renderWithStored({
      backTap: { enabled: 'yes', double: { action: 'flash' }, triple: { action: 'none' } },
    });
    await waitFor(() =>
      expect(utils.getByText('ready=true en=false d=flash:- t=none:-')).toBeTruthy(),
    );
  });

  it('um gesto corrompido não contamina o outro', async () => {
    const utils = renderWithStored({
      backTap: {
        enabled: true,
        double: { action: 'shortcut', shortcutId: '   ' },
        triple: { action: 'openApp', packageName: 'com.example.camera' },
      },
    });
    await waitFor(() =>
      expect(utils.getByText('ready=true en=true d=none:- t=openApp:com.example.camera')).toBeTruthy(),
    );
  });

  it('sobrevive a um "reinício": update() grava e a hidratação seguinte lê o mesmo mapeamento', async () => {
    function Assigner() {
      const { settings, update } = useSettings();
      return (
        <Text
          onPress={() =>
            update('backTap', {
              enabled: true,
              double: { action: 'openApp', packageName: 'com.example.notes' },
              triple: { action: 'flash' },
            })
          }
        >
          {`en=${settings.backTap.enabled} d=${settings.backTap.double.action}`}
        </Text>
      );
    }

    const utils = render(
      <SettingsProvider gateFirstRender={false}>
        <Assigner />
      </SettingsProvider>,
    );
    await waitFor(() => expect(utils.getByText('en=false d=none')).toBeTruthy());

    act(() => {
      utils.getByText('en=false d=none').props.onPress();
    });
    await waitFor(() => expect(utils.getByText('en=true d=openApp')).toBeTruthy());

    await waitFor(() => expect(AsyncStorage.setItem as jest.Mock).toHaveBeenCalled());
    const [, storedJson] = (AsyncStorage.setItem as jest.Mock).mock.calls.at(-1) as [string, string];
    const stored = JSON.parse(storedJson);
    expect(stored.backTap).toEqual({
      enabled: true,
      double: { action: 'openApp', packageName: 'com.example.notes' },
      triple: { action: 'flash' },
    });

    const second = renderWithStored(stored);
    await waitFor(() =>
      expect(
        second.getByText('ready=true en=true d=openApp:com.example.notes t=flash:-'),
      ).toBeTruthy(),
    );
  });
});
