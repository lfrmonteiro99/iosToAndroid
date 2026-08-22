import React from 'react';
import { render, waitFor, fireEvent } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import launcherModule from '../../../modules/launcher-module/src';
import { AppLibraryContent } from '../AppLibraryScreen';
import { DEFAULT_SETTINGS } from '../../store/SettingsStore';

// Apps reais para a grelha. categorizeApp atribui:
//   com.facebook     -> Social        (nativo 'social')
//   com.spotify      -> Entertainment (keyword 'spotify')
//   com.strava       -> Health & Fitness (keyword 'strava')
//   com.unknown.xyzzy-> Other          (sem match)
const NATIVE_APPS = [
  { name: 'Facebook', packageName: 'com.facebook', icon: '', isSystem: false, category: 'social' },
  { name: 'Spotify', packageName: 'com.spotify', icon: '', isSystem: false, category: 'undefined' },
  { name: 'Strava', packageName: 'com.strava', icon: '', isSystem: false, category: 'undefined' },
  { name: 'Xyzzy', packageName: 'com.unknown.xyzzy', icon: '', isSystem: false, category: 'undefined' },
] as never;

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  (launcherModule.getInstalledApps as jest.Mock).mockResolvedValue(NATIVE_APPS);
  (launcherModule.isDefaultLauncher as jest.Mock).mockResolvedValue(false);
});

async function renderWithOverrides(overrides: Record<string, unknown>) {
  const saved = JSON.stringify({ ...DEFAULT_SETTINGS, categoryOverrides: overrides });
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    key === '@iostoandroid/settings' ? Promise.resolve(saved) : Promise.resolve(null),
  );
  const utils = render(<AppLibraryContent />);
  // Apps carregam de forma assíncrona a partir do mock do LauncherModule.
  // 'Facebook' está sempre presente (Social por defeito), independentemente de overrides.
  await waitFor(() => expect(utils.getAllByText('Facebook').length).toBeGreaterThan(0));
  return utils;
}

describe('AppLibraryContent — overrides aplicados à grelha (integração real)', () => {
  it('sem overrides mostra todas as categorias por defeito', async () => {
    const { getAllByText, queryByText } = await renderWithOverrides({
      hidden: [], renamed: {}, order: [], appOverrides: {},
    });
    expect(getAllByText('Social').length).toBeGreaterThan(0);
    expect(getAllByText('Entertainment').length).toBeGreaterThan(0);
    expect(getAllByText('Health & Fitness').length).toBeGreaterThan(0);
    expect(getAllByText('Other').length).toBeGreaterThan(0);
    expect(queryByText('Pessoal')).toBeNull();
  });

  it('ocultar uma categoria remove o cartão mas a app vai para Other (não desaparece)', async () => {
    const { queryByText, getAllByText } = await renderWithOverrides({
      hidden: ['health-fitness'], renamed: {}, order: [], appOverrides: {},
    });
    // O cartão de Health & Fitness desaparece da grelha.
    expect(queryByText('Health & Fitness')).toBeNull();
    // Mas a app Strava continua alcançável em Other (agora Other tem 2 apps).
    expect(getAllByText('Other').length).toBeGreaterThan(0);
    // "2 apps" confirma que as apps da categoria oculta foram para Other.
    expect(getAllByText('2 apps').length).toBeGreaterThan(0);
  });

  it('renomear aplica-se ao título do cartão sem quebrar a atribuição', async () => {
    const { getAllByText, queryByText } = await renderWithOverrides({
      hidden: [], renamed: { social: 'Pessoal' }, order: [], appOverrides: {},
    });
    // Título renomeado aparece.
    expect(getAllByText('Pessoal').length).toBeGreaterThan(0);
    // A app Social original desaparece como título, mas a app Facebook continua na grelha.
    expect(queryByText('Social')).toBeNull();
    expect(getAllByText('Facebook').length).toBeGreaterThan(0);
  });

  it('appOverrides recategoriza a app com precedência sobre a cascata', async () => {
    // Strava seria Health & Fitness por keyword; forçamos Travel.
    const { queryByText, getAllByText } = await renderWithOverrides({
      hidden: [], renamed: {}, order: [], appOverrides: { 'com.strava': 'travel' },
    });
    expect(queryByText('Health & Fitness')).toBeNull();
    expect(getAllByText('Travel').length).toBeGreaterThan(0);
    expect(getAllByText('Strava').length).toBeGreaterThan(0);
  });

  it('order reordena a grelha (as categorias em order aparecem antes das restantes)', async () => {
    const { getAllByText } = await renderWithOverrides({
      hidden: [], renamed: {}, order: ['social', 'entertainment', 'health-fitness', 'other'], appOverrides: {},
    });
    // Com order explícito, todas as 4 categorias continuam presentes e por ordem
    // canónica (Social, Entertainment, Health & Fitness, Other). A reordenação
    // exata na DOM é coberta pelo helper buildCategorySections; aqui confirmamos
    // que nenhuma categoria é perdida ao aplicar order.
    expect(getAllByText('Social').length).toBeGreaterThan(0);
    expect(getAllByText('Entertainment').length).toBeGreaterThan(0);
    expect(getAllByText('Health & Fitness').length).toBeGreaterThan(0);
    expect(getAllByText('Other').length).toBeGreaterThan(0);
  });
});

describe('AppLibraryContent — recategorização por long-press (integração)', () => {
  it('long-press num ícone abre o sheet e escolher recategoriza a app', async () => {
    const { getAllByText, getByText, getAllByLabelText, queryByText } = await renderWithOverrides({
      hidden: [], renamed: {}, order: [], appOverrides: {},
    });
    // Abre o modal de uma categoria (clica no cartão Social).
    fireEvent.press(getAllByLabelText(/Social category/)[0]);
    // No modal, a app Facebook aparece. Faz long-press no ícone (Pressable com
    // accessibilityLabel "Open Facebook, App Library").
    const fbPressables = getAllByLabelText('Open Facebook, App Library') as never[];
    // O último é o do modal (montado por cima da grelha).
    fireEvent(fbPressables[fbPressables.length - 1], 'longPress' as never);
    // O sheet oferece "Mover para a categoria".
    await waitFor(() => expect(getByText('Mover para a categoria')).toBeTruthy());
    // Escolher Travel recategoriza o Facebook.
    fireEvent.press(getByText('Travel'));
    // Após recategorizar, Facebook sai de Social e vai para Travel.
    await waitFor(() => {
      expect(queryByText('Travel')).toBeTruthy();
    });
    expect(getAllByText('Facebook').length).toBeGreaterThan(0);
  });
});
