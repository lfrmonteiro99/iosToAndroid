/**
 * Shortcuts (#782, parte de #629): modelo de dados + dispatcher puro de um
 * atalho.
 *
 * Segue o mesmo padrão de `backTap.ts`: as acções são resolvidas e disparadas
 * por funções puras com as dependências nativas injectadas, para que o
 * comportamento seja testável sem montar RN. O único tipo de acção suportado
 * é `setFocusMode` — o repositório já tem um sistema de Focus mode em
 * `SettingsStore` (`settings.focusMode` / `setFocusMode`), e este dispatcher
 * reutiliza-o em vez de manter um estado de "modo" paralelo.
 */

export type ShortcutActionType = 'setFocusMode';

export interface ShortcutAction {
  id: string;
  type: ShortcutActionType;
  /** Etiqueta legível mostrada no Modal de detalhe do atalho. */
  label: string;
  payload?: Record<string, string | number | boolean>;
}

export interface Shortcut {
  id: string;
  name: string;
  actions: ShortcutAction[];
}

/** Dependências nativas/store injectadas — mantém o dispatcher puro e testável. */
export interface ShortcutDeps {
  setFocusMode: (mode: string | null) => void | Promise<unknown>;
}

export interface ShortcutActionResult {
  status: 'ok' | 'noop' | 'error';
  type: ShortcutActionType | 'unknown';
}

const KNOWN_ACTION_TYPES: ReadonlySet<string> = new Set<ShortcutActionType>(['setFocusMode']);

function isKnownActionType(value: unknown): value is ShortcutActionType {
  return typeof value === 'string' && KNOWN_ACTION_TYPES.has(value);
}

/**
 * Dispara uma única acção de um atalho.
 *
 * Contrato: **nunca lança**. Acções desconhecidas ou sem payload válido são
 * no-ops silenciosos; qualquer excepção da dependência injectada vira 'error'
 * (com o motivo em console, para não ficar invisível).
 */
export async function executeShortcutAction(
  action: ShortcutAction,
  deps: ShortcutDeps,
): Promise<ShortcutActionResult> {
  if (!action || !isKnownActionType(action.type)) return { status: 'noop', type: 'unknown' };

  try {
    switch (action.type) {
      case 'setFocusMode': {
        const mode = action.payload?.mode;
        if (typeof mode !== 'string' || mode.trim() === '') {
          return { status: 'noop', type: action.type };
        }
        await deps.setFocusMode(mode);
        return { status: 'ok', type: action.type };
      }
      default:
        // Acção conhecida no union mas sem ramo (extensão futura) — no-op.
        return { status: 'noop', type: 'unknown' };
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[shortcutsDispatch] acção '${action.type}' falhou:`, err);
    return { status: 'error', type: action.type };
  }
}

/** Dispara, em sequência, todas as acções de um atalho. */
export async function executeShortcut(
  shortcut: Pick<Shortcut, 'actions'> | null | undefined,
  deps: ShortcutDeps,
): Promise<ShortcutActionResult[]> {
  if (!shortcut || !Array.isArray(shortcut.actions)) return [];
  const results: ShortcutActionResult[] = [];
  for (const action of shortcut.actions) {
    results.push(await executeShortcutAction(action, deps));
  }
  return results;
}
