/**
 * Back Tap (#625) + tabela de dispatch das acções (#773): mapeia double/triple
 * tap a uma acção e dispara-a.
 *
 * O repositório não tem sensor de back-tap nativo (e android/ está fora do
 * alcance do issue), por isso o núcleo verificável é a **resolução do
 * mapeamento** e o **dispatch** para as bridges nativas já existentes — o
 * mesmo papel que `launchBuiltIn.ts` tem para o arranque de apps. O detector
 * físico de toques nas costas do dispositivo é um detalhe de UI nativa que se
 * liga a `resolveBackTap`/`executeBackTap`; estas funções são puras e
 * testáveis sem montar RN/Reanimated.
 *
 * Acções suportadas (as 8 de #773 + 'none'):
 *  - 'none'           — sem acção (no-op)
 *  - 'flash'          — alterna a lanterna (setFlashlight + isFlashlightOn)
 *  - 'toggleWifi'     — alterna o Wi-Fi (setWifiEnabled + getWifiEnabled).
 *                       LIMITE Android 10+ (API 29+): não alterna
 *                       silenciosamente, o nativo abre
 *                       `Settings.Panel.ACTION_WIFI`
 *                       (LauncherModule.kt:339-356). O executor aceita o
 *                       limite; a UI documenta-o no footer da secção.
 *  - 'openApp'        — abre uma app por packageName (launchApp)
 *  - 'openCamera'     — abre a câmara (ecrã de câmara in-app; o repositório é
 *                       um launcher e mantém-se in-app, ver CameraScreen.tsx)
 *  - 'shortcut'       — dispara um atalho por id (openShortcut)
 *  - 'screenshot'     — captura de ecrã via MediaProjection; exige
 *                       consentimento explícito por sessão (impossível
 *                       silenciosamente desde Android 5.0), logo o resultado
 *                       pode ser 'denied'/'unavailable'
 *  - 'startRecording' — gravação de ecrã, mesmo padrão de consentimento
 *  - 'sendMessage'    — mensagem pré-definida via Intent ACTION_SENDTO
 *                       (`smsto:`), evitando a permissão SEND_SMS. O
 *                       destinatário e o texto vêm do SettingsStore.
 */

export type BackTapGesture = 'double' | 'triple';

/** Acções que não precisam de alvo adicional. */
export type TargetlessBackTapAction =
  | 'none'
  | 'flash'
  | 'toggleWifi'
  | 'screenshot'
  | 'startRecording'
  | 'openCamera';
/** Acções que precisam de um alvo. */
export type TargetedBackTapAction = 'openApp' | 'shortcut' | 'sendMessage';
export type BackTapAction = TargetlessBackTapAction | TargetedBackTapAction;

