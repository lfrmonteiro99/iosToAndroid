import React from 'react';
import { render, waitFor } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import launcherModule from '../../../modules/launcher-module/src';
import { AppLibraryContent } from '../AppLibraryScreen';
import { DEFAULT_SETTINGS } from '../../store/SettingsStore';

// Issue #678: as faixas horizontais "Recently Added" e "Suggestions" (AppStrip)
// renderizavam os ícones com 62px (stripIconSize = 62), exagerado para uma
// faixa horizontal de 4 ícones — o iOS usa ~60px em grelha densa e mostra os 4
// de uma vez, sem scroll. O tamanho do ícone é o que o issue pede para corrigir;
// o stripItem (72px) mantém-se para alojar o label e não forçar scroll.
//
// O AppIcon (definido em AppLibraryScreen.tsx) empacota o ícone num <View> com
// width/height = size; por isso o tamanho do ícone aparece na árvore como a
// prop `width` desse View (e do Image/View interior). Recolhemos todos os
// `width` da árvore renderizada e verificamos o valor das faixas.

const BASE_APPS = [
  { name: 'Messages', packageName: 'com.iostoandroid.messages', icon: '', isSystem: false, category: 'social' },
  { name: 'Facebook', packageName: 'com.facebook', icon: '', isSystem: false, category: 'social' },
  { name: 'Spotify', packageName: 'com.spotify', icon: '', isSystem: false, category: 'undefined' },
  { name: 'Strava', packageName: 'com.strava', icon: '', isSystem: false, category: 'undefined' },
  { name: 'Maps', packageName: 'com.maps', icon: '', isSystem: false, category: 'undefined' },
] as never;

beforeEach(() => {
  jest.clearAllMocks();
});

async function renderLibraryWithApps(apps: unknown[]) {
  const saved = JSON.stringify({ ...DEFAULT_SETTINGS });
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    key === '@iostoandroid/settings' ? Promise.resolve(saved) : Promise.resolve(null),
  );
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  (launcherModule.getInstalledApps as jest.Mock).mockResolvedValue(apps);
  (launcherModule.isDefaultLauncher as jest.Mock).mockResolvedValue(false);

  const utils = render(<AppLibraryContent />);
  // Apps carregam de forma assíncrona a partir do mock do LauncherModule.
  await waitFor(() => expect(utils.getAllByText('Categories').length).toBeGreaterThan(0));
  return utils;
}

// Recolhe todos os valores de `width` presentes nas props `style` da árvore.
interface JsonNode {
  children?: JsonNode | JsonNode[];
  props?: { style?: unknown };
}
function collectWidths(node: unknown, acc: number[] = []): number[] {
  if (!node || typeof node !== 'object') return acc;
  const n = node as JsonNode;
  const style = n.props && n.props.style;
  if (style) {
    const styles = Array.isArray(style) ? style : [style];
    for (const s of styles) {
      if (s && typeof s === 'object' && typeof (s as { width?: unknown }).width === 'number') {
        acc.push((s as { width: number }).width);
      }
    }
  }
  const children = n.children;
  if (children) {
    const arr = Array.isArray(children) ? children : [children];
    for (const c of arr) collectWidths(c, acc);
  }
  return acc;
}

describe('AppLibrary AppStrip icon size (#678)', () => {
  it('ícones das faixas Recently Added/Suggestions renderizam a 60px e não a 62px', async () => {
    const { toJSON } = await renderLibraryWithApps(BASE_APPS);
    const widths = collectWidths(toJSON());

    // O valor exagerado de 62px (stripIconSize antigo) não pode existir.
    expect(widths).not.toContain(62);
    // O valor alinhado ao iOS (~60px) tem de estar presente — e em quantidade
    // suficiente para cobrir ambas as faixas (4 ícones cada = 8 contentores de
    // ícone, contando o View exterior de cada AppIcon).
    const sixtyCount = widths.filter((w) => w === 60).length;
    expect(sixtyCount).toBeGreaterThanOrEqual(8);
  });

  it('faixa com um único app continua a 60px (fronteira: 1 ícone)', async () => {
    const { toJSON } = await renderLibraryWithApps([BASE_APPS[0]]);
    const widths = collectWidths(toJSON());
    expect(widths).not.toContain(62);
    expect(widths).toContain(60);
  });
});
