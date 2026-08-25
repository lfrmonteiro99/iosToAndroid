/**
 * Política de «Require Passcode» (#611), o equivalente ao iOS
 * «Face ID & Passcode → Require Passcode».
 *
 * O iOS não exige a passcode em cada acordar do ecrã: exige-a apenas quando
 * passou mais do que o intervalo escolhido desde o último desbloqueio
 * bem-sucedido. Dentro desse intervalo o ecrã de bloqueio continua a aparecer,
 * mas o swipe-up basta — não há prompt de biometria nem teclado de passcode.
 */

export type RequirePasscodeAfter =
  | 'immediately'
  | '1min'
  | '5min'
  | '15min'
  | '1hour'
  | '4hours';

/** Tolerância, em ms, de cada opção. 'immediately' é zero por definição. */
export const REQUIRE_PASSCODE_DELAY_MS: Record<RequirePasscodeAfter, number> = {
  immediately: 0,
  '1min': 60_000,
  '5min': 5 * 60_000,
  '15min': 15 * 60_000,
  '1hour': 60 * 60_000,
  '4hours': 4 * 60 * 60_000,
};

/** Rótulos como aparecem no iOS, na ordem do action sheet. */
export const REQUIRE_PASSCODE_LABELS: Record<RequirePasscodeAfter, string> = {
  immediately: 'Immediately',
  '1min': 'After 1 minute',
  '5min': 'After 5 minutes',
  '15min': 'After 15 minutes',
  '1hour': 'After 1 hour',
  '4hours': 'After 4 hours',
};

export const REQUIRE_PASSCODE_OPTIONS: RequirePasscodeAfter[] = [
  'immediately',
  '1min',
  '5min',
  '15min',
  '1hour',
  '4hours',
];

export const DEFAULT_REQUIRE_PASSCODE_AFTER: RequirePasscodeAfter = 'immediately';

/**
 * Normaliza um valor lido do AsyncStorage. Um valor corrompido ou de uma versão
 * futura não pode virar uma tolerância indefinida (que o `Number` tornaria
 * `NaN` e a comparação abaixo tornaria «nunca exigir passcode»), por isso cai
 * no default mais restritivo.
 */
export function normalizeRequirePasscodeAfter(value: unknown): RequirePasscodeAfter {
  return typeof value === 'string' && value in REQUIRE_PASSCODE_DELAY_MS
    ? (value as RequirePasscodeAfter)
    : DEFAULT_REQUIRE_PASSCODE_AFTER;
}

/**
 * Decide se o desbloqueio exige autenticação.
 *
 * @param option    a opção escolhida pelo utilizador (valores inválidos caem no default)
 * @param lastUnlockAt epoch ms do último desbloqueio, ou null quando nunca houve
 *                     um (arranque a frio) — nesse caso exige-se sempre.
 * @param now       epoch ms actual.
 */
export function isPasscodeRequired(
  option: unknown,
  lastUnlockAt: number | null,
  now: number,
): boolean {
  const resolved = normalizeRequirePasscodeAfter(option);
  const delay = REQUIRE_PASSCODE_DELAY_MS[resolved];
  if (delay === 0) return true;
  if (lastUnlockAt === null || !Number.isFinite(lastUnlockAt)) return true;
  const elapsed = now - lastUnlockAt;
  // Relógio para trás (NTP, mudança manual de hora) daria um `elapsed` negativo
  // e adiaria a passcode indefinidamente — trata-se como «não confiável».
  if (elapsed < 0) return true;
  return elapsed >= delay;
}
