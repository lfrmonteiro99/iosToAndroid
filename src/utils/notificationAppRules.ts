/**
 * Regras de entrega de notificações por aplicação (issue #630, filho de #647).
 *
 * O iOS permite definir, para cada app, uma política de entrega — «Immediate»
 * (entrega imediata), «Scheduled» / «Digest» (entregues em lotes pelo Scheduled
 * Summary) ou «Blocked» (nunca entregues) — mais uma allow-list global de apps
 * prioritárias que notificam sempre de imediato, mesmo com um Focus modo activo,
 * e um interruptor global «Reduce Interruptions» que embala tudo o que não está
 * na allow-list. Além da configuração manual, um pequeno conjunto de apps
 * conhecidas tem uma política por omissão (`DEFAULT_APP_DELIVERY`, ex. Reddit
 * = digest) — a escolha explícita do utilizador vence sempre esse default.
 *
 * Toda a lógica de decisão vive aqui como funções puras, fora do App.tsx, para
 * ser testável sem carregar a árvore de módulos nativos (ver
 * notificationFocusFilter.ts). O AsyncStorage é tratado como não confiável, por
 * isso há normalizadores que convertem o blob na forma canónica.
 */

export type AppDeliveryPolicy = 'immediate' | 'scheduled' | 'digest' | 'blocked';

export const APP_DELIVERY_POLICIES: readonly AppDeliveryPolicy[] = [
  'immediate',
  'scheduled',
  'digest',
  'blocked',
] as const;

export const APP_DELIVERY_LABELS: Record<AppDeliveryPolicy, string> = {
  immediate: 'Immediate',
  scheduled: 'Scheduled',
  digest: 'Digest',
  blocked: 'Blocked',
};

/** Mapa canónico no store: packageName -> política. Ausência = 'immediate'. */
export type PerAppDelivery = Record<string, AppDeliveryPolicy>;

/**
 * Defaults embutidos por app (issue #630: "regras por app (WhatsApp=Immediate,
 * Reddit=Digest)"). Só apps que precisam de sair do fallback implícito
 * 'immediate' (ver `resolvePolicy`) precisam de entrada aqui — WhatsApp e
 * Telegram já ficam 'immediate' por omissão, por isso não aparecem. Uma
 * política explícita em `perAppDelivery` vence sempre este default.
 */
export const DEFAULT_APP_DELIVERY: Readonly<Record<string, AppDeliveryPolicy>> = {
  'com.reddit.frontpage': 'digest',
  'com.twitter.android': 'digest',
  'com.instagram.android': 'digest',
  'com.google.android.gm': 'scheduled',
  'com.netflix.mediaclient': 'scheduled',
};

/**
 * Resolve a política efectiva de uma app: a escolha explícita do utilizador
 * vence sempre; na ausência, cai no default embutido; na ausência desse,
 * 'immediate'.
 */
function resolvePolicy(
  perAppDelivery: PerAppDelivery | null | undefined,
  packageName: string | undefined,
): AppDeliveryPolicy {
  if (!packageName) return 'immediate';
  const explicit = perAppDelivery?.[packageName];
  if (explicit) return explicit;
  return DEFAULT_APP_DELIVERY[packageName] ?? 'immediate';
}

/** Contexto de routing consumido por routeNotification. */
export interface NotificationRouteContext {
  /** Modo de Focus activo ('off' quando nenhum). */
  focusMode: string;
  /** Allow-list global de apps que notificam sempre de imediato. */
  allowListImmediate?: string[] | null;
  /** Política por app; ausência (ou 'immediate') = entrega imediata. */
  perAppDelivery?: PerAppDelivery | null;
  /** «Reduce Interruptions»: embalar tudo o que não está na allow-list. */
  reduceInterruptions?: boolean;
}

export type NotificationRouteAction = 'show' | 'suppress' | 'ignore';

export interface NotificationRouteDecision {
  action: NotificationRouteAction;
  /** Razão curta para o veredito — útil em testes e logs. */
  reason: string;
}

/** Forma mínima de uma notificação recebida da bridge nativa. */
export interface IncomingNotification {
  id: string;
  title?: string;
  text?: string;
  packageName?: string;
}

/**
 * Decide o que fazer com uma notificação recebida.
 *
 * Ordem de prioridade (a primeira regra que bate decide):
 *  1. 'blocked'        — o utilizador bloqueou a app: nunca entrega.
 *  2. allow-list       — app prioritária: entrega imediata, mesmo em Focus.
 *  3. Focus activo     — modo de Focus ligado: suprime (a allow-list já passou).
 *  4. 'scheduled'/'digest' — app de resumo: embala para o Scheduled Summary.
 *  5. Reduce Interruptions — tudo o que não está na allow-list é embalado.
 *  6. caso contrário    — entrega imediata.
 *
 * `seen` (já vista) é tratado pelo caller (notificationCallbackForFocus), não
 * aqui, para manter routeNotification pura em relação ao seenIds.
 */
export function routeNotification(
  n: IncomingNotification | null | undefined,
  ctx: NotificationRouteContext,
): NotificationRouteDecision {
  if (!n || !n.id) return { action: 'ignore', reason: 'no-notification' };

  const pkg = n.packageName;

  // 1. Bloqueio explícito ganha a tudo.
  const policy = resolvePolicy(ctx.perAppDelivery, pkg);
  if (policy === 'blocked') return { action: 'suppress', reason: 'blocked' };

  // 2. Allow-list global: prioridade imediata.
  if (ctx.allowListImmediate && pkg && ctx.allowListImmediate.includes(pkg)) {
    return { action: 'show', reason: 'allow-list' };
  }

  // 3. Focus modo activo suprime tudo o que não está na allow-list.
  if (ctx.focusMode && ctx.focusMode !== 'off') {
    return { action: 'suppress', reason: 'focus' };
  }

  // 4. App configurada para resumo: embalar.
  if (policy === 'scheduled' || policy === 'digest') {
    return { action: 'suppress', reason: 'batched' };
  }

  // 5. Reduce Interruptions embala o resto (a allow-list já passou em 2).
  if (ctx.reduceInterruptions) return { action: 'suppress', reason: 'reduce-interruptions' };

  // 6. Entrega normal.
  return { action: 'show', reason: 'deliver' };
}

/**
 * Normaliza a allow-list lida do AsyncStorage para string[] de package names.
 * Descarta não-arrays, entradas não-string e strings vazias; dedupica mantendo
 * a ordem. Devolve sempre um array (vazio se nada válido).
 */
export function normalizeAllowList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' || entry.length === 0) continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out;
}

/**
 * Normaliza o mapa por-app lido do AsyncStorage para PerAppDelivery canónico.
 * Descarta não-objectos, chaves não-string vazias, e valores que não sejam uma
 * política conhecida (um valor corrompido significa «immediate», a omissão).
 */
export function normalizePerAppDelivery(raw: unknown): PerAppDelivery {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: PerAppDelivery = {};
  for (const [pkg, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof pkg !== 'string' || pkg.length === 0) continue;
    if (typeof value === 'string' && (APP_DELIVERY_POLICIES as readonly string[]).includes(value)) {
      out[pkg] = value as AppDeliveryPolicy;
    }
  }
  return out;
}

/** Rótulo legível da política de uma app (ausência cai no default embutido, depois em immediate). */
export function policyLabelFor(delivery: PerAppDelivery | null | undefined, packageName: string): string {
  return APP_DELIVERY_LABELS[resolvePolicy(delivery, packageName)];
}
