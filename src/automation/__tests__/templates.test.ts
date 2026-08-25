import {
  TEMPLATES,
  getTemplate,
  ACTION_CATALOG,
  defaultLabelForAction,
  AutomationTemplate,
} from '../templates';
import { Automation, AutomationAction } from '../types';
import { isValid } from '../editorLogic';

describe('Automation templates (#645)', () => {
  it('exposes the two named templates Start Work and Going Home', () => {
    const names = TEMPLATES.map((t) => t.name);
    expect(names).toContain('Start Work');
    expect(names).toContain('Going Home');
  });

  it('Start Work builds a time trigger + Focus/Wi-Fi/Calendar actions', () => {
    const tpl: AutomationTemplate | undefined = getTemplate('start-work');
    expect(tpl).toBeDefined();
    const automation = (tpl as AutomationTemplate).build();
    expect(automation.trigger.type).toBe('time');
    expect(automation.trigger.label).toContain('9:00');
    const labels = automation.actions.map((a: AutomationAction) => a.label);
    expect(labels).toEqual(['Set Focus mode', 'Turn on Wi-Fi', 'Open Calendar']);
  });

  it('Going Home builds a location-leave trigger + Personal mode/Maps', () => {
    const tpl: AutomationTemplate | undefined = getTemplate('going-home');
    expect(tpl).toBeDefined();
    const automation = (tpl as AutomationTemplate).build();
    expect(automation.trigger.type).toBe('location');
    expect(automation.actions.map((a: AutomationAction) => a.label)).toContain('Open Maps');
  });

  it('two instantiations of the same template are independent (distinct ids)', () => {
    const tpl = getTemplate('start-work') as AutomationTemplate;
    const a: Automation = tpl.build();
    const b: Automation = tpl.build();
    expect(a.id).not.toBe(b.id);
    expect(a.actions.map((x) => x.id)).not.toEqual(b.actions.map((x) => x.id));
    // Mutating one must not affect the other.
    a.actions.push({ id: 'mut', type: 'openApp', label: 'x' });
    expect(b.actions).toHaveLength(3);
  });

  it('templates produce a valid automation under the editor validator', () => {
    for (const tpl of TEMPLATES) {
      expect(isValid(tpl.build())).toBe(true);
    }
  });

  it('ACTION_CATALOG has a label for every action type', () => {
    const types: AutomationAction['type'][] = [
      'setMode',
      'toggleWifi',
      'toggleBluetooth',
      'toggleLowPower',
      'setBrightness',
      'openApp',
      'setVolume',
      'runShortcut',
    ];
    for (const t of types) {
      expect(defaultLabelForAction(t)).toBeTruthy();
    }
    expect(ACTION_CATALOG).toHaveLength(types.length);
  });
});
