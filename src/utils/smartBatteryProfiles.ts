/**
 * Smart Battery Profiles (issue #631, filho de #PAI).
 *
 * O BatteryScreen hoje só tem Low Power Mode + Battery Percentage + display de
 * nível. Isto acrescenta camadas de perfil (Normal / Performance / Extreme
 * Saver / Sleep / Travel) com regras por threshold e um trigger automático.
 *
 * O perfil controla o comportamento da PRÓPRIA app + algumas integrações de
 * sistema (não todas as políticas internas do Android). A regra documentada no
 * issue para bateria < 30% é: disable sync, reduzir polling, delay de
 * notificações non-critical, disable de background work — e é essa a matriz de
 * efeitos do Extreme Saver (e dos demais perfis throttled, com matizes).
 *
 * Tudo o que sai do AsyncStorage é tratado como não confiável, por isso
 * `normalizeSmartBatteryProfile` é o único ponto de validação do id guardado,
 * tal como `normalizeFocusPageVisibility` faz para aquele campo.
 */

/** Ids canónicos dos cinco perfis. O tipo vive aqui e é partilhado com o store. */
export type SmartBatteryProfile =
  | 'normal'
  | 'performance'
  | 'extremeSaver'
  | 'sleep'
  | 'travel';

/** Metadados de apresentação de cada perfil (UI da BatteryScreen). */
export interface SmartBatteryProfileMeta {
  id: SmartBatteryProfile;
  label: string;
  description: string;
  icon: string;
}

/**
 * Consequências práticas de um perfil sobre o comportamento da app.
 *   lowPowerMode                  -> liga o Low Power Mode do iOS
 *   backgroundAppRefresh          -> mapeia para o setting homónimo ('off' desliga)
 *   notificationDelayNonCritical  -> atrasa notificações não-críticas
 *   reducePolling                 -> reduz a cadência de polling da app
 */
export interface SmartBatteryEffects {
  lowPowerMode: boolean;
  backgroundAppRefresh: 'off' | 'wifi' | 'wifiAndCellular';
  notificationDelayNonCritical: boolean;
  reducePolling: boolean;
}

/** Catálogo ordenado dos perfis para a UI (ordem de apresentação). */
export const SMART_BATTERY_PROFILES: SmartBatteryProfileMeta[] = [
  {
    id: 'normal',
    label: 'Normal',
    description: 'Full performance. No restrictions.',
    icon: 'battery-full-outline',
  },
  {
    id: 'performance',
    label: 'Performance',
    description: 'Maximum speed and background activity.',
    icon: 'flash-outline',
  },
  {
    id: 'extremeSaver',
    label: 'Extreme Saver',
    description: 'Disable sync, background work and delays non-critical alerts.',
    icon: 'battery-dead-outline',
  },
  {
    id: 'sleep',
    label: 'Sleep',
    description: 'Quiet mode: no background, only critical notifications.',
    icon: 'moon-outline',
  },
  {
    id: 'travel',
    label: 'Travel',
    description: 'Low power on Wi-Fi, keeps essential sync for trips.',
    icon: 'airplane-outline',
  },
];

/** Devolve o perfil pelo id, ou undefined se desconhecido. */
export function getProfileById(id: SmartBatteryProfile): SmartBatteryProfileMeta | undefined {
  return SMART_BATTERY_PROFILES.find((p) => p.id === id);
}

/**
 * Matriz de efeitos por perfil. Perfil 'normal' é o baseline (não troca nada);
 * 'performance' mantém tudo ligado; os restantes aplicam o throttle documentado
 * no issue, com matizes (Travel usa 'wifi' em vez de 'off').
 */
