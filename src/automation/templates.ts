import {
  Automation,
  AutomationAction,
  AutomationTrigger,
} from './types';

// Template descriptors. The editor screen offers these two initial templates
// (per issue #645: "templates (Start Work, Going Home)"). A template is a
// factory that produces a fresh Automation — with brand-new action ids — every
// time it is instantiated, so stamping the same template twice yields two
// independent automations.

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  build: () => Automation;
}

// Monotonic counter so ids are unique within a session without Math.random.
// Keeps template-instantiation tests deterministic.
let idCounter = 0;
function makeId(salt: string): string {
  idCounter += 1;
  return `${salt}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

function trigger(type: AutomationTrigger['type'], label: string, payload?: AutomationTrigger['payload']): AutomationTrigger {
  return { type, label, payload };
}

function action(
  type: AutomationAction['type'],
  label: string,
  payload?: AutomationAction['payload'],
): AutomationAction {
  return { id: makeId('act'), type, label, payload };
}

const startWorkTrigger: AutomationTrigger = trigger('time', 'When: 9:00 AM', { minutes: 540 });

const startWorkActions: () => AutomationAction[] = () => [
  action('setMode', 'Set Focus mode', { mode: 'work' }),
  action('toggleWifi', 'Turn on Wi-Fi', { on: true }),
  action('openApp', 'Open Calendar', { app: 'calendar' }),
];

const goingHomeTrigger: AutomationTrigger = trigger('location', 'When: I leave work', {
  kind: 'leave',
  place: 'work',
});

const goingHomeActions: () => AutomationAction[] = () => [
  action('setMode', 'Set Personal mode', { mode: 'personal' }),
  action('toggleLowPower', 'Turn off Low Power Mode', { on: false }),
  action('openApp', 'Open Maps', { app: 'maps' }),
];

export const TEMPLATES: AutomationTemplate[] = [
  {
    id: 'start-work',
    name: 'Start Work',
    description: 'Weekday mornings: Focus, Wi-Fi on, Calendar open.',
    build: () => ({
      id: makeId('auto'),
      name: 'Start Work',
      enabled: true,
      trigger: { ...startWorkTrigger },
      actions: startWorkActions(),
    }),
  },
  {
    id: 'going-home',
    name: 'Going Home',
    description: 'When you leave work: Personal mode, Maps open.',
    build: () => ({
      id: makeId('auto'),
      name: 'Going Home',
      enabled: true,
      trigger: { ...goingHomeTrigger },
      actions: goingHomeActions(),
    }),
  },
];

export function getTemplate(id: string): AutomationTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** Short action catalog the "Add action" Sheet offers. */
export interface ActionCatalogEntry {
  type: AutomationAction['type'];
  label: string;
}

export const ACTION_CATALOG: ActionCatalogEntry[] = [
  { type: 'setMode', label: 'Set Focus mode' },
  { type: 'toggleWifi', label: 'Toggle Wi-Fi' },
  { type: 'toggleBluetooth', label: 'Toggle Bluetooth' },
  { type: 'toggleLowPower', label: 'Toggle Low Power Mode' },
  { type: 'setBrightness', label: 'Set Brightness' },
  { type: 'openApp', label: 'Open App' },
  { type: 'setVolume', label: 'Set Volume' },
  { type: 'runShortcut', label: 'Run Shortcut' },
];

export function defaultLabelForAction(type: AutomationAction['type']): string {
  const entry = ACTION_CATALOG.find((a) => a.type === type);
  return entry ? entry.label : 'Action';
}
