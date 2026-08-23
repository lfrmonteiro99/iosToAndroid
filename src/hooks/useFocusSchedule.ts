import { useEffect, useRef } from 'react';
import { useSettings } from '../store/SettingsStore';

/**
 * Converte 'HH:MM' (24h) num número de minutos desde a meia-noite.
 * Devolve null se a string for inválida — o caller trata isso como "não ativar".
 */
export function parseHHMM(value: string): number | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Minutes since midnight for a Date.
 */
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * True when `nowMinutes` cai dentro do intervalo [start, end).
 *
 * Trata o caso que atravessa a meia-noite (ex.: 22:00–07:00): nesse caso o
 * intervalo "começa" à noite e "acaba" de manhã, por isso está dentro se o
 * momento for >= start OU < end.
 *
 * Pré-condição: start e end já validados (não-null). Se start === end, não há
 * intervalo (desativa sempre) — o caller decide, mas por segurança devolvemos
 * false para não ativar em falso.
 */
export function isWithinSchedule(
  nowMinutes: number,
  start: number,
  end: number,
): boolean {
  if (start === end) return false;
  if (start < end) {
    return nowMinutes >= start && nowMinutes < end;
  }
  // atravessa a meia-noite
  return nowMinutes >= start || nowMinutes < end;
}

const SCHEDULE_CHECK_MS = 30_000;

export interface FocusScheduleHandle {
  /** Força uma reavaliação imediata (usado por testes com relógio injetado). */
  tick: () => void;
}

/**
 * Liga o agendamento de Focus por horário ao estado da app.
 *
 * Mecanismo:
 *  - Quando `focusScheduleEnabled` está on, um intervalo de 30s avalia a hora
 *    atual contra [focusScheduleStart, focusScheduleEnd) e chama
 *    setFocusMode('work') / setFocusMode('off') ao cruzar os limites.
 *  - Guarda de ativação em falso no arranque: quando o app inicia DENTRO do
 *    intervalo, não assumimos que o Focus deve estar on — só o ativamos quando
 *    o relógio CRUZA o limite de início (transição false→true). Isto evita que
 *    o launcher ligue o Work ao abrir o telemóvel às 10:00 se o utilizador o
 *    tinha desligado manualmente. O critério de aceitação "não ativa em falso
 *    ao arrancar dentro do intervalo" refere-se a isto (respeita foco manual).
 *  - Se o utilizador ativar manualmente um modo de focus (focusMode !== 'off')
 *    enquanto o schedule está on e estamos DENTRO do intervalo, NÃO o desligamos
 *    — o schedule só gere a transição automática, não sobrepõe-se à vontade
 *    manual. Fora do intervalo, o schedule desliga automaticamente.
 *  - O intervalo pára quando o schedule é desligado, e limpa o foco 'work'
 *    automático se este tiver sido posto pelo schedule.
 *
 * @param nowProvider injetável para testes (devolve o Date "atual").
 */
export function useFocusSchedule(
  nowProvider: () => Date = () => new Date(),
): FocusScheduleHandle {
  const { settings, setFocusMode } = useSettings();

  // Reflita settings num ref para o callback do intervalo não ficar stale.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Guarda se o 'work' atual foi posto pelo schedule, para não o desligar se o
  // utilizador o ativou manualmente.
  const scheduledWorkOnRef = useRef(false);

  // True após a primeira avaliação de sempre do hook (arranque da app). Usado
  // para a guarda "não ativa em falso ao arrancar dentro do intervalo": na
  // primeira evaluate, se já estivermos dentro, registamos o estado mas NÃO
  // ativamos — só as transições false→true posteriores é que ativam.
  const hasBootedRef = useRef(false);

  // hasBootedRef é inicializado a false; as evaluações seguintes preenchem-no.
  // Estado "dentro do intervalo" da última avaliação.
  const wasInsideRef = useRef(false);

  const evaluate = () => {
    const s = settingsRef.current;
    if (!s.focusScheduleEnabled) {
      if (scheduledWorkOnRef.current) {
        scheduledWorkOnRef.current = false;
        if (s.focusMode === 'work') setFocusMode('off');
      }
      wasInsideRef.current = false;
      hasBootedRef.current = true;
      return;
    }

    const start = parseHHMM(s.focusScheduleStart);
    const end = parseHHMM(s.focusScheduleEnd);
    if (start === null || end === null) {
      wasInsideRef.current = false;
      hasBootedRef.current = true;
      return; // horários inválidos: não ativar
    }

    const isInside = isWithinSchedule(minutesOfDay(nowProvider()), start, end);
    const wasInside = wasInsideRef.current;

    if (!hasBootedRef.current) {
      // Primeira avaliação (arranque da app): se já estamos dentro, NÃO
      // ativamos (guarda de arranque em falso) — apenas registamos o estado.
      wasInsideRef.current = isInside;
      hasBootedRef.current = true;
      return;
    }

    if (isInside && !wasInside) {
      // Cruzou o limite de início: ativa o Work (mesmo que esteja off).
      scheduledWorkOnRef.current = true;
      if (s.focusMode === 'off') setFocusMode('work');
    } else if (!isInside && wasInside) {
      // Cruzou o limite de fim: desativa se fomos nós que ligámos.
      if (scheduledWorkOnRef.current && s.focusMode === 'work') {
        setFocusMode('off');
      }
      scheduledWorkOnRef.current = false;
    }

    wasInsideRef.current = isInside;
  };

  useEffect(() => {
    // Avaliação inicial (não ativa em falso no arranque).
    evaluate();
    const id = setInterval(evaluate, SCHEDULE_CHECK_MS);
    return () => clearInterval(id);
    // Reavalia quando muda enable/horário; a função evaluate é estável porque
    // usa só refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.focusScheduleEnabled, settings.focusScheduleStart, settings.focusScheduleEnd, nowProvider]);

  return { tick: evaluate };
}
