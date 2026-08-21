import {
  computeLauncherGridGeometry,
  ICON_SIZE_RATIO,
  GRID_PADDING_RATIO,
  ICON_RADIUS_RATIO,
} from '../launcherGridGeometry';

describe('computeLauncherGridGeometry', () => {
  // §2: tudo derivado da largura. 393dp é o ecrã em que os antigos literais
  // (60 / 16 / 13.5) foram escolhidos; fora dele têm de divergir.
  it.each([
    [360, 55, 25],
    [393, 60, 28],
    [411, 63, 29],
    [480, 73, 34],
  ])('deriva ícone e margem da largura (%ip)', (width, iconSize, padding) => {
    const g = computeLauncherGridGeometry(width);
    expect(g.iconSize).toBe(iconSize);
    expect(g.horizontalPadding).toBe(padding);
  });

  it('não mantém os literais de 393dp noutras larguras', () => {
    expect(computeLauncherGridGeometry(360).iconSize).not.toBe(60);
    expect(computeLauncherGridGeometry(480).iconSize).not.toBe(60);
    expect(computeLauncherGridGeometry(360).horizontalPadding).not.toBe(16);
    expect(computeLauncherGridGeometry(480).horizontalPadding).not.toBe(16);
  });

  it('mantém o raio proporcional ao lado do ícone', () => {
    for (const width of [320, 360, 393, 411, 480, 800]) {
      const g = computeLauncherGridGeometry(width);
      expect(g.iconRadius).toBeCloseTo(g.iconSize * ICON_RADIUS_RATIO, 5);
    }
    // A 393dp o raio continua a ser o histórico 13.5 (±0.1) — nada regride no
    // ecrã de referência.
    expect(computeLauncherGridGeometry(393).iconRadius).toBeCloseTo(13.5, 0);
  });

  it('a última coluna nunca é cortada pelo arredondamento', () => {
    for (let width = 90; width <= 2000; width += 1) {
      const g = computeLauncherGridGeometry(width);
      const used = g.iconSize * g.cols + g.horizontalPadding * 2;
      expect(used).toBeLessThanOrEqual(width);
      // e o ícone cabe na célula que lhe é atribuída
      expect(g.iconSize).toBeLessThanOrEqual(g.cellWidth);
    }
  });

  it('a soma das células cobre exactamente a área de conteúdo', () => {
    for (const width of [360, 393, 411, 480]) {
      const g = computeLauncherGridGeometry(width);
      expect(g.cellWidth * g.cols).toBeCloseTo(width - g.horizontalPadding * 2, 5);
    }
  });

  it.each([0, -1, -1000])(
    'degrada com segurança em larguras inválidas (%p)',
    (width) => {
      const g = computeLauncherGridGeometry(width);
      expect(g.cols).toBeGreaterThanOrEqual(1);
      // Com cols=4 fixo, em larguras < 4 o ícone pode ser 0 para caber no ecrã.
      // Isto é um edge case teórico (ecrãs reais >= 320dp).
      expect(g.iconSize).toBeGreaterThanOrEqual(0);
      expect(g.horizontalPadding).toBeGreaterThanOrEqual(0);
      expect(g.iconSize * g.cols + g.horizontalPadding * 2).toBeLessThanOrEqual(
        Math.max(1, width),
      );
    },
  );

  it('aguenta larguras absurdamente grandes sem perder as proporções', () => {
    const g = computeLauncherGridGeometry(100000);
    expect(g.cols).toBe(4);
    expect(g.iconSize).toBe(Math.round(100000 * ICON_SIZE_RATIO));
    expect(g.horizontalPadding).toBe(Math.round(100000 * GRID_PADDING_RATIO));
  });

  it('é puro: a mesma largura devolve sempre os mesmos valores', () => {
    expect(computeLauncherGridGeometry(411)).toEqual(computeLauncherGridGeometry(411));
  });

  it('mantém sempre 4 colunas (#500)', () => {
    // A grelha deve ter sempre 4 colunas (como no iOS), em qualquer largura.
    // O ícone é que encolhe para caber, não a contagem de colunas.
    for (const width of [320, 360, 393, 411, 480]) {
      const g = computeLauncherGridGeometry(width);
      expect(g.cols).toBe(4);
    }
  });
});

describe('LauncherHomeScreen consome a geometria derivada', () => {
  const loadScreenAtWidth = (width: number) => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Dimensions } = require('react-native') as typeof import('react-native');
    jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({ width, height: 800, scale: 2, fontScale: 1 });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../../screens/LauncherHomeScreen') as {
      ICON_SIZE: number;
      GRID_HORIZONTAL_PADDING: number;
      ICON_RADIUS: number;
    };
  };

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('a 360dp usa o ícone e a margem da especificação, não 60/16', () => {
    const mod = loadScreenAtWidth(360);
    const expected = computeLauncherGridGeometry(360);
    expect(mod.ICON_SIZE).toBe(expected.iconSize);
    expect(mod.GRID_HORIZONTAL_PADDING).toBe(expected.horizontalPadding);
    expect(mod.ICON_SIZE).not.toBe(60);
    expect(mod.GRID_HORIZONTAL_PADDING).not.toBe(16);
  });

  it('o raio do ícone é proporcional e não o literal 13.5', () => {
    const mod = loadScreenAtWidth(480);
    expect(mod.ICON_RADIUS).toBeCloseTo(mod.ICON_SIZE * ICON_RADIUS_RATIO, 5);
    expect(mod.ICON_RADIUS).not.toBeCloseTo(13.5, 1);
  });
});
