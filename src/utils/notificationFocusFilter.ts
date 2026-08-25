import type React from 'react';
import type { BannerNotification } from '../components/NotificationBanner';
import {
  routeNotification,
  type NotificationRouteContext,
} from './notificationAppRules';
import { captureBatched } from './notificationSummaryBuffer';

// Pure callback used by App.tsx's addNotificationListener to decide whether to
// show a banner. Exported here (not from App.tsx) so tests can import it without
// loading the full App module tree (which triggers native modules unavailable in Jest).
//
// `routing` aplica as regras por-app do issue #630 (allow-list imediata,
// Digest/Blocked, Reduce Interruptions). Quando omitido (código antigo / testes
// existentes), comporta-se como antes: só o Focus modo activo suprime.
export function notificationCallbackForFocus(
  n: { id: string; title?: string; text?: string; packageName?: string } | null | undefined,
  seenIds: React.MutableRefObject<Set<string>>,
  focusModeRef: React.MutableRefObject<string>,
  setBanner: (b: BannerNotification) => void,
  routing?: NotificationRouteContext,
): void {
  if (!n || seenIds.current.has(n.id)) return;

  const ctx: NotificationRouteContext = routing ?? { focusMode: focusModeRef.current };
  const decision = routeNotification(n, ctx);
  if (decision.action !== 'show') {
    // Scheduled Summary (issue #630, sub-issue 1): as apps com política
    // 'scheduled'/'digest' são suprimidas com reason 'batched' e acumuladas
    // para libertação num slot. 'blocked' e 'focus' continuam descartadas.
    if (decision.reason === 'batched') captureBatched(n, ctx);
    return;
  }

  if (seenIds.current.size > 200) {
    const first = seenIds.current.values().next().value;
    if (first) seenIds.current.delete(first);
  }
  seenIds.current.add(n.id);
  if (n.title || n.text) {
    setBanner({
      id: `notif-${n.id}`,
      appName: (n.packageName || '').split('.').pop() || 'App',
      iconName: 'notifications',
      iconColor: '#5856D6',
      title: n.title ?? '',
      body: n.text ?? '',
    });
  }
}
