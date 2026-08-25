import {
  Automation,
  AutomationAction,
  AutomationTrigger,
  StepKind,
} from './types';
import { ACTION_CATALOG, defaultLabelForAction } from './templates';

// Pure, UI-free logic for the automation editor. Keeping these as functions
// (not component state) means the "When/Do" behaviour is unit-testable without
// Rendering. Every function returns a NEW Automation; the input is never
// mutated (the editor operates on immutable state).

let actionSeq = 0;
function newActionId(): string {
  actionSeq += 1;
  return `action-${Date.now().toString(36)}-${actionSeq.toString(36)}`;
}

export function addAction(
  automation: Automation,
  type: AutomationAction['type'],
): Automation {
  const inserted: AutomationAction = {
    id: newActionId(),
    type,
    label: defaultLabelForAction(type),
  };
  return {
    ...automation,
    actions: [...automation.actions, inserted],
  };
}

export function removeAction(automation: Automation, actionId: string): Automation {
  return {
    ...automation,
    actions: automation.actions.filter((a) => a.id !== actionId),
  };
}

export function updateAction(
  automation: Automation,
  actionId: string,
  patch: Partial<Omit<AutomationAction, 'id'>>,
): Automation {
  return {
    ...automation,
    actions: automation.actions.map((a) =>
      a.id === actionId ? { ...a, ...patch } : a,
    ),
  };
}

/** Swap an action with its neighbour. Returns the input unchanged on bad index. */
export function reorderAction(
  automation: Automation,
  actionId: string,
  direction: 'up' | 'down',
): Automation {
  const index = automation.actions.findIndex((a) => a.id === actionId);
  if (index === -1) return automation;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= automation.actions.length) return automation;

  const next = [...automation.actions];
  [next[index], next[target]] = [next[target], next[index]];
  return { ...automation, actions: next };
}

export function setTrigger(
  automation: Automation,
  trigger: AutomationTrigger,
): Automation {
  return { ...automation, trigger };
}

export function renameAutomation(automation: Automation, name: string): Automation {
  return { ...automation, name };
}

export function setEnabled(automation: Automation, enabled: boolean): Automation {
  return { ...automation, enabled };
}

/**
 * Validation. An automation must have a trigger, at least one action, and a
 * non-empty name. Returns an array of human-readable problems — empty means
 * valid. The editor uses this to gate the "save"/"done" affordance.
 */
export function validateAutomation(automation: Automation): string[] {
  const problems: string[] = [];
  const trimmedName = automation.name.trim();
  if (trimmedName.length === 0) {
    problems.push('Give the automation a name.');
  }
  if (!automation.trigger || automation.trigger.label.trim().length === 0) {
    problems.push('Choose a "When" trigger.');
  }
  if (!Array.isArray(automation.actions) || automation.actions.length === 0) {
    problems.push('Add at least one "Do" action.');
  }
  for (const action of automation.actions) {
    if (action.label.trim().length === 0) {
      problems.push('Every action needs a label.');
      break;
    }
  }
  return problems;
}

export function isValid(automation: Automation): boolean {
  return validateAutomation(automation).length === 0;
}

/**
 * Summary line for the editor header, e.g. "When: 9:00 AM · 3 actions".
 * Used by the UI and by tests to assert the When/Do shape renders.
 */
export function summaryLine(automation: Automation): string {
  const actionCount = automation.actions.length;
  return `${automation.trigger.label} · ${actionCount} ${
    actionCount === 1 ? 'action' : 'actions'
  }`;
}

export function stepCount(automation: Automation, kind: StepKind): number {
  return kind === 'trigger' ? 1 : automation.actions.length;
}

export { ACTION_CATALOG };
