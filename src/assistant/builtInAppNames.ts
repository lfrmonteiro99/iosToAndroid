/**
 * Resolving a SPOKEN app name to a built-in screen.
 *
 * The assistant matched spoken names against the navigation ROUTE names, which
 * are not what the user sees or says. Three of them differ from the label under
 * the icon, so "open Safari", "open Find My" and "open App Store" all failed
 * while "open Browser" — a word that appears nowhere in the UI — worked.
 *
 * And no Portuguese name resolved at all, even though the assistant now
 * transcribes and answers in Portuguese: "abre a calculadora" reached
 * OPEN_APP with appName "calculadora", which matched neither the route
 * ("Calculator") nor any installed Android package.
 *
 * So a name is resolved against, in order: the label under the icon, the route
 * name (kept for compatibility — a shortcut or automation may already use it),
 * and the spoken aliases below.
 */
import { BUILT_IN_APPS, BUILT_IN_APP_NAMES } from '../utils/builtInAppRoutes';
import type { RootStackParamList } from '../navigation/types';

/** Lower-cased and accent-stripped, so "Câmara" and "camara" are one key. */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/**
 * Spoken name → package, for names neither table carries.
 *
 * Portuguese first, since that is the gap, plus the English words people say
 * instead of the label ("browser" for Safari, "the app store"). Several names
 * map to one app on purpose: "tempo" and "meteorologia" are both Weather, and
 * either is what someone might say.
 */
export const SPOKEN_APP_ALIASES: Record<string, string> = {
  // Portuguese
  telefone: 'com.iostoandroid.phone',
  chamadas: 'com.iostoandroid.phone',
  mensagens: 'com.iostoandroid.messages',
  sms: 'com.iostoandroid.messages',
  contactos: 'com.iostoandroid.contacts',
  definicoes: 'com.iostoandroid.settings',
  ajustes: 'com.iostoandroid.settings',
  configuracoes: 'com.iostoandroid.settings',
  tempo: 'com.iostoandroid.weather',
  meteorologia: 'com.iostoandroid.weather',
  saude: 'com.iostoandroid.health',
  relogio: 'com.iostoandroid.clock',
  despertador: 'com.iostoandroid.clock',
  camara: 'com.iostoandroid.camera',
  fotos: 'com.iostoandroid.photos',
  fotografias: 'com.iostoandroid.photos',
  galeria: 'com.iostoandroid.photos',
  calendario: 'com.iostoandroid.calendar',
  calculadora: 'com.iostoandroid.calculator',
  notas: 'com.iostoandroid.notes',
  lembretes: 'com.iostoandroid.reminders',
  atalhos: 'com.iostoandroid.shortcuts',
  correio: 'com.iostoandroid.mail',
  email: 'com.iostoandroid.mail',
  navegador: 'com.iostoandroid.browser',
  internet: 'com.iostoandroid.browser',
  carteira: 'com.iostoandroid.wallet',
  mapas: 'com.iostoandroid.maps',
  'encontrar': 'com.iostoandroid.findmy',
  'loja': 'com.iostoandroid.appstore',
  'loja de apps': 'com.iostoandroid.appstore',
  // English words that are not the label
  browser: 'com.iostoandroid.browser',
  web: 'com.iostoandroid.browser',
  'find my iphone': 'com.iostoandroid.findmy',
  'app store': 'com.iostoandroid.appstore',
  'the app store': 'com.iostoandroid.appstore',
};

/** folded spoken name → package, from the label and route tables plus aliases. */
function buildIndex(): Record<string, string> {
  const index: Record<string, string> = {};
  // Aliases first so the tables below win on a collision: a label is what the
  // user is looking at, and should never be shadowed by an alias.
  for (const [name, pkg] of Object.entries(SPOKEN_APP_ALIASES)) {
    index[fold(name)] = pkg;
  }
  for (const [pkg, route] of Object.entries(BUILT_IN_APPS)) {
    index[fold(String(route))] = pkg;
  }
  for (const [pkg, label] of Object.entries(BUILT_IN_APP_NAMES)) {
    index[fold(label)] = pkg;
  }
  return index;
}

const INDEX = buildIndex();

/** The package a spoken name refers to, or undefined for a name we don't know. */
export function builtInPackageForSpokenName(spoken: string): string | undefined {
  const key = fold(spoken);
  if (key.length === 0) return undefined;
  return INDEX[key];
}

/**
 * The route to navigate to for a spoken name.
 *
 * Built-in apps are virtual screens of this app, not Android packages, so the
 * assistant has to navigate rather than ask the native launcher to start them
 * (issue #700).
 */
export function builtInRouteForSpokenName(
  spoken: string,
): keyof RootStackParamList | undefined {
  const pkg = builtInPackageForSpokenName(spoken);
  return pkg ? BUILT_IN_APPS[pkg] : undefined;
}

/** The label under the icon, for the reply — "A abrir Safari", not "Browser". */
export function builtInLabelForSpokenName(spoken: string): string | undefined {
  const pkg = builtInPackageForSpokenName(spoken);
  if (!pkg) return undefined;
  return BUILT_IN_APP_NAMES[pkg] ?? String(BUILT_IN_APPS[pkg] ?? '');
}
