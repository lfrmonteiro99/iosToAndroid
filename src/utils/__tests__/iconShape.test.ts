import {
  ICON_SHAPES,
  ICON_SHAPE_LABELS,
  DEFAULT_ICON_SHAPE_EXPONENT,
  ICON_SHAPE_EXPONENT_MIN,
  ICON_SHAPE_EXPONENT_MAX,
  isIconShape,
  normalizeIconShape,
  clampIconShapeExponent,
  effectiveIconExponent,
  iconShapeCacheKey,
  iconMaskOptions,
  previewCornerRatio,
  getIconMask,
  setIconMask,
  subscribeIconMask,
  resetIconMaskForTests,
} from '../iconShape';

beforeEach(() => {
  resetIconMaskForTests();
});

describe('iconShape — as quatro formas', () => {
  it('expõe exactamente as quatro formas da especificação, com etiquetas alinhadas', () => {
    expect(ICON_SHAPES).toEqual(['squircle', 'circle', 'rounded', 'original']);
    expect(ICON_SHAPE_LABELS).toHaveLength(ICON_SHAPES.length);
  });

  it('cada forma produz uma chave de cache distinta — a mesma chave serviria o PNG antigo', () => {
    const keys = ICON_SHAPES.map((s) => iconShapeCacheKey(s, DEFAULT_ICON_SHAPE_EXPONENT));
    expect(new Set(keys).size).toBe(ICON_SHAPES.length);
  });

  it("'original' não tem máscara nenhuma: expoente null", () => {
    expect(effectiveIconExponent('original', 4.7)).toBeNull();
    expect(iconMaskOptions('original', 4.7).exponent).toBeNull();
  });

  it('circle é o superelipse de expoente 2 e rounded o de 8', () => {
    expect(effectiveIconExponent('circle', 4.7)).toBe(2.0);
    expect(effectiveIconExponent('rounded', 4.7)).toBe(8.0);
  });

  it('o expoente do slider só afecta o squircle — circle/rounded/original ignoram-no', () => {
    for (const shape of ['circle', 'rounded', 'original'] as const) {
      expect(iconShapeCacheKey(shape, 2.0)).toBe(iconShapeCacheKey(shape, 8.0));
    }
    expect(iconShapeCacheKey('squircle', 2.0)).not.toBe(iconShapeCacheKey('squircle', 8.0));
  });
});

describe('iconShape — chave de cache muda com a forma e com o expoente', () => {
  it('mudar a forma muda a chave', () => {
    expect(iconShapeCacheKey('squircle', 4.7)).not.toBe(iconShapeCacheKey('circle', 4.7));
  });

  it('mudar o expoente do squircle muda a chave', () => {
    expect(iconShapeCacheKey('squircle', 4.7)).not.toBe(iconShapeCacheKey('squircle', 3.0));
  });

  it('a mesma forma e expoente dá sempre a mesma chave (senão a cache nunca acertava)', () => {
    expect(iconShapeCacheKey('squircle', 4.7)).toBe(iconShapeCacheKey('squircle', 4.7));
  });

  it('arredonda a uma casa decimal — sem isso, cada micro-movimento do slider criava um PNG novo', () => {
    expect(iconShapeCacheKey('squircle', 4.7001)).toBe(iconShapeCacheKey('squircle', 4.7));
    expect(iconShapeCacheKey('squircle', 4.7)).toBe('squircle4.7');
  });
});

describe('iconShape — fronteiras do expoente', () => {
  it.each([
    [ICON_SHAPE_EXPONENT_MIN, ICON_SHAPE_EXPONENT_MIN],
    [ICON_SHAPE_EXPONENT_MAX, ICON_SHAPE_EXPONENT_MAX],
    [ICON_SHAPE_EXPONENT_MIN - 0.1, ICON_SHAPE_EXPONENT_MIN],
    [ICON_SHAPE_EXPONENT_MAX + 0.1, ICON_SHAPE_EXPONENT_MAX],
    [0, ICON_SHAPE_EXPONENT_MIN],
    [-100, ICON_SHAPE_EXPONENT_MIN],
    [1e9, ICON_SHAPE_EXPONENT_MAX],
  ])('clampIconShapeExponent(%p) -> %p', (input, expected) => {
    expect(clampIconShapeExponent(input)).toBe(expected);
  });

  it.each([
    [NaN],
    [Infinity],
    [-Infinity],
    ['4.7'],
    [null],
    [undefined],
    [{}],
  ])('valor inválido (%p) volta ao default, não a 0 — 0 colapsaria a máscara', (input) => {
    expect(clampIconShapeExponent(input)).toBe(DEFAULT_ICON_SHAPE_EXPONENT);
  });
});

