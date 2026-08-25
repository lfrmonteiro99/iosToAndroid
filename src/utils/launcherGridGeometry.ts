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
  /** Largura de cada célula, em dp. Sempre inteira — ver computeLauncherGridGeometry. */
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

  // A célula é INTEIRA, nunca fraccionária.
  //
  // Antes disto a célula era `(width - padding * 2) / cols`, e isso partia a
  // grelha em quase todas as combinações reais de largura/colunas: o contentor
  // da grelha é `flexWrap`, o dispositivo arredonda a largura de cada filho
  // para cima ao pixel, e a soma passava a área de conteúdo por 1-2 px — pelo
  // que a ÚLTIMA coluna era empurrada para a linha seguinte. O utilizador
  // escolhia 5 colunas nas Settings, via 4, e sobrava uma coluna inteira em
  // branco à direita (W=393 cols=5: 67.4 -> 68*5 = 340 > 337 disponíveis; o
  // mesmo a 360/390/412/428/440 e também em 3, 4 e 6 colunas).
  //
  // Com o piso, `cellWidth * cols <= disponível` por construção. A sobra fica
  // no fim da linha e é no máximo `cols - 1` px (<= 5 px), ou seja invisível —
  // ao contrário da coluna inteira que se perdia antes. A margem §2 não é
  // tocada: dobrar a sobra para dentro dela mudaria o valor especificado (a
  // 360dp passaria de 25 para 26) para ganhar 1 px de simetria.
  const available = width - horizontalPadding * 2;
  const cellWidth = Math.max(0, Math.floor(available / safeCols));

  // O ícone tem de caber na célula: se o valor da especificação (escalado) não
  // couber (larguras muito estreitas ou mais colunas), fica limitado pela
  // célula em vez de transbordar/sobrepor a coluna seguinte.
  const iconSize = Math.max(
    0,
    Math.min(Math.round(width * ICON_SIZE_RATIO * iconScale), cellWidth),
  );

  return {
    cols: safeCols,
    iconSize,
    horizontalPadding,
    cellWidth,
    iconRadius: iconSize * ICON_RADIUS_RATIO,
  };
}

// ─── Limites mútuos entre colunas e tamanho de ícone ────────────────────────
//
// `computeLauncherGridGeometry` nunca deixa um ícone transbordar: se não cabe na
// célula, ENCOLHE. Isso mantém a grelha correcta mas mente ao utilizador — ele
// escolhe 6 colunas e 120% de tamanho, e o que recebe são ícones a ~90% sem
// nenhuma indicação de que o pedido não era possível.
//
// As duas funções abaixo tornam esse limite explícito para a UI das Settings
// poder oferecer apenas o que cabe, em vez de aceitar tudo e degradar em
// silêncio. São puras e derivadas da MESMA aritmética do layout, para não
// poderem discordar dele.

/**
 * Número máximo de colunas que caibam à largura dada sem encolher o ícone
 * abaixo do seu tamanho especificado (§2, escalado por `iconScale`).
 *
 * "Cabe" é apenas "o ícone entra na célula". Deliberadamente não se exige uma
 * goteira mínima extra: a 393dp com ícone a 100% isso reprovaria 5 colunas, que
 * é uma escolha legítima e cabe (célula 67 >= ícone 60).
 */
export function maxColumnsFor(screenWidth: number, iconScale: number = 1): number {
  const width = Math.max(1, screenWidth);
  const { horizontalPadding } = computeLauncherGridGeometry(width, 1, iconScale);
  const available = width - horizontalPadding * 2;
  const specIconSize = Math.max(1, Math.round(width * ICON_SIZE_RATIO * iconScale));
  return Math.max(1, Math.floor(available / specIconSize));
}

/**
 * Maior escala de ícone que ainda cabe na célula, para a largura e o número de
 * colunas dados. O inverso de `maxColumnsFor`, para o slider do tamanho poder
 * limitar-se ao que a densidade escolhida permite.
 *
 * Devolve a escala exacta (não arredondada); o chamador é que decide o passo e
 * o mínimo do seu controlo.
 */
export function maxIconScaleFor(screenWidth: number, cols: number): number {
  const width = Math.max(1, screenWidth);
  const { cellWidth } = computeLauncherGridGeometry(width, cols, 1);
  const specIconAtScaleOne = width * ICON_SIZE_RATIO;
  if (specIconAtScaleOne <= 0) return 1;
  return cellWidth / specIconAtScaleOne;
}
