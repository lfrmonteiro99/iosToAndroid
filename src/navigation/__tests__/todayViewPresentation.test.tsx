import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { TodayViewScreen } from '../../screens/TodayViewScreen';
import type { AppNavigationProp } from '../../navigation/types';

// #712: "TodayView frame renders home screen instead of widget overlay".
//
// Root cause (src/screens/TodayViewScreen.tsx:665-712 + src/navigation/TabNavigator.tsx:153):
// TodayViewScreen was built as a TRANSLUCENT OVERLAY — styles.root is
// backgroundColor 'rgba(0,0,0,0.5)', there is a full-screen tap-to-dismiss
// backdrop (Pressable absoluteFill, accessibilityLabel="Dismiss"), a
// swipe-to-dismiss gesture, and a GlassSurface blur panel. But it is
// registered in TabNavigator.tsx as a regular *opaque* pushed Stack.Screen
// (`slide_from_left`, no presentation prop). Every sibling overlay with the
// same translucent-overlay contract — SpotlightSearch (line 151), Siri (line
// 152), ControlCenter (line 93), NotificationCenter (line 94), Multitask
// (line 95) — is registered with `presentation: 'transparentModal'`. A pushed
// (opaque) screen replaces the home instead of floating the translucent
// overlay on top of it, so the widget overlay never shows over the home.
//
// The fix is a one-line navigator registration: TodayView must be
// `presentation: 'transparentModal'` like its siblings.
//
// Test 1 below reads the REAL TabNavigator.tsx (the source the app ships, no
// copy) and asserts the TodayView screen is a transparent modal. This matches
// the static-analysis convention already used by routeReachability.test.tsx
// for navigator-level guarantees, and it is the property that actually broke.

const TAB_NAVIGATOR_PATH = path.join(__dirname, '..', 'TabNavigator.tsx');

function screenSource(name: string): string {
  const source = fs.readFileSync(TAB_NAVIGATOR_PATH, 'utf8');
  const marker = `<Stack.Screen name="${name}"`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Screen "${name}" not registered in TabNavigator.tsx`);
  // The screen's options object closes at the first '/>' after its opening tag.
  const end = source.indexOf('/>', start);
  return source.slice(start, end + 2);
}

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() } as unknown as AppNavigationProp;

describe('TodayView is registered as a translucent overlay (transparentModal) — #712', () => {
  it('registers TodayView with presentation: transparentModal', () => {
    const src = screenSource('TodayView');
    expect(src).toMatch(/presentation:\s*['"]transparentModal['"]/);
  });

  it('keeps TodayViewScreen itself rendering the overlay contract (backdrop + Dismiss)', () => {
    // Distinct from the navigator test: mounts the REAL screen and confirms the
    // overlay it draws is intact (translucent root + a tap-to-dismiss backdrop).
    // Protects what must NOT change while the navigator registration is fixed.
    const { getByLabelText } = render(<TodayViewScreen navigation={mockNavigation} />);
    const dismiss = getByLabelText('Dismiss');
    expect(dismiss).toBeTruthy();
    // Tapping Dismiss closes the overlay rather than navigating elsewhere.
    fireEvent.press(dismiss);
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('does NOT blanket-apply transparentModal to real app screens (Calculator stays opaque)', () => {
    // Inverse-of-fix guard: the change must be targeted at the overlay, not a
    // repo-wide switch. A genuine launched app screen must remain an opaque push.
    const src = screenSource('Calculator');
    expect(src).not.toMatch(/presentation:\s*['"]transparentModal['"]/);
  });
});
