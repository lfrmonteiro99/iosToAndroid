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
 * O arredondamento do ícone e da margem é feito para baixo quando a soma
 * `iconSize * cols + horizontalPadding * 2` excederia a largura disponível, de
 * modo a que a última coluna nunca seja cortada.
 */
export function computeLauncherGridGeometry(screenWidth: number): LauncherGridGeometry {
  const width = Math.max(1, screenWidth);
  const cols = Math.max(1, Math.min(4, Math.floor(width / 90)));

  const horizontalPadding = Math.min(
    Math.round(width * GRID_PADDING_RATIO),
    // Nunca deixar a área de conteúdo sem espaço, mesmo em larguras absurdas.
    Math.floor((width - cols) / 2),
  );

  const cellWidth = (width - horizontalPadding * 2) / cols;
  // O ícone tem de caber na célula: se o valor da especificação não couber
  // (larguras muito estreitas), fica limitado pela célula em vez de transbordar.
  const iconSize = Math.max(1, Math.min(Math.round(width * ICON_SIZE_RATIO), Math.floor(cellWidth)));

  return {
    cols,
    iconSize,
    horizontalPadding,
    cellWidth,
    iconRadius: iconSize * ICON_RADIUS_RATIO,
  };
}
