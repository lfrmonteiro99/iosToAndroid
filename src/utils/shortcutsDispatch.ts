/**
 * Shortcuts (#782, parte de #629): modelo de dados + dispatcher puro de um
 * atalho.
 *
 * O modelo de dados é PARTILHADO com `src/store/ShortcutsStore.tsx`: o store
 * importa e re-exporta estes mesmos tipos (Shortcut/ShortcutAction) e a nossa
 * única fonte de verdade é este ficheiro — não há duas definições a divergir.
 *
 * Segue o mesmo padrão de `backTap.ts`: as acções são resolvidas e disparadas
 * por funções puras com as dependências nativas injectadas, para que o
 * comportamento seja testável sem montar RN.
 *
 * O modelo suporta dois tipos de acção:
 *  - `setFocusMode` — reutiliza o Focus mode já existente em `SettingsStore`
 *    (`settings.focusMode` / `setFocusMode`), em vez de manter um estado de
 *    "modo" paralelo. É o único tipo que os templates embutidos do #782 usam.
 *  - `launchApp` — lançamento de uma app por packageName (caminho futuro de
 *    atalhos genéricos). O dispatcher executa-o apenas quando o chamador injeta
 *    a dependência `launchApp`; sem ela, a acção é um no-op declarado (não um
 *    erro silencioso), porque o ecrã #782 não a utiliza.
 */

export type ShortcutActionType = 'launchApp' | 'setFocusMode';

export interface ShortcutAction {
  type: ShortcutActionType;
  /** Payload livre; para `setFocusMode` espera-se `{ mode: string }`, para
   * `launchApp` espera-se `{ packageName: string }`. */
  payload: Record<string, unknown>;
}

export interface Shortcut {
  id: string;
  name: string;
  icon: string;
  actions: ShortcutAction[];
}

/** Dependências nativas/store injectadas — mantém o dispatcher puro e testável. */
export interface ShortcutDeps {
  setFocusMode: (mode: string | null) => void | Promise<unknown>;
  /** Opcional: só necessário para executar acções `launchApp`. */
  launchApp?: (packageName: string) => void | Promise<unknown>;
}

export interface ShortcutActionResult {
  status: 'ok' | 'noop' | 'error';
  type: ShortcutActionType | 'unknown';
}

const KNOWN_ACTION_TYPES: ReadonlySet<string> = new Set<ShortcutActionType>(['launchApp', 'setFocusMode']);

function isKnownActionType(value: unknown): value is ShortcutActionType {
  return typeof value === 'string' && KNOWN_ACTION_TYPES.has(value);
}

/**
 * Etiqueta legível de uma acção, para o Modal de detalhe do atalho.
 * Derivada dos dados (não guardada no modelo) para não duplicar estado.
 */
export function describeShortcutAction(action: ShortcutAction): string {
  switch (action.type) {
    case 'setFocusMode': {
      const mode = action.payload?.mode;
      if (typeof mode === 'string' && mode.trim() !== '') {
        return `Set Focus mode to ${mode[0].toUpperCase()}${mode.slice(1)}`;
      }
      return 'Set Focus mode';
    }
    case 'launchApp': {
      const pkg = action.payload?.packageName;
      return typeof pkg === 'string' ? `Open ${pkg}` : 'Open app';
    }
    default:
      return action.type;
  }
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
      case 'launchApp': {
        const packageName = action.payload?.packageName;
        if (typeof packageName !== 'string' || packageName.trim() === '') {
          return { status: 'noop', type: action.type };
        }
        if (!deps.launchApp) return { status: 'noop', type: action.type };
        await deps.launchApp(packageName);
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
