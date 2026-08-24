import React from 'react';
import { render, waitFor, within } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import { LauncherHomeScreen } from '../LauncherHomeScreen';

// #760: homeApps.position passa a ser a fonte de verdade da ordem da grelha —
// antes deste fix, gridItems/allPages (LauncherHomeScreen.tsx) iteravam
// nonDockApps pela ordem de state.allApps (ordem do scan nativo), ignorando
// completamente `position`.
function mockApps(overrides: Record<string, unknown> = {}) {
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps: [],
    homeApps: [],
    dockApps: [],
    nonDockApps: [],
    recentPackages: [],
    recentApps: [],
    isLoading: false,
    compactHomeLayout: jest.fn(),
    refreshApps: jest.fn(() => Promise.resolve()),
    launchApp: jest.fn(() => Promise.resolve(true)),
    addToHome: jest.fn(),
    removeFromHome: jest.fn(),
    addToDock: jest.fn(),
    removeFromDock: jest.fn(),
    removeFromRecents: jest.fn(),
    clearRecents: jest.fn(),
    isDefaultLauncher: true,
    openLauncherSettings: jest.fn(() => Promise.resolve()),
    hiddenApps: [],
    visibleApps: [],
    hideApp: jest.fn(),
    unhideApp: jest.fn(),
    iconCacheSizeBytes: 0,
    isRebuildingIconCache: false,
    iconCacheRebuildProgress: null,
    rebuildIconCache: jest.fn(() => Promise.resolve()),
    ...overrides,
  } as ReturnType<typeof AppsStore.useApps>);
}

afterEach(() => {
  jest.restoreAllMocks();
});

const alpha = { name: 'Alpha', packageName: 'com.example.alpha', icon: '', isSystem: false };
const beta = { name: 'Beta', packageName: 'com.example.beta', icon: '', isSystem: false };
const gamma = { name: 'Gamma', packageName: 'com.example.gamma', icon: '', isSystem: false };

async function renderOrderedLabels(overrides: Record<string, unknown>) {
  mockApps(overrides);
  const { getByTestId } = render(<LauncherHomeScreen />);
  await waitFor(() => expect(getByTestId('launcher-page-grid-0')).toBeTruthy(), { timeout: 3000 });

  return within(getByTestId('launcher-page-grid-0'))
    .getAllByRole('button')
    .map((n) => n.props.accessibilityLabel as string)
    .filter((l) => ['Open Alpha', 'Open Beta', 'Open Gamma'].includes(l));
}

describe('LauncherHomeScreen — a grelha ordena por homeApps.position (#760)', () => {
  it('ordena por position quando diverge da ordem de scan (allApps/nonDockApps)', async () => {
    // Ordem de scan: Alpha, Beta, Gamma — mas Beta tem a menor position.
    const order = await renderOrderedLabels({
      nonDockApps: [alpha, beta, gamma],
      homeApps: [
        { packageName: 'com.example.alpha', position: 2 },
        { packageName: 'com.example.beta', position: 0 },
        { packageName: 'com.example.gamma', position: 1 },
      ],
    });

    expect(order).toEqual(['Open Beta', 'Open Gamma', 'Open Alpha']);
  });

  it('instalação limpa (sem homeApps persistido) mantém a ordem de scan actual', async () => {
    const order = await renderOrderedLabels({
      nonDockApps: [alpha, beta, gamma],
      homeApps: [],
    });

    expect(order).toEqual(['Open Alpha', 'Open Beta', 'Open Gamma']);
  });
});
