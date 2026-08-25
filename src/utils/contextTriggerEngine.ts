/**
 * Context Engine — motor de regras Wi-Fi/Bluetooth/localização/hora (#628,
 * filho do épico de Perfis Contextuais).
 *
 * O FocusScreen já suporta um modo manual e um "Focus Schedule" simples
 * (booleano on/off, ver useFocusSchedule.ts). Este módulo acrescenta um
 * segundo mecanismo, aditivo e independente: regras de contexto compostas
 * (`ContextRule`) que combinam condições (Wi-Fi ligado a um SSID, dispositivo
 * Bluetooth emparelhado, localização dentro de um raio, janela horária +
 * dias da semana) com um combinador AND/OR, e apontam para um FocusMode de
 * destino (reaproveita o enum já existente em FocusScreen/SettingsStore).
 *
 * Este ficheiro é puro (sem React, sem I/O) para ser testável isoladamente —
 * o hook `useContextEngine` (src/hooks/useContextEngine.ts) é quem liga isto
 * ao estado vivo da app (DeviceStore para Wi-Fi/Bluetooth, LocationStore para
 * localização, relógio para hora/dia da semana).
 *
 * Limitação conhecida (documentada, não escondida): o bridge nativo
 * (LauncherModule.getBluetoothInfo) só expõe `bondedDevices` (dispositivos
 * emparelhados), não o estado de ligação activa por dispositivo — não existe
 * `BluetoothProfile.getConnectionState` no Kotlin actual. A condição
 * `bluetooth` desta engine testa portanto "está emparelhado", não "está
 * ligado agora". Expor a ligação activa exigiria trabalho nativo adicional
 * (proxy de perfil A2DP/HFP) fora do âmbito desta issue.
 */

export type ContextTargetMode = 'doNotDisturb' | 'sleep' | 'work' | 'personal';

export const CONTEXT_TARGET_MODES: ContextTargetMode[] = ['doNotDisturb', 'sleep', 'work', 'personal'];

export interface WifiCondition {
  type: 'wifi';
  ssid: string;
}

export interface BluetoothCondition {
  type: 'bluetooth';
  address: string;
}

