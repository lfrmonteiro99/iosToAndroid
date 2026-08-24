import {
  addAction,
  removeAction,
  updateAction,
  reorderAction,
  setTrigger,
  renameAutomation,
  setEnabled,
  validateAutomation,
  isValid,
  summaryLine,
  stepCount,
} from '../editorLogic';
import { Automation } from '../types';

function makeBase(): Automation {
  return {
    id: 'base',
    name: 'Start Work',
    enabled: true,
    trigger: { type: 'time', label: 'When: 9:00 AM', payload: { minutes: 540 } },
    actions: [
      { id: 'a1', type: 'setMode', label: 'Set Focus mode' },
      { id: 'a2', type: 'toggleWifi', label: 'Turn on Wi-Fi' },
      { id: 'a3', type: 'openApp', label: 'Open Calendar' },
    ],
  };
}

describe('Automation editor logic', () => {
  it('addAction appends without mutating the input', () => {
    const base = makeBase();
    const next = addAction(base, 'openApp');
    expect(base.actions).toHaveLength(3); // original untouched
    expect(next.actions).toHaveLength(4);
    expect(next.actions[3].type).toBe('openApp');
    expect(next).not.toBe(base);
  });

  it('addAction assigns a unique id and a default label', () => {
    const next = addAction(makeBase(), 'runShortcut');
    const added = next.actions[next.actions.length - 1];
    expect(added.id).toBeTruthy();
    expect(added.label).toBe('Run Shortcut');
  });

  it('removeAction drops only the targeted action by id', () => {
    const next = removeAction(makeBase(), 'a2');
    expect(next.actions.map((a) => a.id)).toEqual(['a1', 'a3']);
  });

  it('removeAction with an unknown id returns an unchanged list', () => {
    const base = makeBase();
    const next = removeAction(base, 'nope');
    expect(next.actions).toEqual(base.actions);
  });

  it('updateAction patches only the targeted action', () => {
    const base = makeBase();
    const next = updateAction(base, 'a2', { label: 'Turn off Wi-Fi' });
    expect(next.actions[1].label).toBe('Turn off Wi-Fi');
    expect(next.actions[0].label).toBe('Set Focus mode'); // untouched
    expect(next.actions[0]).toBe(base.actions[0]); // referential stability of the unpatched action
  });

  it('reorderAction moves an action up and down', () => {
    const reordered = reorderAction(makeBase(), 'a1', 'down');
    expect(reordered.actions.map((a) => a.id)).toEqual(['a2', 'a1', 'a3']);
    const back = reorderAction(reordered, 'a1', 'up');
    expect(back.actions.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('reorderAction is a no-op at the boundaries', () => {
    const base = makeBase();
    expect(reorderAction(base, 'a1', 'up').actions).toEqual(base.actions); // already first
    expect(reorderAction(base, 'a3', 'down').actions).toEqual(base.actions); // already last
    expect(reorderAction(base, 'ghost', 'up').actions).toEqual(base.actions); // missing
  });

  it('validateAutomation reports missing name, trigger and actions', () => {
    const empty: Automation = {
      id: 'x',
      name: '   ',
      enabled: true,
      trigger: { type: 'manual', label: '' },
      actions: [],
    };
    const problems = validateAutomation(empty);
    expect(problems.some((p) => /name/i.test(p))).toBe(true);
    expect(problems.some((p) => /trigger/i.test(p))).toBe(true);
    expect(problems.some((p) => /action/i.test(p))).toBe(true);
  });

  it('validateAutomation passes a well-formed automation', () => {
    expect(validateAutomation(makeBase())).toEqual([]);
    expect(isValid(makeBase())).toBe(true);
  });

  it('setTrigger, renameAutomation and setEnabled are immutable setters', () => {
    const base = makeBase();
    const withTrigger = setTrigger(base, { type: 'wifi', label: 'When: Wi-Fi "Home"' });
    const renamed = renameAutomation(base, 'Going Home');
    const disabled = setEnabled(base, false);
    expect(base.name).toBe('Start Work'); // all pure
    expect(withTrigger.trigger.label).toBe('When: Wi-Fi "Home"');
    expect(renamed.name).toBe('Going Home');
    expect(disabled.enabled).toBe(false);
  });

  it('summaryLine renders "When: … · N actions"', () => {
    expect(summaryLine(makeBase())).toBe('When: 9:00 AM · 3 actions');
    expect(summaryLine({ ...makeBase(), actions: makeBase().actions.slice(0, 1) })).toBe(
      'When: 9:00 AM · 1 action',
    );
  });

  it('stepCount counts the trigger as 1 and actions by length', () => {
    expect(stepCount(makeBase(), 'trigger')).toBe(1);
    expect(stepCount(makeBase(), 'action')).toBe(3);
  });
});