export interface BackTapAssignment {
  action: BackTapAction;
  /** Presente apenas quando action === 'openApp'. */
  packageName?: string;
  /** Presente apenas quando action === 'shortcut'. */
  shortcutId?: string;
  /** Presente apenas quando action === 'sendMessage'. Destinatário do smsto:. */
  smsAddress?: string;
  /** Presente apenas quando action === 'sendMessage'. Texto pré-definido. */
  smsBody?: string;
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

/**
 * Tabela de acções conhecidas — fonte única para a normalização, para o
 * dispatch e para o picker da UI, de modo a que acrescentar uma acção não possa
 * deixar um dos três dessincronizado.
 */
export const BACK_TAP_ACTION_IDS: readonly BackTapAction[] = [
  'none',
  'flash',
  'toggleWifi',
  'openApp',
  'openCamera',
  'shortcut',
  'screenshot',
  'startRecording',
  'sendMessage',
] as const;

const KNOWN_ACTIONS: ReadonlySet<string> = new Set<string>(BACK_TAP_ACTION_IDS);

const TARGETED_ACTIONS: ReadonlySet<BackTapAction> = new Set<TargetedBackTapAction>([
  'openApp',
  'shortcut',
  'sendMessage',
]);

/** Chave do alvo obrigatório de cada acção com alvo. */
const TARGET_KEY: Record<TargetedBackTapAction, 'packageName' | 'shortcutId' | 'smsAddress'> = {
  openApp: 'packageName',
  shortcut: 'shortcutId',
  sendMessage: 'smsAddress',
};

/** True apenas para acções que existem no union de tipos. */
function isKnownAction(value: unknown): value is BackTapAction {
  return typeof value === 'string' && KNOWN_ACTIONS.has(value);
}

/** True para acções que exigem alvo (packageName/shortcutId/smsAddress). */
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
 * `launchApp(undefined)` partido, que um `sendMessage` sem destinatário abra um
 * `smsto:undefined`, e que uma acção inventada por uma versão futura/retrógrada
 * passe despercebida.
 */
export function normalizeBackTapAssignment(raw: unknown): BackTapAssignment {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { action: 'none' };
  const candidate = raw as Record<string, unknown>;
  if (!isKnownAction(candidate.action)) return { action: 'none' };

  const action = candidate.action;
  if (!isTargetedAction(action)) return { action };

  const targetKey = TARGET_KEY[action];
  const target = candidate[targetKey];
  if (typeof target !== 'string' || target.trim() === '') return { action: 'none' };

  if (action === 'sendMessage') {
    // O corpo é opcional (uma mensagem vazia continua a abrir o compositor com
    // o destinatário), mas nunca propaga um valor não-string para o intent.
    const body = typeof candidate.smsBody === 'string' ? candidate.smsBody : '';
    return { action, smsAddress: target, smsBody: body };
  }

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
 * Resultado de um pedido de consentimento MediaProjection (screenshot /
 * gravação). Desde Android 5.0 não existe captura silenciosa: o utilizador tem
 * de aceitar o diálogo do sistema em cada sessão, e pode recusar.
 */
export type ConsentOutcome = 'granted' | 'denied' | 'unavailable';

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
  /** Captura de ecrã via MediaProjection — devolve o desfecho do consentimento. */
  screenshot: () => ConsentOutcome | Promise<ConsentOutcome>;
  openShortcut: (id: string) => void | Promise<unknown>;
  /** Abre a câmara (ecrã in-app). */
  openCamera: () => void | Promise<unknown>;
  /** Inicia a gravação de ecrã — mesmo consentimento do screenshot. */
  startRecording: () => ConsentOutcome | Promise<ConsentOutcome>;
  /** Abre o compositor de mensagem (ACTION_SENDTO / smsto:) pré-preenchido. */
  sendMessage: (address: string, body: string) => void | Promise<unknown>;
}

/** Desfecho de um dispatch, para a UI poder avisar o utilizador. */
export interface BackTapResult {
  status: 'ok' | 'noop' | 'denied' | 'unavailable' | 'error';
  action: BackTapAction;
}

/**
 * Dispara a acção resolvida através das bridges nativas.
 *
 * Contrato: **nunca lança**. Um back tap é um gesto acidental por natureza —
 * uma bridge indisponível não pode derrubar o detector. As acções `none`,
 * desconhecidas, ou com alvo em falta são no-ops silenciosos (nunca se tenta
 * construir um intent partido); as de consentimento propagam
 * `denied`/`unavailable` para a UI decidir o que dizer; qualquer excepção da
 * bridge vira `error` (com o motivo em console, para não ficar invisível).
 */
export async function executeBackTap(
  assignment: BackTapAssignment,
  deps: BackTapDeps,
): Promise<BackTapResult> {
  const { action } = assignment;
  if (!isKnownAction(action)) return { status: 'noop', action: 'none' };
  if (action === 'none') return { status: 'noop', action: 'none' };

  try {
    switch (action) {
      case 'flash': {
        const on = await deps.isFlashlightOn();
        await deps.setFlashlight(!on);
        return { status: 'ok', action };
      }
      case 'toggleWifi': {
        // Android 10+: o nativo abre o Settings Panel em vez de alternar —
        // limite aceite (ver cabeçalho), por isso 'ok' significa "pedido
        // entregue", não "estado do Wi-Fi trocado".
        const on = await deps.getWifiEnabled();
        await deps.setWifiEnabled(!on);
        return { status: 'ok', action };
      }
      case 'openApp': {
        const pkg = assignment.packageName;
        if (typeof pkg !== 'string' || pkg.trim() === '') return { status: 'noop', action };
        await deps.launchApp(pkg);
        return { status: 'ok', action };
      }
      case 'openCamera': {
        await deps.openCamera();
        return { status: 'ok', action };
      }
      case 'shortcut': {
        const id = assignment.shortcutId;
        if (typeof id !== 'string' || id.trim() === '') return { status: 'noop', action };
        await deps.openShortcut(id);
        return { status: 'ok', action };
      }
      case 'screenshot': {
        const outcome = await deps.screenshot();
        return { status: outcome === 'granted' ? 'ok' : outcome, action };
      }
      case 'startRecording': {
        const outcome = await deps.startRecording();
        return { status: outcome === 'granted' ? 'ok' : outcome, action };
      }
      case 'sendMessage': {
        const address = assignment.smsAddress;
        if (typeof address !== 'string' || address.trim() === '') return { status: 'noop', action };
        await deps.sendMessage(address, assignment.smsBody ?? '');
        return { status: 'ok', action };
      }
      default:
        // Acção válida mas sem ramo (união estendida no futuro) — no-op.
        return { status: 'noop', action };
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[backTap] acção '${action}' falhou:`, err);
    return { status: 'error', action };
  }
}