export function getProfileEffects(profile: SmartBatteryProfile): SmartBatteryEffects {
  switch (profile) {
    case 'performance':
      return {
        lowPowerMode: false,
        backgroundAppRefresh: 'wifiAndCellular',
        notificationDelayNonCritical: false,
        reducePolling: false,
      };
    case 'extremeSaver':
      return {
        lowPowerMode: true,
        backgroundAppRefresh: 'off',
        notificationDelayNonCritical: true,
        reducePolling: true,
      };
    case 'sleep':
      return {
        lowPowerMode: true,
        backgroundAppRefresh: 'off',
        notificationDelayNonCritical: true,
        reducePolling: true,
      };
    case 'travel':
      return {
        lowPowerMode: true,
        backgroundAppRefresh: 'wifi',
        notificationDelayNonCritical: true,
        reducePolling: true,
      };
    case 'normal':
    default:
      return {
        lowPowerMode: false,
        backgroundAppRefresh: 'wifi',
        notificationDelayNonCritical: false,
        reducePolling: true,
      };
  }
}

/**
 * Normaliza o id de perfil lido do AsyncStorage. Qualquer valor que não seja um
 * dos cinco ids canónicos (string vazia, null, undefined, número, typo antigo)
 * reverte para 'normal' — o perfil seguro que não restringe nada.
 */
export function normalizeSmartBatteryProfile(raw: unknown): SmartBatteryProfile {
  if (typeof raw === 'string' && SMART_BATTERY_PROFILES.some((p) => p.id === raw)) {
    return raw as SmartBatteryProfile;
  }
  return 'normal';
}

/** Limites da percentagem de trigger automático (5–50%). Default 30%. */
export const SMART_BATTERY_THRESHOLD_DEFAULT = 30;
export const SMART_BATTERY_THRESHOLD_MIN = 5;
export const SMART_BATTERY_THRESHOLD_MAX = 50;

/**
 * Fixa a percentagem de trigger na gama 5–50%. Valores fora da gama são
 * clampados aos limites; NaN/undefined devolvem o default 30%. Nunca devolve
 * uma percentagem que quebre a regra "< threshold -> saver" por ser 0 ou >100.
 */
export function clampSmartBatteryThreshold(
  value: number | undefined | null,
  fallback: number = SMART_BATTERY_THRESHOLD_DEFAULT,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(SMART_BATTERY_THRESHOLD_MAX, Math.max(SMART_BATTERY_THRESHOLD_MIN, Math.round(value)));
}

/** Entradas do trigger automático resolvidas a partir do settings. */
export interface SmartBatteryTriggerInput {
  autoEnabled: boolean;
  threshold: number;
  manualProfile: SmartBatteryProfile;
}

/** Resultado da resolução: perfil efectivo + se foi o trigger a decidir. */
export interface SmartBatteryResolved {
  profile: SmartBatteryProfile;
  automatic: boolean;
}

/**
 * Decide o perfil activo.
 *
 * Regra do issue: bateria < threshold (e não a carregar) -> aplica o Extreme
 * Saver automaticamente. O trigger é SEGURO: sobrepõe-se sempre ao perfil
 * manual (não se pode desligar a poupança dura por ter escolhido "Performance"
 * com 4% de bateria). Quando o trigger não dispara, usa-se o perfil manual.
 *
 * Fronteiras: exatamente no threshold (batteryLevel === threshold) NÃO dispara
 * — a regra é estritamente "< threshold". Ao carregar, o trigger desativa-se
 * (a bateria está a subir).
 */
export function resolveActiveProfile(
  batteryLevel: number,
  isCharging: boolean,
  input: SmartBatteryTriggerInput,
): SmartBatteryResolved {
  const threshold = clampSmartBatteryThreshold(input.threshold);
  const belowThreshold = typeof batteryLevel === 'number'
    && Number.isFinite(batteryLevel)
    && batteryLevel < threshold;

  if (input.autoEnabled && !isCharging && belowThreshold) {
    return { profile: 'extremeSaver', automatic: true };
  }

  return { profile: normalizeSmartBatteryProfile(input.manualProfile), automatic: false };
}
