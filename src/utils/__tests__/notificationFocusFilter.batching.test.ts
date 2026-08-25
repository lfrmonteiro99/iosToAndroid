import type React from 'react';
import { notificationCallbackForFocus } from '../notificationFocusFilter';
import type { NotificationRouteContext } from '../notificationAppRules';

// Wiring test for issue #868: apps whose delivery policy is 'scheduled'/'digest'
// route to routeNotification's reason:'batched' (issue #630), and until now
// notificationCallbackForFocus silently dropped them. This suite proves the
// callback now hands them to captureBatched instead of discarding them.

function makeRefs(focusMode = 'off') {
  return {
    seenIds: { current: new Set<string>() } as React.MutableRefObject<Set<string>>,
    focusModeRef: { current: focusMode } as React.MutableRefObject<string>,
  };
}

const testNotif = { id: 'n1', title: 'Digest', text: 'Weekly roundup', packageName: 'com.news.app' };

describe('notificationCallbackForFocus — captureBatched wiring (issue #868)', () => {
  it('calls captureBatched (not setBanner) when routing decides "batched"', () => {
    const { seenIds, focusModeRef } = makeRefs();
    const setBanner = jest.fn();
    const captureBatched = jest.fn();
    const ctx: NotificationRouteContext = {
      focusMode: 'off',
      perAppDelivery: { 'com.news.app': 'scheduled' },
    };

    notificationCallbackForFocus(testNotif, seenIds, focusModeRef, setBanner, ctx, captureBatched);

    expect(captureBatched).toHaveBeenCalledWith(testNotif);
    expect(setBanner).not.toHaveBeenCalled();
  });

  it('does not call captureBatched for a suppression that is not "batched" (e.g. blocked)', () => {
    const { seenIds, focusModeRef } = makeRefs();
    const setBanner = jest.fn();
    const captureBatched = jest.fn();
    const ctx: NotificationRouteContext = {
      focusMode: 'off',
      perAppDelivery: { 'com.news.app': 'blocked' },
    };

    notificationCallbackForFocus(testNotif, seenIds, focusModeRef, setBanner, ctx, captureBatched);

    expect(captureBatched).not.toHaveBeenCalled();
    expect(setBanner).not.toHaveBeenCalled();
  });

  it('does not call captureBatched for a normal delivered notification', () => {
    const { seenIds, focusModeRef } = makeRefs();
    const setBanner = jest.fn();
    const captureBatched = jest.fn();
    const ctx: NotificationRouteContext = { focusMode: 'off' };

    notificationCallbackForFocus(testNotif, seenIds, focusModeRef, setBanner, ctx, captureBatched);

    expect(captureBatched).not.toHaveBeenCalled();
    expect(setBanner).toHaveBeenCalled();
  });

  it('stays a no-op (no throw) when captureBatched is omitted, preserving old callers', () => {
    const { seenIds, focusModeRef } = makeRefs();
    const setBanner = jest.fn();
    const ctx: NotificationRouteContext = {
      focusMode: 'off',
      perAppDelivery: { 'com.news.app': 'digest' },
    };

    expect(() =>
      notificationCallbackForFocus(testNotif, seenIds, focusModeRef, setBanner, ctx),
    ).not.toThrow();
    expect(setBanner).not.toHaveBeenCalled();
  });
});
