// Geometria da grelha do launcher.
//
// A §2 da ESPECIFICACAO.md exige que tudo seja derivado da largura do ecrã e que
// nada seja fixado em px: o ícone é 0.153 x W, a margem lateral 0.070 x W e o
// raio do ícone 0.2237 x ICON_SIZE. Antes disto o ecrã usava os literais 60 / 16
// / 13.5, que só coincidem com a especificação a 393dp.
//
// Vive num módulo próprio (e não inline no ecrã) para ser exercitável para
// várias larguras sem montar o ecrã inteiro nem mexer no mock de Dimensions.

/** Fracção da largura do ecrã ocupada por um ícone (§2). */
export const ICON_SIZE_RATIO = 0.153;
/** Fracção da largura do ecrã usada como margem lateral da grelha (§2). */
export const GRID_PADDING_RATIO = 0.07;
/** Fracção do lado do ícone usada como raio do squircle (§2: 13.5 / 60). */
export const ICON_RADIUS_RATIO = 0.2237;

export type LauncherGridGeometry = {
  /** Colunas da grelha. */
  cols: number;
  /** Lado do ícone, em dp. */
  iconSize: number;
  /** Margem lateral da grelha, em dp. */
  horizontalPadding: number;
  /** Largura de cada célula, em dp (pode ser fraccionária). */
  cellWidth: number;
  /** Raio do canto do ícone, proporcional ao lado. */
  iconRadius: number;
};

/**
 * Deriva toda a geometria da grelha a partir da largura do ecrã.
 *
 * `cols` e `iconScale` são opcionais (issue #503 — densidade de grelha
 * configurável): omitidos, mantêm o comportamento histórico de 4 colunas e
 * ícone a 0.153 x W exactamente (#500). Quando fornecidos, o ícone continua
 * derivado de 0.153 x W (escalado por `iconScale`) e é depois limitado à
 * célula da coluna, que por sua vez encolhe com mais colunas — por isso mais
 * colunas nunca produzem sobreposição, apenas ícones mais pequenos.
 *
 * O arredondamento do ícone e da margem é feito para baixo quando a soma
 * `iconSize * cols + horizontalPadding * 2` excederia a largura disponível, de
 * modo a que a última coluna nunca seja cortada.
 */
export function computeLauncherGridGeometry(
  screenWidth: number,
  cols: number = 4,
  iconScale: number = 1,
): LauncherGridGeometry {
  const width = Math.max(1, screenWidth);
  const safeCols = Math.max(1, Math.round(cols));

  const horizontalPadding = Math.max(
    0,
    Math.min(
      Math.round(width * GRID_PADDING_RATIO),
      // Nunca deixar a área de conteúdo sem espaço, mesmo em larguras absurdas.
      Math.floor((width - safeCols) / 2),
    ),
  );

  const cellWidth = (width - horizontalPadding * 2) / safeCols;
  // O ícone tem de caber na célula: se o valor da especificação (escalado) não
  // couber (larguras muito estreitas ou mais colunas), fica limitado pela
  // célula em vez de transbordar/sobrepor a coluna seguinte.
  const iconSize = Math.max(
    0,
    Math.min(Math.round(width * ICON_SIZE_RATIO * iconScale), Math.floor(cellWidth)),
  );

  return {
    cols: safeCols,
    iconSize,
    horizontalPadding,
    cellWidth,
    iconRadius: iconSize * ICON_RADIUS_RATIO,
  };
}
