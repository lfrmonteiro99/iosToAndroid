// Data model for the Shortcuts-style automation editor (#645).
//
// An automation has exactly one trigger ("When") and one or more actions
// ("Do"). The model intentionally stays UI-agnostic: the editor screen and the
// store both operate on plain `Automation` objects so the logic can be unit
// tested without rendering anything.

export type TriggerType = 'time' | 'location' | 'appOpen' | 'wifi' | 'manual';

export interface AutomationTrigger {
  type: TriggerType;
  /** Human-readable summary shown on the "When" card. */
  label: string;
  /** Type-specific payload (e.g. minutes from midnight, SSID, app bundle). */
  payload?: Record<string, string | number | boolean>;
}

export type ActionType =
  | 'setMode'
  | 'toggleWifi'
  | 'toggleBluetooth'
  | 'toggleLowPower'
  | 'setBrightness'
  | 'openApp'
  | 'setVolume'
  | 'runShortcut';

export interface AutomationAction {
  id: string;
  type: ActionType;
  label: string;
  payload?: Record<string, string | number | boolean>;
}

export interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
}

export type StepKind = 'trigger' | 'action';
