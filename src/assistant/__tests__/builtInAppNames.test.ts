/**
 * Which spoken names open which built-in screen.
 *
 * The assistant resolved spoken names against navigation ROUTE names. Three
 * built-ins have a label that differs from their route, so the words printed
 * under the icon did not work while a word that appears nowhere in the UI did.
 */
import {
  builtInLabelForSpokenName,
  builtInPackageForSpokenName,
  builtInRouteForSpokenName,
  SPOKEN_APP_ALIASES,
} from '../builtInAppNames';
import { BUILT_IN_APPS, BUILT_IN_APP_NAMES } from '../../utils/builtInAppRoutes';

describe('the label under the icon resolves', () => {
  it.each(Object.entries(BUILT_IN_APP_NAMES))('%s → %s', (pkg, label) => {
    expect(builtInPackageForSpokenName(label)).toBe(pkg);
  });

  it('the three whose label differs from the route, which is the reported gap', () => {
    expect(builtInRouteForSpokenName('safari')).toBe('Browser');
    expect(builtInRouteForSpokenName('find my')).toBe('FindMy');
    expect(builtInRouteForSpokenName('app store')).toBe('AppStore');
  });
});

describe('the route name still resolves', () => {
  it.each(Object.entries(BUILT_IN_APPS))('%s → %s', (pkg, route) => {
    // Kept deliberately: a shortcut or an automation may already use it.
    expect(builtInPackageForSpokenName(String(route))).toBe(pkg);
  });
});

describe('Portuguese names', () => {
  it.each([
    ['calculadora', 'Calculator'],
    ['notas', 'Notes'],
    ['definições', 'Settings'],
    ['câmara', 'Camera'],
    ['relógio', 'Clock'],
    ['calendário', 'Calendar'],
    ['contactos', 'Contacts'],
    ['tempo', 'Weather'],
    ['meteorologia', 'Weather'],
    ['saúde', 'Health'],
    ['fotografias', 'Photos'],
    ['mapas', 'Maps'],
    ['carteira', 'Wallet'],
    ['lembretes', 'Reminders'],
    ['navegador', 'Browser'],
  ])('%s → %s', (spoken, route) => {
    expect(builtInRouteForSpokenName(spoken)).toBe(route);
  });

  it('resolves with or without accents, since a recognizer may drop them', () => {
    expect(builtInRouteForSpokenName('definicoes')).toBe('Settings');
    expect(builtInRouteForSpokenName('DEFINIÇÕES')).toBe('Settings');
  });

  it('answers with the label, so the reply names what the user will see', () => {
    expect(builtInLabelForSpokenName('navegador')).toBe('Safari');
    expect(builtInLabelForSpokenName('loja')).toBe('App Store');
  });
});

describe('what does not resolve', () => {
  it.each(['', '   ', 'whatsapp', 'spotify', 'uma piada'])('%s', (spoken) => {
    expect(builtInPackageForSpokenName(spoken)).toBeUndefined();
  });
});

it('every alias points at a real built-in package', () => {
  for (const pkg of Object.values(SPOKEN_APP_ALIASES)) {
    expect(BUILT_IN_APPS[pkg]).toBeDefined();
  }
});
