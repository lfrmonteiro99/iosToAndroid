import {
  routeNotification,
  normalizeAllowList,
  normalizePerAppDelivery,
  policyLabelFor,
  DEFAULT_APP_DELIVERY,
  type NotificationRouteContext,
  type IncomingNotification,
} from '../notificationAppRules';

const N = (pkg: string): IncomingNotification => ({ id: 'n1', title: 'Hi', text: 'there', packageName: pkg });

describe('routeNotification — issue #630', () => {
  it('shows an immediate notification when nothing is configured', () => {
    const ctx: NotificationRouteContext = { focusMode: 'off' };
    expect(routeNotification(N('com.slack'), ctx)).toEqual({ action: 'show', reason: 'deliver' });
  });

  it('suppresses when a Focus mode is active', () => {
    const ctx: NotificationRouteContext = { focusMode: 'work' };
    expect(routeNotification(N('com.slack'), ctx)).toEqual({ action: 'suppress', reason: 'focus' });
  });

  it('lets an allow-listed app through even during Focus', () => {
    const ctx: NotificationRouteContext = {
      focusMode: 'work',
      allowListImmediate: ['com.slack'],
    };
    expect(routeNotification(N('com.slack'), ctx)).toEqual({ action: 'show', reason: 'allow-list' });
  });

  it('still suppresses a non-allow-listed app during Focus', () => {
    const ctx: NotificationRouteContext = {
      focusMode: 'work',
      allowListImmediate: ['com.gmail'],
    };
    expect(routeNotification(N('com.slack'), ctx)).toEqual({ action: 'suppress', reason: 'focus' });
  });

  it('blocks a Blocked app even with no Focus and no allow-list', () => {
    const ctx: NotificationRouteContext = {
      focusMode: 'off',
      perAppDelivery: { 'com.spam': 'blocked' },
    };
    expect(routeNotification(N('com.spam'), ctx)).toEqual({ action: 'suppress', reason: 'blocked' });
  });

  it('blocks a Blocked app even when it is also allow-listed (block wins)', () => {
    const ctx: NotificationRouteContext = {
      focusMode: 'work',
      allowListImmediate: ['com.spam'],
      perAppDelivery: { 'com.spam': 'blocked' },
    };
    expect(routeNotification(N('com.spam'), ctx)).toEqual({ action: 'suppress', reason: 'blocked' });
  });

  it('batches a Scheduled app when no Focus is active', () => {
    const ctx: NotificationRouteContext = {
      focusMode: 'off',
      perAppDelivery: { 'com.news': 'scheduled' },
    };
    expect(routeNotification(N('com.news'), ctx)).toEqual({ action: 'suppress', reason: 'batched' });
  });

  it('batches a Digest app when no Focus is active', () => {
    const ctx: NotificationRouteContext = {
      focusMode: 'off',
      perAppDelivery: { 'com.news': 'digest' },
    };
    expect(routeNotification(N('com.news'), ctx)).toEqual({ action: 'suppress', reason: 'batched' });
  });

  it('Reduce Interruptions batches everything except the allow-list', () => {
    const ctx: NotificationRouteContext = {
      focusMode: 'off',
      allowListImmediate: ['com.slack'],
      reduceInterruptions: true,
    };
    expect(routeNotification(N('com.slack'), ctx)).toEqual({ action: 'show', reason: 'allow-list' });
    expect(routeNotification(N('com.news'), ctx)).toEqual({ action: 'suppress', reason: 'reduce-interruptions' });
  });

  it('ignores a null/undefined notification', () => {
    const ctx: NotificationRouteContext = { focusMode: 'off' };
    expect(routeNotification(null, ctx)).toEqual({ action: 'ignore', reason: 'no-notification' });
    expect(routeNotification(undefined, ctx)).toEqual({ action: 'ignore', reason: 'no-notification' });
  });

  it('ignores a notification with no id', () => {
    const ctx: NotificationRouteContext = { focusMode: 'off' };
    expect(routeNotification({ packageName: 'com.x' } as IncomingNotification, ctx)).toEqual({
      action: 'ignore',
      reason: 'no-notification',
    });
  });

  // Caso de fronteira: app sem packageName (notificação de sistema) com Focus
  // activo é suprimida — não há like nulo a passar.
  it('suppresses a package-less notification during Focus', () => {
    const ctx: NotificationRouteContext = { focusMode: 'sleep' };
    expect(routeNotification({ id: 'n', title: 't' }, ctx)).toEqual({ action: 'suppress', reason: 'focus' });
  });

  // Issue #630 nomeia explicitamente "regras por app (WhatsApp=Immediate,
  // Reddit=Digest)" como comportamento embutido, não algo que o utilizador
  // tenha de configurar à mão. Sem perAppDelivery nenhum, uma app conhecida
  // como digest-by-default (Reddit) tem de embalar; uma app sem entrada nos
  // defaults (WhatsApp já é 'immediate' por omissão) continua a entregar.
  it('batches a built-in digest-by-default app with no perAppDelivery configured', () => {
    const ctx: NotificationRouteContext = { focusMode: 'off' };
    expect(routeNotification(N('com.reddit.frontpage'), ctx)).toEqual({
      action: 'suppress',
      reason: 'batched',
    });
  });

  it('still delivers WhatsApp immediately with no configuration (default fallback already immediate)', () => {
    const ctx: NotificationRouteContext = { focusMode: 'off' };
    expect(routeNotification(N('com.whatsapp'), ctx)).toEqual({ action: 'show', reason: 'deliver' });
  });

  it('an explicit user perAppDelivery overrides the built-in default', () => {
    const ctx: NotificationRouteContext = {
      focusMode: 'off',
      perAppDelivery: { 'com.reddit.frontpage': 'immediate' },
    };
    expect(routeNotification(N('com.reddit.frontpage'), ctx)).toEqual({ action: 'show', reason: 'deliver' });
  });
});

