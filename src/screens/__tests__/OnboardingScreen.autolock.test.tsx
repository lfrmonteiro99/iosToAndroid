import React from 'react';
import { act } from '@testing-library/react-native';
import { render, fireEvent } from '../../test-utils';
import { OnboardingScreen } from '../OnboardingScreen';
import { suppressAutoLock } from '../../utils/permissions';
// Mapped by jest.config.js moduleNameMapper to src/__mocks__/launcherModule.js —
// the same module instance OnboardingScreen's dynamic import resolves to.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const LauncherModule = require('../../../modules/launcher-module/src').default;

// Proves App.tsx's auto-lock suppression engages while the native module's
// batch requestAllPermissions() call is in flight — the exact "nested
// prompts (Camera + Microphone + Storage one after the other)" scenario
// called out by the M11 issue. OnboardingScreen.handleGrantPermissions
// called mod.requestAllPermissions() directly, bypassing
// withAutoLockSuppressed entirely.
describe('OnboardingScreen auto-lock suppression (M11)', () => {
  it('suppresses auto-lock while requestAllPermissions() is pending on the Permissions page', async () => {
    let resolveRequest: (v: boolean) => void;
    (LauncherModule.requestAllPermissions as jest.Mock).mockImplementation(
      () => new Promise((resolve) => { resolveRequest = resolve; }),
    );

    const { getByText } = render(<OnboardingScreen onDone={jest.fn()} />);
    await act(async () => { fireEvent.press(getByText('Get Started')); });

    await act(async () => {
      fireEvent.press(getByText('Grant Permissions'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(suppressAutoLock()).toBe(true);

    await act(async () => {
      resolveRequest(true);
    });

    expect(suppressAutoLock()).toBe(false);
  });
});
