import {
  SMART_BATTERY_PROFILES,
  getProfileById,
  getProfileEffects,
  normalizeSmartBatteryProfile,
  resolveActiveProfile,
  clampSmartBatteryThreshold,
  type SmartBatteryProfile,
} from '../smartBatteryProfiles';

// Smart Battery Profiles (#631) — pure rules engine. Estes testes exercitam as
// funções exportadas REAIS (nada é reimplementado aqui): a BatteryScreen e o
// SettingsStore consomem exactamente estas.

describe('SMART_BATTERY_PROFILES', () => {
  it('expõe os cinco perfis documentados no issue', () => {
    const ids = SMART_BATTERY_PROFILES.map((p) => p.id).sort();
    expect(ids).toEqual(
      ['extremeSaver', 'normal', 'performance', 'sleep', 'travel'].sort(),
    );
  });

  it('cada perfil tem label, descrição e ícone não vazios', () => {
    for (const p of SMART_BATTERY_PROFILES) {
      expect(typeof p.label).toBe('string');
      expect(p.label.length).toBeGreaterThan(0);
      expect(typeof p.icon).toBe('string');
      expect(p.icon.length).toBeGreaterThan(0);
    }
  });
});

describe('getProfileById', () => {
  it('devolve o perfil para um id válido', () => {
    expect(getProfileById('normal')?.id).toBe('normal');
    expect(getProfileById('extremeSaver')?.id).toBe('extremeSaver');
  });

  it('devolve undefined para id desconhecido', () => {
    expect(getProfileById('foo' as SmartBatteryProfile)).toBeUndefined();
  });
});

describe('getProfileEffects', () => {
  it('normal não troca nada (baseline)', () => {
    expect(getProfileEffects('normal')).toEqual({
      lowPowerMode: false,
      backgroundAppRefresh: 'wifi',
    });
  });

  it('performance mantém tudo ligado e usa wifiAndCellular', () => {
    expect(getProfileEffects('performance')).toEqual({
      lowPowerMode: false,
      backgroundAppRefresh: 'wifiAndCellular',
    });
  });

  it('extremeSaver aplica o conjunto de regras do <30% (issue)', () => {
    // Regra documentada: < 30% -> disable sync + disable background work.
    // (reducePolling/notificationDelayNonCritical não têm consumidor na app,
    // por isso não entram na matriz — ver comentário no topo do módulo.)
    expect(getProfileEffects('extremeSaver')).toEqual({
      lowPowerMode: true,
      backgroundAppRefresh: 'off',
    });
  });

  it('sleep difere de extremeSaver apenas na intenção, não no efeito', () => {
    const sleep = getProfileEffects('sleep');
    expect(sleep.lowPowerMode).toBe(true);
    expect(sleep.backgroundAppRefresh).toBe('off');
  });

  it('travel usa wifi (não off) mas mantém low power', () => {
    expect(getProfileEffects('travel')).toEqual({
      lowPowerMode: true,
      backgroundAppRefresh: 'wifi',
    });
  });
});

describe('normalizeSmartBatteryProfile', () => {
  it('passa um id válido intacto', () => {
    expect(normalizeSmartBatteryProfile('travel')).toBe('travel');
  });

  it('descarrega id inválido/nulo/corrompido para "normal"', () => {
    expect(normalizeSmartBatteryProfile('nope')).toBe('normal');
    expect(normalizeSmartBatteryProfile('')).toBe('normal');
    expect(normalizeSmartBatteryProfile(undefined)).toBe('normal');
    expect(normalizeSmartBatteryProfile(null)).toBe('normal');
    expect(normalizeSmartBatteryProfile(42 as unknown as string)).toBe('normal');
  });
});

describe('clampSmartBatteryThreshold', () => {
  it('mantém um valor dentro da gama', () => {
    expect(clampSmartBatteryThreshold(30)).toBe(30);
  });

  it('fixa no limite inferior e superior', () => {
    expect(clampSmartBatteryThreshold(0)).toBe(5);
    expect(clampSmartBatteryThreshold(100)).toBe(50);
  });

  it('lida com NaN/undefined devolvendo o default 30', () => {
    expect(clampSmartBatteryThreshold(NaN)).toBe(30);
    expect(clampSmartBatteryThreshold(undefined)).toBe(30);
  });
});

describe('resolveActiveProfile — trigger por threshold', () => {
  const base = { autoEnabled: true, threshold: 30, manualProfile: 'normal' as SmartBatteryProfile };

  it('abaixo do threshold e sem carregar -> extremeSaver automático', () => {
    const r = resolveActiveProfile(29, false, base);
    expect(r.profile).toBe('extremeSaver');
    expect(r.automatic).toBe(true);
  });

  it('exatamente no threshold (30) NÃO dispara', () => {
    const r = resolveActiveProfile(30, false, base);
    expect(r.profile).toBe('normal');
    expect(r.automatic).toBe(false);
  });

  it('a carregar desativa o trigger mesmo abaixo do threshold', () => {
    const r = resolveActiveProfile(5, true, base);
    expect(r.profile).toBe('normal');
    expect(r.automatic).toBe(false);
  });

  it('auto desligado -> perfil manual, nunca automático', () => {
    const r = resolveActiveProfile(1, false, { ...base, autoEnabled: false });
    expect(r.profile).toBe('normal');
    expect(r.automatic).toBe(false);
  });

  it('perfil manual escolhido é respeitado quando o trigger não dispara', () => {
    const r = resolveActiveProfile(80, false, { ...base, manualProfile: 'travel' });
    expect(r.profile).toBe('travel');
    expect(r.automatic).toBe(false);
  });

  it('o trigger sobrepõe o perfil manual (segurança dura)', () => {
    const r = resolveActiveProfile(10, false, { ...base, manualProfile: 'performance' });
    expect(r.profile).toBe('extremeSaver');
    expect(r.automatic).toBe(true);
  });
});
