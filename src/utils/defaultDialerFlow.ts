/**
 * Default Dialer request flow (#919, passo 4 de #378).
 *
 * O InCallService só substitui a UI de chamada de outra app instalada depois
 * de este launcher ser escolhido como Dialer por defeito (RoleManager em API
 * 29+, ACTION_CHANGE_DEFAULT_DIALER abaixo). O pedido tem de ser feito **em
 * contexto** — quando o utilizador está mesmo a fazer uma chamada — nunca no
 * arranque, e nunca repetido depois de recusado.
 *
 * `defaultDialerFlowReducer` é a máquina de estados pura: dado o estado actual
 * e um evento, devolve o próximo estado. Não toca em bridges nativas nem em
 * storage — por isso é testável sem device. `runDefaultDialerFlow` é o
 * orquestrador que liga essa máquina às dependências reais (injectadas, para
 * continuar testável sem device).
 */

export type DefaultDialerFlowState =
  | 'unknown'
  | 'default'
  | 'eligible'
  | 'prompting'
  | 'declined';

export type DefaultDialerFlowEvent =
  | { type: 'CHECKED'; isDefault: boolean; previouslyDeclined: boolean }
  | { type: 'CALL_CONTEXT_ENTERED' }
  | { type: 'REQUEST_LAUNCHED' }
  | { type: 'REQUEST_FAILED' }
  | { type: 'BECAME_DEFAULT' };

export const INITIAL_DEFAULT_DIALER_FLOW_STATE: DefaultDialerFlowState = 'unknown';

/**
 * Pure transition function. Unhandled (state, event) pairs return the state
 * unchanged — in particular:
 *  - CALL_CONTEXT_ENTERED only fires the prompt from 'eligible'. From
 *    'unknown' (isDefaultDialer() failed/never ran), 'default', 'prompting'
 *    (a prompt is already in flight) or 'declined', it is a no-op. This is
 *    what stops the request firing on app start (CHECKED is never emitted at
 *    startup) and what stops it repeating after a decline.
 *  - REQUEST_LAUNCHED / REQUEST_FAILED only resolve a state that is actually
 *    'prompting' — a stray result from an unrelated flow cannot move the
 *    machine.
 */
export function defaultDialerFlowReducer(
  state: DefaultDialerFlowState,
  event: DefaultDialerFlowEvent,
): DefaultDialerFlowState {
  switch (event.type) {
    case 'CHECKED':
      if (event.isDefault) return 'default';
      return event.previouslyDeclined ? 'declined' : 'eligible';
    case 'CALL_CONTEXT_ENTERED':
      return state === 'eligible' ? 'prompting' : state;
    case 'REQUEST_LAUNCHED':
      // The system dialog was shown to the user; until the next CHECKED
      // (typically on the next call attempt) confirms otherwise, treat this
      // as "already asked" so a second call placed moments later does not
      // prompt again while the first dialog is still being decided.
      return state === 'prompting' ? 'declined' : state;
    case 'REQUEST_FAILED':
      // The intent could not be launched (no activity, exception) — nothing
      // was shown to the user, so this is retriable on the next call.
      return state === 'prompting' ? 'eligible' : state;
    case 'BECAME_DEFAULT':
      return 'default';
    default:
      return state;
  }
}

export interface DefaultDialerFlowDeps {
  isDefaultDialer: () => Promise<boolean>;
  requestDefaultDialer: () => Promise<boolean>;
  getDeclined: () => boolean;
  setDeclined: (declined: boolean) => void;
}

/**
 * Runs one in-context pass of the flow. Callers invoke this only when the
 * user is actually placing a call (CallScreen mount) — never at app start.
 *
 * If `isDefaultDialer()` itself throws (bridge error), the pass ends in
 * 'unknown' without prompting: we could not verify the current role, and
 * prompting on top of an unverified read risks re-asking someone who is
 * already the default dialer.
 */
export async function runDefaultDialerFlow(
  deps: DefaultDialerFlowDeps,
): Promise<DefaultDialerFlowState> {
  let isDefault: boolean;
  try {
    isDefault = await deps.isDefaultDialer();
  } catch {
    return 'unknown';
  }

  let state = defaultDialerFlowReducer(INITIAL_DEFAULT_DIALER_FLOW_STATE, {
    type: 'CHECKED',
    isDefault,
    previouslyDeclined: deps.getDeclined(),
  });

  state = defaultDialerFlowReducer(state, { type: 'CALL_CONTEXT_ENTERED' });
  if (state !== 'prompting') return state;

  let launched: boolean;
  try {
    launched = await deps.requestDefaultDialer();
  } catch {
    launched = false;
  }

  state = defaultDialerFlowReducer(state, {
    type: launched ? 'REQUEST_LAUNCHED' : 'REQUEST_FAILED',
  });

  if (state === 'declined') deps.setDeclined(true);
  return state;
}