describe('iconShape — formas inválidas ou ausentes', () => {
  it.each([['squircle'], ['circle'], ['rounded'], ['original']])('isIconShape(%p) é true', (s) => {
    expect(isIconShape(s)).toBe(true);
  });

  it.each([[''], ['SQUIRCLE'], ['blob'], [null], [undefined], [42], [{}]])(
    'valor não-forma (%p) normaliza para o default squircle',
    (input) => {
      expect(isIconShape(input)).toBe(false);
      expect(normalizeIconShape(input)).toBe('squircle');
    },
  );
});

describe('iconShape — pré-visualização', () => {
  it("'original' não arredonda nada (sem máscara)", () => {
    expect(previewCornerRatio('original', 4.7)).toBe(0);
  });

  it('circle é meio lado — um círculo perfeito', () => {
    expect(previewCornerRatio('circle', 4.7)).toBe(0.5);
  });

  it('subir o expoente do squircle aproxima o quadrado (raio menor)', () => {
    expect(previewCornerRatio('squircle', 8.0)).toBeLessThan(previewCornerRatio('squircle', 2.0));
  });

  it('o raio nunca sai de [0.08, 0.5] mesmo com entradas absurdas', () => {
    for (const e of [-1e6, 0, NaN, 1e6]) {
      const r = previewCornerRatio('squircle', e as number);
      expect(r).toBeGreaterThanOrEqual(0.08);
      expect(r).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('iconShape — máscara activa ao nível do módulo', () => {
  it('começa no default squircle 5.0', () => {
    expect(getIconMask()).toMatchObject({ shape: 'squircle', cacheKey: 'squircle5.0' });
  });

  it('notifica os subscritores quando a chave de cache muda', () => {
    const listener = jest.fn();
    subscribeIconMask(listener);

    setIconMask('circle', 4.7);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({ shape: 'circle', cacheKey: 'circle2.0' });
    expect(getIconMask().shape).toBe('circle');
  });

  it('não notifica quando a chave não muda — o duplo toque no mesmo segmento é no-op', () => {
    const listener = jest.fn();
    subscribeIconMask(listener);

    setIconMask('squircle', 5.0);
    setIconMask('squircle', 5.0);

    expect(listener).not.toHaveBeenCalled();
  });

  it('mexer no expoente com circle escolhido não notifica: circle ignora o slider', () => {
    setIconMask('circle', 4.7);
    const listener = jest.fn();
    subscribeIconMask(listener);

    setIconMask('circle', 8.0);

    expect(listener).not.toHaveBeenCalled();
  });

  it('cancelar a subscrição pára as notificações', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeIconMask(listener);
    unsubscribe();

    setIconMask('rounded', 4.7);

    expect(listener).not.toHaveBeenCalled();
    // O estado interno mudou mesmo assim — só a notificação é que não chega.
    expect(getIconMask().shape).toBe('rounded');
  });

  it('um valor corrompido nunca chega a ser publicado como tal', () => {
    setIconMask('blob', NaN);
    expect(getIconMask()).toMatchObject({ shape: 'squircle', exponent: DEFAULT_ICON_SHAPE_EXPONENT });
  });
});

describe('iconMaskOptions — o que desce até ao Kotlin', () => {
  it('normaliza forma e expoente corrompidos antes de os passar à ponte', () => {
    expect(iconMaskOptions('blob', 'muito')).toEqual({
      shape: 'squircle',
      exponent: DEFAULT_ICON_SHAPE_EXPONENT,
      cacheKey: 'squircle5.0',
    });
  });

  it('mantém a forma escolhida e limita o expoente à gama útil', () => {
    expect(iconMaskOptions('squircle', 99)).toEqual({
      shape: 'squircle',
      exponent: ICON_SHAPE_EXPONENT_MAX,
      cacheKey: `squircle${ICON_SHAPE_EXPONENT_MAX.toFixed(1)}`,
    });
  });
});
