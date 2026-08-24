/**
 * Primitives: a catalog of executable actions + a sequential runner.
 *
 * Pure and framework-free (no React, no native module, no store) so it is
 * unit-testable in isolation — mirroring `commandParser.ts`. Each action's
 * real side effects are injected through `ActionContext`, which keeps the
 * runner deterministic and lets callers (Siri, Shortcuts, automations) wire
 * the actual effect (native launch, SMS bridge, focus-mode store, …) without
 * this module knowing about them.
 *
 * The runner executes actions one after another, in order, awaiting each
 * before starting the next. A single action failing (invalid arguments, a
 * rejected bridge call, a thrown exception) is recorded and the run continues
 * — a bad step must not abort the rest of a sequence.
 */

export type DndMode = 'doNotDisturb' | 'sleep' | 'work' | 'personal';

export const DND_MODES: readonly DndMode[] = ['doNotDisturb', 'sleep', 'work', 'personal'];

export type PrimitiveActionKind =
  | 'openApp'
  | 'sendMessage'
  | 'timer'
  | 'dnd'
  | 'deepLink';

export type PrimitiveAction =
  | { kind: 'openApp'; packageName: string }
  | { kind: 'sendMessage'; address: string; body: string }
  | { kind: 'timer'; seconds: number }
  | { kind: 'dnd'; enabled: boolean; mode?: DndMode }
  | { kind: 'deepLink'; uri: string };

export interface ActionContext {
  /** Open an installed app by package name. Resolves false when not launchable. */
  launchApp(packageName: string): boolean | Promise<boolean>;
  /** Send an SMS to `address` with `body`. Resolves false on failure. */
  sendMessage(address: string, body: string): boolean | Promise<boolean>;
  /** Start a countdown timer for `seconds` seconds. */
  startTimer(seconds: number): void | Promise<void>;
  /** Enable/disable Do Not Disturb, optionally in a named focus mode. */
  setDnd(enabled: boolean, mode?: DndMode): void;
  /** Open a deep link / URI. Resolves false when it cannot be handled. */
  openDeepLink(uri: string): boolean | Promise<boolean>;
}

export interface ActionResult {
  kind: PrimitiveActionKind;
  ok: boolean;
  /** Present when `ok` is false: a human-readable reason. */
  error?: string;
}

export interface ParamSpec {
  name: string;
  type: 'string' | 'number' | 'boolean';
  optional?: boolean;
}

export interface CatalogEntry {
  kind: PrimitiveActionKind;
  label: string;
  params: ParamSpec[];
}

/**
 * The catalog of executable primitives. This is the single source of truth the
 * UI surfaces when building a shortcut/automation and the runner validates
 * against — add a kind here and in {@link PrimitiveAction}/`runActions` together.
 */
export const PRIMITIVE_ACTIONS: CatalogEntry[] = [
  {
    kind: 'openApp',
    label: 'Open App',
    params: [{ name: 'packageName', type: 'string' }],
  },
  {
    kind: 'sendMessage',
    label: 'Send Message',
    params: [
      { name: 'address', type: 'string' },
      { name: 'body', type: 'string', optional: true },
    ],
  },
  {
    kind: 'timer',
    label: 'Start Timer',
    params: [{ name: 'seconds', type: 'number' }],
  },
  {
    kind: 'dnd',
    label: 'Do Not Disturb',
    params: [
      { name: 'enabled', type: 'boolean' },
      { name: 'mode', type: 'string', optional: true },
    ],
  },
  {
    kind: 'deepLink',
    label: 'Open Link',
    params: [{ name: 'uri', type: 'string' }],
  },
];

// Android package names are reverse-DNS: lowercase segments separated by dots,
// each segment starting with a letter. The built-in `com.iostoandroid.*`
// namespace matches this too — it is a legitimately-formed name even though the
// app is launched in-process rather than via the native bridge.
const PACKAGE_NAME_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;

const MAX_TIMER_SECONDS = 24 * 60 * 60; // one day

/**
 * Validate a single action's arguments. Returns `null` when valid, or a
 * human-readable error string (matched by the test suite) when not. Validation
 * is about argument shape only — it never touches the context, so a malformed
 * action is reported without firing any side effect.
 */
export function validateAction(action: PrimitiveAction): string | null {
  switch (action.kind) {
    case 'openApp': {
      const pkg = action.packageName;
      if (typeof pkg !== 'string' || pkg.length === 0 || !PACKAGE_NAME_RE.test(pkg)) {
        return 'Invalid package name';
      }
      return null;
    }
    case 'sendMessage': {
      if (typeof action.address !== 'string' || action.address.trim().length === 0) {
        return 'Address is required';
      }
      return null;
    }
    case 'timer': {
      const s = action.seconds;
      if (typeof s !== 'number' || !Number.isInteger(s)) {
        return 'Timer seconds must be an integer';
      }
      if (s < 1 || s > MAX_TIMER_SECONDS) {
        return `Timer must be between 1 and ${MAX_TIMER_SECONDS} seconds`;
      }
      return null;
    }
    case 'dnd': {
      if (action.mode !== undefined && !DND_MODES.includes(action.mode)) {
        return 'Unknown DND mode';
      }
      return null;
    }
    case 'deepLink': {
      // A scheme separator "://" is the minimum recognisable shape; anything
      // without it cannot be handed to an Intent / Linking resolver.
      if (typeof action.uri !== 'string' || action.uri.length === 0 || !action.uri.includes('://')) {
        return 'URI must include a scheme (e.g. https:// or myapp://)';
      }
      return null;
    }
    default: {
      // Exhaustiveness guard: a new kind added to PrimitiveAction without a
      // case here fails to compile, forcing validation to be extended.
      const _exhaustive: never = action;
      return `Unknown action kind: ${(_exhaustive as { kind: string }).kind}`;
    }
  }
}

/**
 * Run a list of actions sequentially. Each action is validated, then dispatched
 * to the matching `ActionContext` method; the runner awaits any returned promise
 * before starting the next. A failed action (invalid args, a falsy boolean
 * result, a rejection, or a thrown exception) is recorded as `{ ok: false }` and
 * the remaining actions still run.
 */
export async function runActions(
  actions: PrimitiveAction[],
  ctx: ActionContext,
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];

  for (const action of actions) {
    const error = validateAction(action);
    if (error) {
      results.push({ kind: action.kind, ok: false, error });
      continue;
    }

    try {
      let ok = true;
      switch (action.kind) {
        case 'openApp': {
          const raw = await ctx.launchApp(action.packageName);
          ok = typeof raw === 'boolean' ? raw : true;
          break;
        }
        case 'sendMessage': {
          const raw = await ctx.sendMessage(action.address, action.body);
          ok = typeof raw === 'boolean' ? raw : true;
          break;
        }
        case 'timer': {
          await ctx.startTimer(action.seconds);
          ok = true;
          break;
        }
        case 'dnd': {
          // Defaults to 'doNotDisturb' when no mode is supplied — the most common
          // intent for the "Do Not Disturb" primitive is the plain mode.
          ctx.setDnd(action.enabled, action.mode ?? 'doNotDisturb');
          ok = true;
          break;
        }
        case 'deepLink': {
          const raw = await ctx.openDeepLink(action.uri);
          ok = typeof raw === 'boolean' ? raw : true;
          break;
        }
        default: {
          const _exhaustive: never = action;
          ok = false;
          results.push({ kind: (_exhaustive as { kind: PrimitiveActionKind }).kind, ok, error: 'Unknown action kind' });
          continue;
        }
      }
      results.push({ kind: action.kind, ok });
    } catch (e) {
      results.push({
        kind: action.kind,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return results;
}
