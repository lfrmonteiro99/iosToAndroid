import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MailScreen } from '../MailScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

function setupMemoryAsyncStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
    store.has(key) ? store.get(key) : null,
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
    store.delete(key);
  });
  return store;
}

beforeEach(() => {
  jest.clearAllMocks();
  setupMemoryAsyncStorage();
});

describe('MailScreen', () => {
  it('renders Inbox title', () => {
    const { getByText } = render(
      <MailScreen navigation={mockNavigation as never} route={{ params: undefined }} />
    );
    expect(getByText(/Inbox/)).toBeTruthy();
  });

  it('valid email in composeTo route param prefills To field', async () => {
    const mockRoute = { params: { composeTo: 'test@example.com' } };
    const { getByDisplayValue } = render(
      <MailScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    await waitFor(() => {
      expect(getByDisplayValue('test@example.com')).toBeTruthy();
    });
  });

  it('invalid email in composeTo route param leaves To field empty', async () => {
    const mockRoute = { params: { composeTo: 'not-an-email' } };
    const { queryByDisplayValue, getByPlaceholderText } = render(
      <MailScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    // The To field should exist but be empty
    await waitFor(() => {
      const toField = getByPlaceholderText('To:');
      expect(toField).toBeTruthy();
      expect(toField.props.value).toBe('');
    });

    // Invalid email should NOT be prefilled
    expect(queryByDisplayValue('not-an-email')).toBeFalsy();
  });

  it('composeSubject route param prefills Subject field', async () => {
    const mockRoute = { params: { composeSubject: 'Test Subject' } };
    const { getByDisplayValue } = render(
      <MailScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    await waitFor(() => {
      expect(getByDisplayValue('Test Subject')).toBeTruthy();
    });
  });

  it('composeBody over MAX_BODY (100KB) is clamped to limit', async () => {
    const longBody = 'x'.repeat(200000); // 200KB
    const mockRoute = { params: { composeBody: longBody } };
    const { getByDisplayValue } = render(
      <MailScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    await waitFor(() => {
      // The body should be clamped to 100KB, not the full 200KB
      const bodyField = getByDisplayValue(/x{100000}/);
      expect(bodyField).toBeTruthy();
      expect(bodyField.props.value.length).toBeLessThanOrEqual(100000);
      expect(bodyField.props.value.length).toBeGreaterThan(99999);
    });
  });

  it('non-string composeSubject is ignored', async () => {
    const mockRoute = { params: { composeSubject: 123 } as never };
    const { getByPlaceholderText } = render(
      <MailScreen navigation={mockNavigation as never} route={mockRoute} />
    );

    await waitFor(() => {
      const subjectField = getByPlaceholderText('Subject:');
      expect(subjectField.props.value).toBe('');
    });
  });

  it('non-string composeBody is ignored', async () => {
    const mockRoute = { params: { composeBody: 123 } as never };
    const { getByPlaceholderText } = render(
      <MailScreen navigation={mockNavigation as never} route={mockRoute} />
    );

    await waitFor(() => {
      const bodyField = getByPlaceholderText('Write your email...');
      expect(bodyField.props.value).toBe('');
    });
  });

  it('compose sheet opens when valid params provided', async () => {
    const mockRoute = { params: { composeTo: 'valid@example.com' } };
    const { getByPlaceholderText } = render(
      <MailScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    // The compose modal should be visible and the To field should be accessible
    await waitFor(() => {
      expect(getByPlaceholderText('To:')).toBeTruthy();
    });
  });

  it('compose sheet opens when any params provided, even if invalid', async () => {
    // This tests the case where at least one param is provided (even if invalid)
    // The compose sheet should be visible so user can fix the data
    const mockRoute = { params: { composeTo: 'invalid-email', composeSubject: 'Hello' } };
    const { getByPlaceholderText } = render(
      <MailScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    // The compose modal should be visible
    await waitFor(() => {
      expect(getByPlaceholderText('To:')).toBeTruthy();
      const toField = getByPlaceholderText('To:');
      expect(toField.props.value).toBe(''); // Invalid email should not prefill
    });
  });

  it('all three validation constraints together', async () => {
    const longBody = 'y'.repeat(200000);
    const mockRoute = {
      params: {
        composeTo: 'user@example.com', // valid email
        composeSubject: 'Important',
        composeBody: longBody, // exceeds MAX_BODY
      },
    };
    const { getByDisplayValue, getByPlaceholderText } = render(
      <MailScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    await waitFor(() => {
      // Valid email should be prefilled
      expect(getByDisplayValue('user@example.com')).toBeTruthy();
      // Subject should be prefilled
      expect(getByDisplayValue('Important')).toBeTruthy();
      // Body should be clamped, not full 200KB
      const bodyField = getByPlaceholderText('Write your email...');
      expect(bodyField.props.value.length).toBeLessThanOrEqual(100000);
    });
  });

  it('handleSend allows sending email with valid recipient address', async () => {
    const store = setupMemoryAsyncStorage();
    // Use route params to open compose with valid data
    const mockRoute = { params: { composeTo: 'valid@example.com', composeSubject: 'Subject', composeBody: 'Message body' } };
    const { getByText } = render(
      <MailScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    // Send
    const sendButton = getByText('Send');
    fireEvent.press(sendButton);

    // The message should be saved to storage
    await waitFor(() => {
      const sent = store.get('@iostoandroid/mail_sent');
      expect(sent).toBeTruthy();
      const sentList = JSON.parse(sent!);
      expect(sentList.length).toBeGreaterThan(0);
      expect(sentList[0].to).toBe('valid@example.com');
      expect(sentList[0].subject).toBe('Subject');
    });
  });

  /**
   * CRITICAL TEST: Validates that handleSend rejects invalid email addresses.
   * Red step (without EMAIL_RE guard in handleSend): this test must FAIL.
   * - Manually types an invalid email into the To field via fireEvent.changeText
   * - Presses Send
   * - Verifies that AsyncStorage.setItem was NOT called (email not stored)
   */
  it('handleSend prevents sending email when user types invalid email', async () => {
    const store = setupMemoryAsyncStorage();
    // Open compose modal with a valid email to start
    const mockRoute = { params: { composeTo: 'initial@example.com', composeSubject: 'Test' } };
    const { getByPlaceholderText, getByText } = render(
      <MailScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    // Wait for compose modal to be visible
    await waitFor(() => {
      expect(getByPlaceholderText('To:')).toBeTruthy();
    });

    // Manually REPLACE the valid email with an invalid one
    const toField = getByPlaceholderText('To:');
    fireEvent.changeText(toField, 'not-an-email');

    // Verify the field was updated (sanity check)
    expect(toField.props.value).toBe('not-an-email');

    // Try to send with invalid email
    const sendButton = getByText('Send');
    fireEvent.press(sendButton);

    // Wait a bit for async operations
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify that email was NOT stored due to EMAIL_RE validation
    const sent = store.get('@iostoandroid/mail_sent');
    expect(sent).toBeFalsy(); // Invalid email should prevent send
  });

  /**
   * CRITICAL TEST: Validates that handleSend caps body length before storing.
   * Red step (without composeBody.slice in handleSend): this test must FAIL.
   * - Opens compose modal via route params
   * - Manually types >100KB of text into the body field via fireEvent.changeText
   *   (this bypasses the prefill cap and tests the handleSend cap)
   * - Presses Send
   * - Verifies the stored body is <= 100KB characters
   */
  it('handleSend caps body length at MAX_BODY before storing (validates in handleSend)', async () => {
    const store = setupMemoryAsyncStorage();
    // Open compose modal by passing a route param
    const mockRoute = { params: { composeTo: 'test@example.com' } };
    const { getByPlaceholderText, getByText } = render(
      <MailScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    // Wait for compose modal to be visible
    await waitFor(() => {
      expect(getByPlaceholderText('To:')).toBeTruthy();
    });

    // Manually type subject
    const subjectField = getByPlaceholderText('Subject:');
    fireEvent.changeText(subjectField, 'Subject');

    // Manually type a VERY long body (150KB of text)
    // This bypasses the prefill cap and tests handleSend's cap
    const longBody = 'x'.repeat(150000);
    const bodyField = getByPlaceholderText('Write your email...');
    fireEvent.changeText(bodyField, longBody);

    // Send
    const sendButton = getByText('Send');
    fireEvent.press(sendButton);

    // Verify that the stored body was capped to MAX_BODY (100KB)
    await waitFor(() => {
      const sent = store.get('@iostoandroid/mail_sent');
      expect(sent).toBeTruthy();
      const sentList = JSON.parse(sent!);
      expect(sentList.length).toBeGreaterThan(0);
      // Body should be capped at 100000 chars, NOT the full 150000 we typed
      expect(sentList[0].body.length).toBeLessThanOrEqual(100000);
      expect(sentList[0].body.length).toBeGreaterThan(99999);
    }, { timeout: 1000 });
  });
});
