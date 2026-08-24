/**
 * Avaliador de regras por threshold de bateria (issue #648, filho de #631).
 *
 * Este módulo é um "engine" puro: dado o nível de bateria (0–100) e se o
 * dispositivo está a carregar, devolve as acções de poupança que devem ser
 * aplicadas. Não toca em React, AsyncStorage, nem settings — apenas decide.
 * Quem consome este resultado (a BatteryScreen / SettingsStore de #631) é quem
 * o materializa.
 *
 * Semântica documentada no issue: "<30% -> disable sync / reduce polling /
 * delay non-critical". É essa a matriz implementada.
 *
 * Princípios de segurança (mesmos do smartBatteryProfiles de #631):
 *   - a regra é estritamente "< threshold" — exatamente no limite NÃO dispara;
 *   - ao carregar, o saver nunca dispara (a bateria está a subir);
 *   - entradas inválidas (NaN / <0 / >100) não restringem nada — devolve-se o
 *     estado "sem restrições" em vez de se assumir o pior.
 */

/** Threshold de bateria por defeito (em %) que activa o saver. */
export const BATTERY_RULE_THRESHOLD_DEFAULT = 30;

/** Gama válida do threshold (5–50%), igual à de #631 para consistência. */
export const BATTERY_RULE_THRESHOLD_MIN = 5;
export const BATTERY_RULE_THRESHOLD_MAX = 50;

/** Entrada crua do avaliador — o mínimo necessário para decidir. */
export interface BatteryRuleInput {
  /** Nível de bateria em percentagem (0–100, pode vir do expo-battery arredondado). */
  batteryLevel: number;
  /** Se o dispositivo está a carregar. Ausente == false. */
  isCharging?: boolean;
}

/** Opções do avaliador (hoje só o threshold, mas fica extensível). */
export interface BatteryRuleOptions {
  /** Limite percentual que activa as restrições. Default 30. */
  threshold?: number;
}

/** Resultado: as três restrições documentadas no issue. */
export interface BatteryRuleResult {
  /** <threshold && !charging -> true (equivalente a "disable sync"). */
  disableSync: boolean;
  /** <threshold && !charging -> true (reduce polling). */
  reducePolling: boolean;
  /** <threshold && !charging -> true (delay non-critical). */
  delayNonCritical: boolean;
}

/** Estado "sem restrições" — devolvido por defeito e em caso de dados inválidos. */
const NO_RESTRICTIONS: BatteryRuleResult = {
  disableSync: false,
  reducePolling: false,
  delayNonCritical: false,
};

/** Estado "todas as restrições" — devolvido quando se está abaixo do threshold. */
const ALL_RESTRICTIONS: BatteryRuleResult = {
  disableSync: true,
  reducePolling: true,
  delayNonCritical: true,
};

/**
 * Fixa o threshold na gama 5–50%. Fora da gama é clampado; NaN/undefined/neg/
 * null devolvem o default 30. Espelha `clampSmartBatteryThreshold` de #631.
 */
export function clampBatteryRuleThreshold(
  value: number | undefined | null,
  fallback: number = BATTERY_RULE_THRESHOLD_DEFAULT,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(
    BATTERY_RULE_THRESHOLD_MAX,
    Math.max(BATTERY_RULE_THRESHOLD_MIN, Math.round(value)),
  );
}

/**
 * Avalia as regras por threshold de bateria.
 *
 * Dispara (todas as restrições) quando:
 *   - `batteryLevel` é um número finito em [0, 100],
 *   - `batteryLevel < threshold`, e
 *   - `!isCharging`.
 *
 * Qualquer outra condição (acima/igual ao threshold, a carregar, ou dados
 * inválidos) devolve o estado sem restrições.
 */
export function evaluateBatteryRules(
  input: BatteryRuleInput,
  options: BatteryRuleOptions = {},
): BatteryRuleResult {
  const batteryLevel = input?.batteryLevel;
  const isCharging = input?.isCharging ?? false;
  const threshold = clampBatteryRuleThreshold(options.threshold);

  const levelValid =
    typeof batteryLevel === 'number' && Number.isFinite(batteryLevel)
    && batteryLevel >= 0 && batteryLevel <= 100;

  // Guard seguro: dados inválidos -> nunca restringir (não se assume o pior).
  if (!levelValid) return NO_RESTRICTIONS;

  // Ao carregar, a bateria está a subir -> saver desactivado.
  if (isCharging) return NO_RESTRICTIONS;

  // Regra estritamente "<" — exatamente no limite não dispara.
  if (batteryLevel < threshold) return ALL_RESTRICTIONS;

  return NO_RESTRICTIONS;
}
