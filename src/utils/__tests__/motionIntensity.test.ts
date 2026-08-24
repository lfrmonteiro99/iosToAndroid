import {
  normalizeMotionIntensity,
  normalizeScrollDeceleration,
  scrollDecelerationValue,
} from '../motionIntensity';

describe('normalizeMotionIntensity (#493)', () => {
  it('preserva os 3 valores válidos', () => {
    expect(normalizeMotionIntensity('full')).toBe('full');
    expect(normalizeMotionIntensity('reduced')).toBe('reduced');
    expect(normalizeMotionIntensity('off')).toBe('off');
  });

  it('migra reduceMotion:true legado para "reduced" quando motionIntensity está ausente', () => {
    expect(normalizeMotionIntensity(undefined, true)).toBe('reduced');
  });

  it('cai em "full" quando ambos estão ausentes', () => {
    expect(normalizeMotionIntensity(undefined, undefined)).toBe('full');
  });

  it('cai em "full" quando reduceMotion legado é false', () => {
    expect(normalizeMotionIntensity(undefined, false)).toBe('full');
  });

  it('um motionIntensity já válido vence sempre o campo legado, mesmo contraditório', () => {
    expect(normalizeMotionIntensity('full', true)).toBe('full');
    expect(normalizeMotionIntensity('off', false)).toBe('off');
  });

  it('saneia lixo (número, objecto, string desconhecida, null) para "full"', () => {
    expect(normalizeMotionIntensity(42)).toBe('full');
    expect(normalizeMotionIntensity({})).toBe('full');
    expect(normalizeMotionIntensity('fast')).toBe('full');
    expect(normalizeMotionIntensity(null)).toBe('full');
    expect(normalizeMotionIntensity('')).toBe('full');
  });
});

describe('normalizeScrollDeceleration (#493)', () => {
  it('preserva "fast" e "normal"', () => {
    expect(normalizeScrollDeceleration('fast')).toBe('fast');
    expect(normalizeScrollDeceleration('normal')).toBe('normal');
  });

  it('saneia lixo e ausência para "normal"', () => {
    expect(normalizeScrollDeceleration(undefined)).toBe('normal');
    expect(normalizeScrollDeceleration(null)).toBe('normal');
    expect(normalizeScrollDeceleration('rapido')).toBe('normal');
    expect(normalizeScrollDeceleration(0.99)).toBe('normal');
  });
});

describe('scrollDecelerationValue (#493)', () => {
  it('mapeia normal para 0.998 e fast para 0.99', () => {
    expect(scrollDecelerationValue('normal')).toBe(0.998);
    expect(scrollDecelerationValue('fast')).toBe(0.99);
  });
});
