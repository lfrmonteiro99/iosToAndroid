/**
 * Forma da máscara dos ícones do launcher (§1.6 da ESPECIFICACAO.md).
 *
 * A máscara é aplicada NATIVAMENTE (LauncherModule.kt), por isso este módulo é
 * puro: só decide qual é a forma efectiva e qual é a chave de cache que o lado
 * nativo tem de usar. Sem React, sem react-native — testável isoladamente.
 */

export type IconShape = 'squircle' | 'circle' | 'rounded' | 'original';

/** As quatro formas, na ordem em que aparecem no controlo segmentado. */
export const ICON_SHAPES: readonly IconShape[] = ['squircle', 'circle', 'rounded', 'original'];

/** Etiquetas para UI, alinhadas por índice com [ICON_SHAPES]. */
export const ICON_SHAPE_LABELS: readonly string[] = ['Squircle', 'Circle', 'Rounded', 'Original'];

/** Gama útil do expoente do superelipse (§1.6: o valor exacto é incerto). */
export const ICON_SHAPE_EXPONENT_MIN = 2.0;
export const ICON_SHAPE_EXPONENT_MAX = 8.0;
/** Superellipse approximation closest to Apple's continuous corner (#480). */
export const DEFAULT_ICON_SHAPE_EXPONENT = 5.0;

/** Expoente fixo de um círculo perfeito (|x|^2 + |y|^2 = r^2). */
const CIRCLE_EXPONENT = 2.0;
/** Expoente do "quadrado arredondado": cantos curtos, lados quase rectos. */
const ROUNDED_EXPONENT = 8.0;

export function isIconShape(value: unknown): value is IconShape {
  return typeof value === 'string' && (ICON_SHAPES as readonly string[]).includes(value);
}

/**
 * Normaliza uma forma vinda do armazenamento persistido: qualquer coisa que não
 * seja uma das quatro formas volta ao default, em vez de descer até ao Kotlin e
 * lá produzir uma máscara indefinida.
 */
export function normalizeIconShape(value: unknown): IconShape {
  return isIconShape(value) ? value : 'squircle';
}

/**
 * Limita o expoente à gama útil. `NaN`, `Infinity`, strings e ausência voltam ao
 * default — não a 0, que colapsaria a máscara e apagaria o ícone.
 */
export function clampIconShapeExponent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_ICON_SHAPE_EXPONENT;
  if (value < ICON_SHAPE_EXPONENT_MIN) return ICON_SHAPE_EXPONENT_MIN;
  if (value > ICON_SHAPE_EXPONENT_MAX) return ICON_SHAPE_EXPONENT_MAX;
  return value;
}

/**
 * Expoente que o nativo tem de usar de facto:
 * - `circle` e `rounded` são superelipses de expoente fixo, por isso o slider
 *   não os afecta (e a chave de cache também não muda com ele);
 * - `original` não tem máscara nenhuma — devolve `null` para o nativo entregar
 *   o drawable do sistema como está;
 * - `squircle` é o único caso aferível, e usa o valor escolhido.
 */
export function effectiveIconExponent(shape: IconShape, exponent: number): number | null {
  switch (shape) {
    case 'original':
      return null;
    case 'circle':
      return CIRCLE_EXPONENT;
    case 'rounded':
      return ROUNDED_EXPONENT;
    case 'squircle':
    default:
      return clampIconShapeExponent(exponent);
  }
}

/** Opções de máscara passadas à ponte nativa (`getInstalledApps`/`getAppIcon`). */
export interface IconMaskOptions {
  shape: IconShape;
  /** null = sem máscara ('original'). */
  exponent: number | null;
  /** Segmento da chave de cache dos PNGs em disco. */
  cacheKey: string;
}

/**
 * Chave de cache da forma. Entra no nome do PNG em disco, e é por isso que mudar
 * a forma (ou o expoente do squircle) invalida a cache: o ficheiro antigo deixa
 * de corresponder a qualquer chave válida e é apagado como órfão.
 *
 * O expoente é fixado a uma casa decimal — o slider produz floats contínuos e
 * sem arredondamento cada micro-movimento geraria um PNG novo em disco.
 */
export function iconShapeCacheKey(shape: IconShape, exponent: number): string {
  const effective = effectiveIconExponent(shape, exponent);
  return effective === null ? shape : `${shape}${effective.toFixed(1)}`;
}

/**
 * Raio de canto, como fracção do lado, para a PRÉ-VISUALIZAÇÃO em JS. A máscara
 * real é nativa (superelipse verdadeiro); aqui só se aproxima a silhueta com um
 * borderRadius, porque é o que a View do RN sabe desenhar sem SVG:
 *  - 'circle' -> 0.5 (raio = metade do lado, círculo perfeito);
 *  - 'original' -> 0 (sem máscara, o drawable como vem);
 *  - 'squircle'/'rounded' -> aproximação que decresce com o expoente, já que um
 *    expoente maior aproxima o quadrado.
 */
export function previewCornerRatio(shape: IconShape, exponent: number): number {
  if (shape === 'original') return 0;
  if (shape === 'circle') return 0.5;
  const effective = effectiveIconExponent(shape, exponent) ?? DEFAULT_ICON_SHAPE_EXPONENT;
  // n=2 -> 0.5 (círculo); cresce o expoente, encolhe o raio; nunca abaixo de 0.08
  const ratio = 0.5 * (2 / effective);
  return Math.max(0.08, Math.min(0.5, ratio));
}

/** Constrói as opções de máscara a partir de valores possivelmente inválidos. */
export function iconMaskOptions(shape: unknown, exponent: unknown): IconMaskOptions {
  const safeShape = normalizeIconShape(shape);
  const safeExponent = clampIconShapeExponent(exponent);
  return {
    shape: safeShape,
    exponent: effectiveIconExponent(safeShape, safeExponent),
    cacheKey: iconShapeCacheKey(safeShape, safeExponent),
  };
}

// ── Máscara activa, ao nível do módulo ───────────────────────────────────
//
// Mesmo padrão de src/utils/haptics.ts: o SettingsStore empurra o valor para cá
// e quem precisa dele lê-o daqui. É deliberadamente NÃO um import do
// SettingsStore no AppsStore — dezenas de testes de ecrã fazem
// jest.mock('.../SettingsStore') com um objecto parcial, e qualquer hook novo
// que o AppsStore lhe fosse pedir viria undefined e derrubava essas suites.

let currentMask: IconMaskOptions = iconMaskOptions('squircle', DEFAULT_ICON_SHAPE_EXPONENT);
const listeners = new Set<(mask: IconMaskOptions) => void>();

/** A máscara actualmente activa. */
export function getIconMask(): IconMaskOptions {
  return currentMask;
}

/**
 * Publica a máscara escolhida nas definições. No-op quando a chave de cache não
 * muda, para que voltar a escolher a mesma forma (duplo toque no segmento) não
 * force um varrimento de pacotes novo.
 */
export function setIconMask(shape: unknown, exponent: unknown): void {
  const next = iconMaskOptions(shape, exponent);
  if (next.cacheKey === currentMask.cacheKey) return;
  currentMask = next;
  listeners.forEach((l) => l(next));
}

/** Subscreve mudanças de máscara. Devolve a função de cancelamento. */
export function subscribeIconMask(listener: (mask: IconMaskOptions) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Só para testes: volta ao default e larga os subscritores. */
export function resetIconMaskForTests(): void {
  currentMask = iconMaskOptions('squircle', DEFAULT_ICON_SHAPE_EXPONENT);
  listeners.clear();
}
