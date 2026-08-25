import { normalizeRecentApps } from '../AppsStore';

// #689 — fronteiras e casos hostis do blob persistido de apps recentes.
// A App Library (última página do pager da home) consome estas entradas no
// render; qualquer coisa que não seja {packageName: string, launchedAt: number}
// tem de ser descartada antes de chegar lá.
describe('normalizeRecentApps (#689)', () => {
  it('devolve [] para valores que não são array', () => {
    expect(normalizeRecentApps(null)).toEqual([]);
    expect(normalizeRecentApps(undefined)).toEqual([]);
    expect(normalizeRecentApps('com.facebook')).toEqual([]);
    expect(normalizeRecentApps(42)).toEqual([]);
    expect(normalizeRecentApps({ packageName: 'com.facebook', launchedAt: 1 })).toEqual([]);
  });

  it('devolve [] para um array vazio', () => {
    expect(normalizeRecentApps([])).toEqual([]);
  });

  it('descarta entradas não-objecto e objectos com campos do tipo errado', () => {
    expect(
      normalizeRecentApps([
        null,
        undefined,
        'com.facebook',
        7,
        [],
        [{ packageName: 'com.facebook', launchedAt: 1 }],
        { packageName: '', launchedAt: 1 },
        { packageName: 'com.a', launchedAt: 'ontem' },
        { packageName: 'com.b', launchedAt: NaN },
        { packageName: 'com.c', launchedAt: Infinity },
        { packageName: 'com.d' },
        { launchedAt: 1 },
        { packageName: 42, launchedAt: 1 },
      ]),
    ).toEqual([]);
  });

  it('mantém as entradas válidas pela ordem original', () => {
    expect(
      normalizeRecentApps([
        { packageName: 'com.a', launchedAt: 2 },
        'lixo',
        { packageName: 'com.b', launchedAt: 1 },
      ]),
    ).toEqual([
      { packageName: 'com.a', launchedAt: 2 },
      { packageName: 'com.b', launchedAt: 1 },
    ]);
  });

  it('aceita launchedAt 0 e negativo (relógio do sistema atrasado não é lixo)', () => {
    expect(normalizeRecentApps([{ packageName: 'com.a', launchedAt: 0 }])).toEqual([
      { packageName: 'com.a', launchedAt: 0 },
    ]);
    expect(normalizeRecentApps([{ packageName: 'com.b', launchedAt: -1 }])).toEqual([
      { packageName: 'com.b', launchedAt: -1 },
    ]);
  });

  it('colapsa duplicados por packageName na primeira ocorrência', () => {
    expect(
      normalizeRecentApps([
        { packageName: 'com.a', launchedAt: 5 },
        { packageName: 'com.a', launchedAt: 1 },
      ]),
    ).toEqual([{ packageName: 'com.a', launchedAt: 5 }]);
  });

  it('trunca no máximo de recentes (8), mesmo com lixo intercalado', () => {
    const raw: unknown[] = [];
    for (let i = 0; i < 20; i++) {
      raw.push(null, { packageName: `com.app${i}`, launchedAt: i });
    }
    const out = normalizeRecentApps(raw);
    expect(out).toHaveLength(8);
    expect(out[0]).toEqual({ packageName: 'com.app0', launchedAt: 0 });
    expect(out[7]).toEqual({ packageName: 'com.app7', launchedAt: 7 });
  });

  it('ignora campos extra sem os propagar', () => {
    expect(
      normalizeRecentApps([{ packageName: 'com.a', launchedAt: 1, bogus: 'x' }]),
    ).toEqual([{ packageName: 'com.a', launchedAt: 1 }]);
  });
});