describe('normalizeAllowList', () => {
  it('returns [] for non-array input', () => {
    expect(normalizeAllowList(null)).toEqual([]);
    expect(normalizeAllowList('com.x' as unknown)).toEqual([]);
    expect(normalizeAllowList({ a: 1 } as unknown)).toEqual([]);
  });

  it('drops non-string and empty entries', () => {
    expect(normalizeAllowList([1, '', 'com.x', 'com.y'] as unknown[])).toEqual(['com.x', 'com.y']);
  });

  it('dedupes preserving order', () => {
    expect(normalizeAllowList(['com.y', 'com.x', 'com.x'])).toEqual(['com.y', 'com.x']);
  });
});

describe('normalizePerAppDelivery', () => {
  it('returns {} for non-object input', () => {
    expect(normalizePerAppDelivery(null)).toEqual({});
    expect(normalizePerAppDelivery(['a'] as unknown)).toEqual({});
  });

  it('drops unknown or non-string policy values', () => {
    expect(normalizePerAppDelivery({ 'com.x': 'immediate', 'com.y': 'wibble', 'com.z': 3 } as Record<string, unknown>)).toEqual({
      'com.x': 'immediate',
    });
  });

  it('keeps scheduled/digest/blocked as-is', () => {
    expect(
      normalizePerAppDelivery({ 'com.a': 'scheduled', 'com.b': 'digest', 'com.c': 'blocked' }),
    ).toEqual({ 'com.a': 'scheduled', 'com.b': 'digest', 'com.c': 'blocked' });
  });

  it('drops empty package-name keys', () => {
    expect(normalizePerAppDelivery({ '': 'blocked' })).toEqual({});
  });
});

describe('policyLabelFor', () => {
  it('defaults missing app to Immediate', () => {
    expect(policyLabelFor({}, 'com.x')).toBe('Immediate');
    expect(policyLabelFor(null, 'com.x')).toBe('Immediate');
  });

  it('returns the label of the stored policy', () => {
    expect(policyLabelFor({ 'com.x': 'blocked' }, 'com.x')).toBe('Blocked');
  });

  it('falls back to the built-in default label when nothing is configured', () => {
    expect(policyLabelFor({}, 'com.reddit.frontpage')).toBe('Digest');
    expect(policyLabelFor(null, 'com.reddit.frontpage')).toBe('Digest');
  });

  it('an explicit stored policy still overrides the built-in default label', () => {
    expect(policyLabelFor({ 'com.reddit.frontpage': 'blocked' }, 'com.reddit.frontpage')).toBe('Blocked');
  });
});

describe('DEFAULT_APP_DELIVERY', () => {
  it('only maps apps away from the implicit immediate fallback', () => {
    // WhatsApp/Telegram don't need an entry: absence already resolves to
    // 'immediate' (see resolvePolicy). An entry here would be redundant.
    expect(DEFAULT_APP_DELIVERY['com.whatsapp']).toBeUndefined();
    expect(DEFAULT_APP_DELIVERY['com.reddit.frontpage']).toBe('digest');
  });
});