export interface LocationCondition {
  type: 'location';
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface TimeCondition {
  type: 'time';
  /** 'HH:MM' 24h, mesmo formato de focusScheduleStart/End. */
  start: string;
  end: string;
  /** 0=domingo … 6=sábado. Vazio = todos os dias. */
  weekdays: number[];
}

export type ContextCondition = WifiCondition | BluetoothCondition | LocationCondition | TimeCondition;

export type ContextCombinator = 'AND' | 'OR';

export interface ContextRule {
  id: string;
  name: string;
  enabled: boolean;
  combinator: ContextCombinator;
  conditions: ContextCondition[];
  targetMode: ContextTargetMode;
}

export interface ContextSnapshot {
  /** SSID da rede Wi-Fi actualmente ligada, ou null se Wi-Fi desligado/sem ligação. */
  wifiSsid: string | null;
  /** Endereços MAC dos dispositivos Bluetooth emparelhados (ver limitação acima). */
  bluetoothPairedAddresses: string[];
  /** Localização actual, ou null se desconhecida/sem permissão. */
  location: { latitude: number; longitude: number } | null;
  now: Date;
}

/**
 * Converte 'HH:MM' (24h) em minutos desde a meia-noite. null se inválido.
 * Duplicado intencionalmente de useFocusSchedule.parseHHMM: esse ficheiro é
 * dono do contrato do Focus Schedule legado, este é dono do contrato da
 * Context Engine — mantê-los desacoplados evita que uma alteração num
 * mecanismo mude silenciosamente o outro.
 */
function parseHHMM(value: string): number | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** True quando `nowMinutes` cai em [start, end), incluindo o caso que atravessa a meia-noite. */
function isWithinWindow(nowMinutes: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return nowMinutes >= start && nowMinutes < end;
  return nowMinutes >= start || nowMinutes < end;
}

const EARTH_RADIUS_METERS = 6371000;

/** Distância em metros entre duas coordenadas (fórmula de Haversine). */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/** Avalia uma única condição contra o snapshot actual. */
export function evaluateCondition(condition: ContextCondition, snapshot: ContextSnapshot): boolean {
  switch (condition.type) {
    case 'wifi':
      return snapshot.wifiSsid !== null && snapshot.wifiSsid === condition.ssid;
    case 'bluetooth':
      return snapshot.bluetoothPairedAddresses.includes(condition.address);
    case 'location': {
      if (!snapshot.location || !(condition.radiusMeters > 0)) return false;
      const distance = haversineDistanceMeters(
        snapshot.location.latitude,
        snapshot.location.longitude,
        condition.latitude,
        condition.longitude,
      );
      return distance <= condition.radiusMeters;
    }
    case 'time': {
      const start = parseHHMM(condition.start);
      const end = parseHHMM(condition.end);
      if (start === null || end === null) return false;
      if (!isWithinWindow(minutesOfDay(snapshot.now), start, end)) return false;
      if (condition.weekdays.length === 0) return true;
      return condition.weekdays.includes(snapshot.now.getDay());
    }
    default:
      return false;
  }
}

/**
 * Avalia uma regra completa: combina as condições com AND/OR.
 *
 * Uma regra desativada nunca dispara. Uma regra sem condições também nunca
 * dispara — nem em AND (que vacuamente seria `true` para lista vazia) nem em
 * OR — porque uma regra sem condições não tem intenção reconhecível e
 * disparar sempre seria o comportamento mais destrutivo possível (ligaria o
 * modo de destino permanentemente, sem o utilizador ter definido nenhum
 * gatilho).
 */
export function evaluateRule(rule: ContextRule, snapshot: ContextSnapshot): boolean {
  if (!rule.enabled || rule.conditions.length === 0) return false;
  return rule.combinator === 'OR'
    ? rule.conditions.some((c) => evaluateCondition(c, snapshot))
    : rule.conditions.every((c) => evaluateCondition(c, snapshot));
}

/**
 * Devolve a primeira regra activada (na ordem da lista, que funciona como
 * prioridade) cujas condições combinam com o snapshot, ou null se nenhuma
 * combinar. Regras desativadas são sempre ignoradas.
 */
export function pickActiveRule(rules: ContextRule[], snapshot: ContextSnapshot): ContextRule | null {
  for (const rule of rules) {
    if (evaluateRule(rule, snapshot)) return rule;
  }
  return null;
}

function isValidTargetMode(value: unknown): value is ContextTargetMode {
  return typeof value === 'string' && (CONTEXT_TARGET_MODES as string[]).includes(value);
}

function normalizeCondition(raw: unknown): ContextCondition | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  switch (c.type) {
    case 'wifi':
      return typeof c.ssid === 'string' && c.ssid.trim() !== ''
        ? { type: 'wifi', ssid: c.ssid }
        : null;
    case 'bluetooth':
      return typeof c.address === 'string' && c.address.trim() !== ''
        ? { type: 'bluetooth', address: c.address }
        : null;
    case 'location': {
      const lat = c.latitude;
      const lon = c.longitude;
      const radius = c.radiusMeters;
      if (
        typeof lat === 'number' && Number.isFinite(lat) &&
        typeof lon === 'number' && Number.isFinite(lon) &&
        typeof radius === 'number' && Number.isFinite(radius) && radius > 0
      ) {
        return { type: 'location', latitude: lat, longitude: lon, radiusMeters: radius };
      }
      return null;
    }
    case 'time': {
      if (parseHHMM(c.start as string) === null || parseHHMM(c.end as string) === null) return null;
      const weekdaysRaw = Array.isArray(c.weekdays) ? c.weekdays : [];
      const seen = new Set<number>();
      for (const w of weekdaysRaw) {
        if (typeof w === 'number' && Number.isInteger(w) && w >= 0 && w <= 6) seen.add(w);
      }
      return {
        type: 'time',
        start: c.start as string,
        end: c.end as string,
        weekdays: Array.from(seen).sort((a, b) => a - b),
      };
    }
    default:
      return null;
  }
}

/**
 * Normaliza o valor lido do AsyncStorage para `ContextRule[]`.
 *
 * O AsyncStorage é um blob JSON não confiável (mesmo padrão de
 * focusPageVisibility.ts / focusDockOverride.ts): entradas malformadas são
 * descartadas em vez de fazer a app rebentar. `combinator` inválido cai para
 * 'AND' (campo recuperável sem ambiguidade); `targetMode` inválido descarta a
 * regra inteira (não há destino seguro para adivinhar). Uma regra cujas
 * condições fiquem todas inválidas após o filtro também é descartada — uma
 * regra sem condições nunca dispara (ver evaluateRule) e persisti-la seria só
 * lixo de dados.
 */
export function normalizeContextRules(raw: unknown): ContextRule[] {
  if (!Array.isArray(raw)) return [];
  const out: ContextRule[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const r = entry as Record<string, unknown>;
    if (typeof r.id !== 'string' || r.id.trim() === '') continue;
    if (!isValidTargetMode(r.targetMode)) continue;
    const conditions = Array.isArray(r.conditions)
      ? r.conditions.map(normalizeCondition).filter((c): c is ContextCondition => c !== null)
      : [];
    if (conditions.length === 0) continue;
    out.push({
      id: r.id,
      name: typeof r.name === 'string' ? r.name : '',
      enabled: r.enabled !== false,
      combinator: r.combinator === 'OR' ? 'OR' : 'AND',
      conditions,
      targetMode: r.targetMode,
    });
  }
  return out;
}
