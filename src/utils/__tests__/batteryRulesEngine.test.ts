/**
 * Testes do Avaliador de regras por threshold de bateria (issue #648, filho de #631).
 *
 * O issue documenta: "<30% -> disable sync / reduce polling / delay non-critical".
 * Este módulo é um "engine" puro (sem React, sem AsyncStorage) cujo único
 * trabalho é, dado o nível de bateria e se está a carregar, devolver as
 * acções de poupança que devem ser aplicadas. A BatteryScreen (#631) é quem
 * consome este resultado e o materializa nos settings/UI.
 *
 * Regras verificadas:
 *   - nível < 30 (e não a carregar) -> disableSync + reducePolling + delayNonCritical
 *   - exatamente 30 NÃO dispara (a regra é estritamente "<")
 *   - ao carregar, o saver nunca dispara (bateria a subir)
 *   - dados inválidos (NaN / <0 / >100) não restringem nada (guard seguro)
 *   - o threshold é configurável, mantendo a semantics "< threshold"
 */
import {
  evaluateBatteryRules,
  BATTERY_RULE_THRESHOLD_DEFAULT,
  type BatteryRuleInput,
} from '../batteryRulesEngine';

describe('batteryRulesEngine — Avaliador por threshold de bateria', () => {
  it('aplica as três restrições quando bateria < 30% e não carrega', () => {
    const result = evaluateBatteryRules({ batteryLevel: 29, isCharging: false });
    expect(result).toEqual({
      disableSync: true,
      reducePolling: true,
      delayNonCritical: true,
    });
  });

  it('exatamente em 30% NÃO dispara (regra estritamente "<")', () => {
    const result = evaluateBatteryRules({ batteryLevel: 30, isCharging: false });
    expect(result).toEqual({
      disableSync: false,
      reducePolling: false,
      delayNonCritical: false,
    });
  });

  it('acima de 30% não restringe', () => {
    const result = evaluateBatteryRules({ batteryLevel: 31, isCharging: false });
    expect(result.disableSync).toBe(false);
    expect(result.reducePolling).toBe(false);
    expect(result.delayNonCritical).toBe(false);
  });

  it('bateria a 0% (vazia) dispara todas as restrições', () => {
    const result = evaluateBatteryRules({ batteryLevel: 0, isCharging: false });
    expect(result).toEqual({
      disableSync: true,
      reducePolling: true,
      delayNonCritical: true,
    });
  });

  it('ao carregar, nem com 5% restringe (bateria a subir)', () => {
    const result = evaluateBatteryRules({ batteryLevel: 5, isCharging: true });
    expect(result.disableSync).toBe(false);
    expect(result.reducePolling).toBe(false);
    expect(result.delayNonCritical).toBe(false);
  });

  it('ao carregar em 29% não restringe', () => {
    const result = evaluateBatteryRules({ batteryLevel: 29, isCharging: true });
    expect(result.disableSync).toBe(false);
  });

  it('dados inválidos (NaN) não restringem — guard seguro', () => {
    const result = evaluateBatteryRules({ batteryLevel: NaN, isCharging: false });
    expect(result).toEqual({
      disableSync: false,
      reducePolling: false,
      delayNonCritical: false,
    });
  });

  it('dados inválidos (negativo) não restringem — guard seguro', () => {
    const result = evaluateBatteryRules({ batteryLevel: -5, isCharging: false });
    expect(result.disableSync).toBe(false);
    expect(result.reducePolling).toBe(false);
    expect(result.delayNonCritical).toBe(false);
  });

  it('dados inválidos (>100) não restringem — guard seguro', () => {
    const result = evaluateBatteryRules({ batteryLevel: 150, isCharging: false });
    expect(result.disableSync).toBe(false);
    expect(result.reducePolling).toBe(false);
    expect(result.delayNonCritical).toBe(false);
  });

  it('usa o threshold por defeito de 30 quando não indicado', () => {
    const result = evaluateBatteryRules({ batteryLevel: 25, isCharging: false }, { threshold: BATTERY_RULE_THRESHOLD_DEFAULT });
    expect(result.disableSync).toBe(true);
  });

  it('respeita um threshold configurável (20): 19% dispara, 21% não', () => {
    expect(evaluateBatteryRules({ batteryLevel: 19, isCharging: false }, { threshold: 20 }).disableSync).toBe(true);
    expect(evaluateBatteryRules({ batteryLevel: 21, isCharging: false }, { threshold: 20 }).disableSync).toBe(false);
  });

  it('exatamente no threshold configurável (20) não dispara', () => {
    const result = evaluateBatteryRules({ batteryLevel: 20, isCharging: false }, { threshold: 20 });
    expect(result.disableSync).toBe(false);
  });

  it('aceita input incompleto sem quebrar (isCharging ausente == false)', () => {
    const partial = { batteryLevel: 10 } as BatteryRuleInput;
    const result = evaluateBatteryRules(partial);
    expect(result).toEqual({
      disableSync: true,
      reducePolling: true,
      delayNonCritical: true,
    });
  });
});
