import React from 'react';
import { PermissionsAndroid } from 'react-native';
import type { PermissionStatus } from 'react-native/Libraries/PermissionsAndroid/PermissionsAndroid';
import { act } from '@testing-library/react-native';
import { render, fireEvent } from '../../test-utils';
import { ConversationScreen } from '../ConversationScreen';
import { suppressAutoLock } from '../../utils/permissions';

// Proves App.tsx's auto-lock suppression engages while the native SEND_SMS
// permission dialog is up — the M11 defect: handleSend called
// PermissionsAndroid.request directly, bypassing withAutoLockSuppressed,
// even though the same file already wraps its camera/photo-library requests.
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };
const mockRoute = { params: { address: '+15551234567' } };

describe('ConversationScreen auto-lock suppression (M11)', () => {
  it('suppresses auto-lock while the SEND_SMS permission dialog is pending', async () => {
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    let resolveRequest: (v: PermissionStatus) => void;
    jest.spyOn(PermissionsAndroid, 'request').mockImplementation(
      () => new Promise((resolve) => { resolveRequest = resolve; }),
    );

    const { getByPlaceholderText, getByLabelText } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    fireEvent.changeText(getByPlaceholderText('Message'), 'Hi there');

    // handleSend awaits PermissionsAndroid.check() before it ever reaches the
    // withAutoLockSuppressed(...request...) call under test, so flush that
    // microtask before asserting suppression state.
    await act(async () => {
      fireEvent.press(getByLabelText('Send message'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(suppressAutoLock()).toBe(true);

    await act(async () => {
      resolveRequest(PermissionsAndroid.RESULTS.GRANTED);
    });

    expect(suppressAutoLock()).toBe(false);
  });
});
