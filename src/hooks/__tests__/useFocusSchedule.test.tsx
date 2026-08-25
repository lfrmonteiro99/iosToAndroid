import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SettingsProvider, useSettings, DEFAULT_SETTINGS } from '../../store/SettingsStore';
import {
  useFocusSchedule,
  parseHHMM,
  isWithinSchedule,
  minutesOfDay,
} from '../useFocusSchedule';

// ---------------------------------------------------------------------------
// Funções puras — testadas sem React.
// ---------------------------------------------------------------------------
describe('useFocusSchedule — pure helpers', () => {
  it('parseHHMM converte HH:MM para minutos', () => {
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('09:00')).toBe(540);
    expect(parseHHMM('17:30')).toBe(1050);
    expect(parseHHMM('23:59')).toBe(1439);
  });

  it('parseHHMM rejeita strings inválidas (null)', () => {
    expect(parseHHMM('')).toBeNull();
    expect(parseHHMM('9:0')).toBeNull();
    expect(parseHHMM('24:00')).toBeNull();
    expect(parseHHMM('09:60')).toBeNull();
    expect(parseHHMM('abc')).toBeNull();
    expect(parseHHMM('09:00:00')).toBeNull();
    expect(parseHHMM(null as unknown as string)).toBeNull();
  });

  it('minutesOfDay extrai minutos desde a meia-noite', () => {
    expect(minutesOfDay(new Date(2026, 0, 1, 9, 30, 0))).toBe(570);
  });

  it('isWithinSchedule: intervalo normal [start, end)', () => {
    // 09:00–17:00
    expect(isWithinSchedule(540, 540, 1020)).toBe(true); // exatamente no início
    expect(isWithinSchedule(600, 540, 1020)).toBe(true); // 10:00 dentro
    expect(isWithinSchedule(1020, 540, 1020)).toBe(false); // exatamente no fim (exclusivo)
    expect(isWithinSchedule(539, 540, 1020)).toBe(false); // antes
    expect(isWithinSchedule(1021, 540, 1020)).toBe(false); // depois
  });

  it('isWithinSchedule: intervalo que atravessa a meia-noite', () => {
    // 22:00–07:00
    expect(isWithinSchedule(1320, 1320, 420)).toBe(true); // 22:00
    expect(isWithinSchedule(0, 1320, 420)).toBe(true); // meia-noite
    expect(isWithinSchedule(419, 1320, 420)).toBe(true); // 06:59
    expect(isWithinSchedule(420, 1320, 420)).toBe(false); // 07:00 exclusivo
    expect(isWithinSchedule(800, 1320, 420)).toBe(false); // 13:20 fora
  });

  it('isWithinSchedule: start === end nunca ativa', () => {
    expect(isWithinSchedule(540, 540, 540)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Hook de agendamento — testado montando um harness mínimo que expõe o
// setFocusMode real do SettingsProvider e injeta um relógio controlável.
// ---------------------------------------------------------------------------
function makeClock(initial: Date) {
  let current = initial;
  return {
    now: () => current,
    set: (d: Date) => { current = d; },
  };
}

function Harness({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider gateFirstRender={false}>
      {children}
    </SettingsProvider>
  );
}

// Harness com o gate ligado (igual à app real): o provider não monta a árvore
// até a hidratação do AsyncStorage terminar, por isso o hook só avalia DEPOIS
// de settings já trazer o schedule (caso de arranque real).
function HarnessGated({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider gateFirstRender>
      {children}
    </SettingsProvider>
  );
}

function useProbeSchedule(clock: ReturnType<typeof makeClock>) {
  const handle = useFocusSchedule(clock.now);
  const s = useSettings();
  return { handle, ...s };
}

describe('useFocusSchedule — activation on crossing the start boundary', () => {
  beforeEach(() => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  it('activates Work when the clock crosses the start boundary (false→true)', async () => {
    const clock = makeClock(new Date(2026, 0, 1, 8, 0, 0)); // antes do início (09:00)
    const { result } = renderHook(() => useProbeSchedule(clock), {
      wrapper: ({ children }) => <Harness >{children}</Harness>,
    });
    await act(async () => {});

    // Estado inicial: schedule on, fora do intervalo.
    await act(async () => {
      result.current.update('focusScheduleEnabled', true);
      result.current.update('focusScheduleStart', '09:00');
      result.current.update('focusScheduleEnd', '17:00');
    });
    // Primeira avaliação (após ligar) corre no arranque do effect -> wasInside=false.
    result.current.handle.tick();

    expect(result.current.settings.focusMode).toBe('off');

    // Cruza o limite de início.
    act(() => { clock.set(new Date(2026, 0, 1, 10, 0, 0)); });
    act(() => { result.current.handle.tick(); });

    await waitFor(() => expect(result.current.settings.focusMode).toBe('work'));
  });

  it('does NOT activate on startup when already inside the interval (no false activation)', async () => {
    // App arranca com o schedule JÁ ligado e dentro do intervalo (10:00 em
    // 09:00–17:00) — simula o arranque real hidratando do AsyncStorage e
    // usando o gate (o hook só monta após a hidratação).
    const saved = JSON.stringify({
      ...DEFAULT_SETTINGS,
      focusScheduleEnabled: true,
      focusScheduleStart: '09:00',
      focusScheduleEnd: '17:00',
    });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(saved);

    const clock = makeClock(new Date(2026, 0, 1, 10, 0, 0)); // DENTRO do intervalo ao arrancar
    const { result } = renderHook(() => useProbeSchedule(clock), {
      wrapper: ({ children }) => <HarnessGated >{children}</HarnessGated>,
    });

    // Espera a hidratação completar (gate aberto + settings com schedule on).
    await waitFor(() => expect(result.current.settings.focusScheduleEnabled).toBe(true));

    // Arrancou com schedule on e dentro do intervalo mas focus off -> NÃO ativa.
    expect(result.current.settings.focusMode).toBe('off');
  });

  it('does not override a manually-activated focus while inside the interval', async () => {
    const clock = makeClock(new Date(2026, 0, 1, 10, 0, 0)); // dentro do intervalo
    const { result } = renderHook(() => useProbeSchedule(clock), {
      wrapper: ({ children }) => <Harness >{children}</Harness>,
    });
    await act(async () => {});

    await act(async () => {
      result.current.update('focusScheduleEnabled', true);
      result.current.update('focusScheduleStart', '09:00');
      result.current.update('focusScheduleEnd', '17:00');
      result.current.update('focusMode', 'personal'); // utilizador ativou manualmente
    });
    result.current.handle.tick();

    // Mesmo dentro do intervalo, não sobrepomos o modo manual.
    expect(result.current.settings.focusMode).toBe('personal');
  });

  it('deactivates Work when crossing the end boundary (true→false)', async () => {
    const clock = makeClock(new Date(2026, 0, 1, 8, 0, 0)); // antes do início
    const { result } = renderHook(() => useProbeSchedule(clock), {
      wrapper: ({ children }) => <Harness >{children}</Harness>,
    });
    await act(async () => {});

    await act(async () => {
      result.current.update('focusScheduleEnabled', true);
      result.current.update('focusScheduleStart', '09:00');
      result.current.update('focusScheduleEnd', '17:00');
    });
    result.current.handle.tick(); // wasInside=false (8h)

    // Cruza o início -> ativa.
    act(() => { clock.set(new Date(2026, 0, 1, 10, 0, 0)); });
    act(() => { result.current.handle.tick(); });
    await waitFor(() => expect(result.current.settings.focusMode).toBe('work'));

    // Agora cruza o fim (depois das 17:00) -> desativa.
    act(() => { clock.set(new Date(2026, 0, 1, 18, 0, 0)); });
    act(() => { result.current.handle.tick(); });
    await waitFor(() => expect(result.current.settings.focusMode).toBe('off'));
  });

  it('turning the schedule off clears a schedule-driven Work focus', async () => {
    const clock = makeClock(new Date(2026, 0, 1, 8, 0, 0));
    const { result } = renderHook(() => useProbeSchedule(clock), {
      wrapper: ({ children }) => <Harness >{children}</Harness>,
    });
    await act(async () => {});

    await act(async () => {
      result.current.update('focusScheduleEnabled', true);
      result.current.update('focusScheduleStart', '09:00');
      result.current.update('focusScheduleEnd', '17:00');
    });
    result.current.handle.tick();
    act(() => { clock.set(new Date(2026, 0, 1, 10, 0, 0)); });
    act(() => { result.current.handle.tick(); });
    await waitFor(() => expect(result.current.settings.focusMode).toBe('work'));

    await act(async () => {
      result.current.update('focusScheduleEnabled', false);
    });
    await waitFor(() => expect(result.current.settings.focusMode).toBe('off'));
  });

  it('ignores invalid (unparseable) schedule times — Never activates', async () => {
    const clock = makeClock(new Date(2026, 0, 1, 10, 0, 0));
    const { result } = renderHook(() => useProbeSchedule(clock), {
      wrapper: ({ children }) => <Harness >{children}</Harness>,
    });
    await act(async () => {});

    await act(async () => {
      result.current.update('focusScheduleEnabled', true);
      result.current.update('focusScheduleStart', 'not-a-time');
      result.current.update('focusScheduleEnd', '17:00');
    });
    result.current.handle.tick();

    expect(result.current.settings.focusMode).toBe('off');
  });
});
