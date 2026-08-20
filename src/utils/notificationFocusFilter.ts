import type React from 'react';
import type { BannerNotification } from '../components/NotificationBanner';

// Pure callback used by App.tsx's addNotificationListener to decide whether to
// show a banner. Exported here (not from App.tsx) so tests can import it without
// loading the full App module tree (which triggers native modules unavailable in Jest).
export function notificationCallbackForFocus(
  n: { id: string; title?: string; text?: string; packageName?: string } | null | undefined,
  seenIds: React.MutableRefObject<Set<string>>,
  focusModeRef: React.MutableRefObject<string>,
  setBanner: (b: BannerNotification) => void,
): void {
  if (!n || seenIds.current.has(n.id)) return;
  if (focusModeRef.current && focusModeRef.current !== 'off') return;
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
