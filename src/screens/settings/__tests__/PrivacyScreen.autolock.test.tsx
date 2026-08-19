import React from 'react';
import { act } from '@testing-library/react-native';
import { render, fireEvent, waitFor } from '../../../test-utils';
import { PrivacyScreen } from '../PrivacyScreen';
import { suppressAutoLock } from '../../../utils/permissions';
// Statically imported by PrivacyScreen.tsx, mapped by jest.config.js
// moduleNameMapper to src/__mocks__/launcherModule.js — same instance.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const LauncherModule = require('../../../../modules/launcher-module/src').default;

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

// Proves App.tsx's auto-lock suppression engages while the native module's
// batch requestAllPermissions() call (triggered by the "Request" button) is
// in flight — the M11 defect. PrivacyScreen.handleRequestPermissions called
// LauncherModule.requestAllPermissions() directly, bypassing
// withAutoLockSuppressed entirely.
describe('PrivacyScreen auto-lock suppression (M11)', () => {
  it('suppresses auto-lock while requestAllPermissions() is pending', async () => {
    (LauncherModule.checkPermissions as jest.Mock).mockResolvedValue({ camera: false });

    const { getByText } = render(<PrivacyScreen navigation={mockNavigation as never} />);

    await waitFor(() => expect(getByText('Request')).toBeTruthy());

    let resolveRequest: (v: boolean) => void;
    (LauncherModule.requestAllPermissions as jest.Mock).mockImplementation(
      () => new Promise((resolve) => { resolveRequest = resolve; }),
    );

    await act(async () => {
      fireEvent.press(getByText('Request'));
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
