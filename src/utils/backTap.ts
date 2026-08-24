/**
 * Back Tap (#625): mapeia double/triple tap a uma acção e dispara-a.
 *
 * O repositório não tem sensor de back-tap nativo (e android/ está fora do
 * alcance do issue), por isso o núcleo verificável é a **resolução do
 * mapeamento** e o **dispatch** para as bridges nativas já existentes — o
 * mesmo papel que `launchBuiltIn.ts` tem para o arranque de apps. O detector
 * físico de toques nas costas do dispositivo é um detalhe de UI nativa que se
 * liga a `resolveBackTap`/`executeBackTap`; estas funções são puras e
 * testáveis sem montar RN/Reanimated.
 *
 * Acções suportadas:
 *  - 'none'          — sem acção (no-op)
 *  - 'flash'         — alterna a lanterna (setFlashlight + isFlashlightOn)
 *  - 'toggleWifi'    — alterna o Wi-Fi (setWifiEnabled + getWifiEnabled)
 *  - 'openApp'       — abre uma app por packageName (launchApp)
 *  - 'shortcut'      — dispara um atalho por id (openShortcut)
 *  - 'screenshot'    — captura de ecrã (screenshot)
 */

export type BackTapGesture = 'double' | 'triple';

/** Acções que não precisam de alvo adicional. */
export type TargetlessBackTapAction = 'none' | 'flash' | 'toggleWifi' | 'screenshot';
/** Acções que precisam de um alvo. */
export type TargetedBackTapAction = 'openApp' | 'shortcut';
export type BackTapAction = TargetlessBackTapAction | TargetedBackTapAction;

export interface BackTapAssignment {
  action: BackTapAction;
  /** Presente apenas quando action === 'openApp'. */
  packageName?: string;
  /** Presente apenas quando action === 'shortcut'. */
  shortcutId?: string;
}

export interface BackTapConfig {
  /** Master on/off, tal como AssistiveTouch.enabled. */
  enabled: boolean;
  /** Atribuição para o double tap. */
  double: BackTapAssignment;
  /** Atribuição para o triple tap. */
  triple: BackTapAssignment;
}

export const DEFAULT_BACK_TAP: BackTapConfig = {
  enabled: false,
  double: { action: 'none' },
  triple: { action: 'none' },
};

const KNOWN_ACTIONS: ReadonlySet<string> = new Set<BackTapAction>([
  'none',
  'flash',
  'toggleWifi',
  'openApp',
  'shortcut',
  'screenshot',
]);

const TARGETED_ACTIONS: ReadonlySet<BackTapAction> = new Set<TargetedBackTapAction>([
  'openApp',
  'shortcut',
]);

/** True apenas para acções que existem no union de tipos. */
function isKnownAction(value: unknown): value is BackTapAction {
  return typeof value === 'string' && KNOWN_ACTIONS.has(value);
}

/** True para acções que exigem alvo (packageName/shortcutId). */
function isTargetedAction(action: BackTapAction): action is TargetedBackTapAction {
  return TARGETED_ACTIONS.has(action);
}

/**
 * Normaliza uma atribuição lida do AsyncStorage.
 *
 * Devolve `{ action: 'none' }` em qualquer caso que não seja um mapeamento
 * válido e seguro de disparar:
 *  - acção desconhecida (não no union)
 *  - acção que exige alvo mas o alvo está ausente/vazio
 *  - blob corrompido (não-objecto)
 *
 * Isto impede que um `action: 'openApp'` sem `packageName` dispare um
 * `launchApp(undefined)` partido, e que uma acção inventada por uma versão
 * futura/retrógrada passe despercebida.
 */
export function normalizeBackTapAssignment(raw: unknown): BackTapAssignment {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { action: 'none' };
  const candidate = raw as Record<string, unknown>;
  if (!isKnownAction(candidate.action)) return { action: 'none' };

  const action = candidate.action;
  if (!isTargetedAction(action)) return { action };

  // openApp -> packageName; shortcut -> shortcutId
  const targetKey = action === 'openApp' ? 'packageName' : 'shortcutId';
  const target = candidate[targetKey];
  if (typeof target !== 'string' || target.trim() === '') return { action: 'none' };

  return { action, [targetKey]: target } as BackTapAssignment;
}

/**
 * Normaliza a configuração completa de Back Tap lida do AsyncStorage para o
 * `BackTapConfig` canónico. `enabled` não-booleano é forçado para false;
 * `double`/`triple` são normalizados independentemente, por isso um gesto
 * corrompido não contamina o outro.
 */
export function normalizeBackTap(raw: unknown): BackTapConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return DEFAULT_BACK_TAP;
  const c = raw as Record<string, unknown>;
  return {
    enabled: typeof c.enabled === 'boolean' ? c.enabled : false,
    double: normalizeBackTapAssignment(c.double),
    triple: normalizeBackTapAssignment(c.triple),
  };
}

/**
 * Resolve que acção disparar para um gesto, dado o config. Devolve
 * `{ action: 'none' }` quando o config está desactivado, é nulo/ausente, ou o
 * gesto é desconhecido — nunca lança excepção, para que um double/triple tap
 * num estado inválido seja simplesmente ignorado em vez de rebentar o
 * detector de gestos.
 */
export function resolveBackTap(
  gesture: BackTapGesture | string | unknown,
  config: BackTapConfig | null | undefined,
): BackTapAssignment {
  if (!config || !config.enabled) return { action: 'none' };
  if (gesture !== 'double' && gesture !== 'triple') return { action: 'none' };
  const assignment = config[gesture];
  // Defesa em profundidade: se a atribuição em si for inválida, trata como none.
  if (!assignment || !isKnownAction(assignment.action)) return { action: 'none' };
  return assignment;
}

/**
 * Dependências nativas injectadas — mantém a função pura e testável. Cada
 * dep espelha a ponte correspondente em `modules/launcher-module/src`.
 */
export interface BackTapDeps {
  launchApp: (packageName: string) => void | Promise<unknown>;
  setFlashlight: (on: boolean) => void | Promise<unknown>;
  getWifiEnabled: () => boolean | Promise<boolean>;
  setWifiEnabled: (on: boolean) => void | Promise<unknown>;
  isFlashlightOn: () => boolean | Promise<boolean>;
  screenshot: () => void | Promise<unknown>;
  openShortcut: (id: string) => void | Promise<unknown>;
}

/**
 * Dispara a acção resolvida através das bridges nativas. Acções inválidas ou
 * `none` são no-ops silenciosos — nunca se tenta construir um intent partido.
 */
export async function executeBackTap(
  assignment: BackTapAssignment,
  deps: BackTapDeps,
): Promise<void> {
  const { action } = assignment;
  if (!isKnownAction(action)) return; // acção desconhecida -> no-op

  switch (action) {
    case 'none':
      return;
    case 'flash': {
      const on = await deps.isFlashlightOn();
      await deps.setFlashlight(!on);
      return;
    }
    case 'toggleWifi': {
      const on = await deps.getWifiEnabled();
      await deps.setWifiEnabled(!on);
      return;
    }
    case 'openApp': {
      const pkg = assignment.packageName;
      if (typeof pkg !== 'string' || pkg.trim() === '') return;
      await deps.launchApp(pkg);
      return;
    }
    case 'shortcut': {
      const id = assignment.shortcutId;
      if (typeof id !== 'string' || id.trim() === '') return;
      await deps.openShortcut(id);
      return;
    }
    case 'screenshot': {
      await deps.screenshot();
      return;
    }
    default:
      // Acção válida mas sem ramo (ex.: união estendida no futuro) — no-op.
      return;
  }
}
