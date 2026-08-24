/**
 * Focus filters — dock override per Focus mode (issue #619, filho de #617).
 *
 * Um Modo de Foco pode substituir os 4 ícones do dock (ex.: «Work» mostra só
 * apps de trabalho). O mapa vive em `settings.focusDockOverride` e é
 * `modo -> package names do dock`. Contrato partilhado com o pai #617
 * (SettingsStore.tsx): `Record<string, string[]>`, onde um array vazio
 * significa "manter o dock normal" (iOS «Keep Current») — distinto de uma
 * chave ausente, mas tratado da mesma forma por `dockOverrideForMode`. 'off'
 * nunca tem override, mesmo que exista uma entrada guardada para ele.
 *
 * O AsyncStorage é um blob JSON escrito por versões anteriores da app, por
 * isso tudo o que sai dele é tratado como não confiável — mesmo padrão de
 * `focusPageVisibility.ts`.
 */

/** Mapa canónico no store: chave = modo de Focus, valor = package names do dock. */
export type FocusDockOverride = Record<string, string[]>;

/** Número máximo de apps no dock (mesmo limite do dock normal, AppsStore#addToDock). */
export const MAX_DOCK_APPS = 4;

/**
 * Normaliza o valor lido do AsyncStorage para `Record<string, string[]>`.
 *
 * Descarta: não-objectos, arrays no topo, valores que não sejam array,
 * entradas que não sejam strings não-vazias, e duplicados. Corta cada lista a
 * `MAX_DOCK_APPS` entradas (a mesma garantia que `toggleDockOverrideApp`
 * aplica na escrita).
 */
export function normalizeFocusDockOverride(raw: unknown): FocusDockOverride {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: FocusDockOverride = {};
  for (const [mode, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const seen = new Set<string>();
    const pkgs: string[] = [];
    for (const entry of value) {
      if (typeof entry !== 'string' || entry.trim() === '' || seen.has(entry)) continue;
      seen.add(entry);
      pkgs.push(entry);
    }
    out[mode] = pkgs.slice(0, MAX_DOCK_APPS);
  }
  return out;
}

/**
 * Package names do override para o modo activo, ou `null` quando não há
 * override a aplicar (modo 'off', modo desconhecido, chave ausente, ou lista
 * vazia — "manter o dock normal" em qualquer um destes casos).
 */
export function dockOverrideForMode(
  override: FocusDockOverride | undefined | null,
  mode: string | undefined | null,
): string[] | null {
  if (!override || !mode || mode === 'off') return null;
  const list = override[mode];
  if (!Array.isArray(list) || list.length === 0) return null;
  return list;
}

/**
 * Alterna um package name no override de um modo, devolvendo um mapa novo
 * (nunca muta o anterior). Se o package já está na lista, remove-o; senão
 * adiciona-o, a menos que a lista já tenha `MAX_DOCK_APPS` entradas — nesse
 * caso ignora o pedido silenciosamente, tal como `AppsStore#addToDock` faz
 * para o dock normal.
 */
export function toggleDockOverrideApp(
  override: FocusDockOverride | undefined | null,
  mode: string,
  packageName: string,
): FocusDockOverride {
  const base: FocusDockOverride = { ...(override ?? {}) };
  const current = Array.isArray(base[mode]) ? base[mode] : [];
  if (current.includes(packageName)) {
    base[mode] = current.filter((p) => p !== packageName);
  } else if (current.length < MAX_DOCK_APPS) {
    base[mode] = [...current, packageName];
  }
  return base;
}
