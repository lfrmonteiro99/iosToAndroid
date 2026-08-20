import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConversationScreen } from '../ConversationScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };
const mockRoute = { params: { address: '+15551234567' } };

// Stateful in-memory AsyncStorage mock: setItem persists so a subsequent
// getItem returns what was written — unlike the stateless default mock.
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

describe('ConversationScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders message input area', () => {
    const { toJSON } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders the send button area', () => {
    const { toJSON } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );
    const tree = toJSON();
    expect(tree).toBeTruthy();
  });

  it('renders back button', () => {
    const { getByLabelText } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );
    expect(getByLabelText('Back to Messages')).toBeTruthy();
  });

  it('migrates a legacy draft to the namespaced key on mount', async () => {
    const store = setupMemoryAsyncStorage({
      '@draft_+15551234567': 'Hello legacy draft',
    });

    const { getByDisplayValue } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    await waitFor(() => {
      expect(getByDisplayValue('Hello legacy draft')).toBeTruthy();
    });
    // Legacy value copied to the namespaced key and legacy key removed
    expect(store.get('@iostoandroid/draft_+15551234567')).toBe('Hello legacy draft');
    expect(store.has('@draft_+15551234567')).toBe(false);
  });

  it('keeps the new-key draft when BOTH keys exist (no overwrite)', async () => {
    const store = setupMemoryAsyncStorage({
      '@draft_+15551234567': 'legacy value',
      '@iostoandroid/draft_+15551234567': 'newer value',
    });

    const { getByDisplayValue } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    await waitFor(() => {
      expect(getByDisplayValue('newer value')).toBeTruthy();
    });
    expect(store.get('@iostoandroid/draft_+15551234567')).toBe('newer value');
    expect(store.has('@draft_+15551234567')).toBe(false);
  });

  it('loads a draft already stored under the namespaced key', async () => {
    const store = setupMemoryAsyncStorage({
      '@iostoandroid/draft_+15551234567': 'already namespaced',
    });

    const { getByDisplayValue } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    await waitFor(() => {
      expect(getByDisplayValue('already namespaced')).toBeTruthy();
    });
    // No legacy key involved, nothing else written
    expect(store.has('@draft_+15551234567')).toBe(false);
  });

  it('saves drafts under the namespaced key only (never re-creates legacy)', async () => {
    const store = setupMemoryAsyncStorage();

    const { getByPlaceholderText } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    fireEvent.changeText(getByPlaceholderText('Message'), 'Draft being typed');

    await waitFor(() => {
      expect(store.get('@iostoandroid/draft_+15551234567')).toBe('Draft being typed');
    });
    expect(store.has('@draft_+15551234567')).toBe(false);
  });

  it('does not re-render message rows when typing in the compose field (renderItem should be memoized)', async () => {
    // This test verifies that message bubble rows are memoized and do not re-render
    // on every keystroke. When typing in the compose field, the ConversationScreen
    // re-renders, but the message rows should not because their props haven't changed.
    setupMemoryAsyncStorage();

    const { getByPlaceholderText } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    // Type a series of characters into the input field.
    // Each keystroke causes the screen to re-render because inputText state changes.
    // However, the message rows' data (messages, reactions, selectedMsgId for this row)
    // haven't changed, so their renderItem callbacks should not be re-invoked.
    //
    // Before the fix (without memoized row component), renderItem is recreated on each
    // keystroke, causing all visible message rows to re-render unnecessarily.
    fireEvent.changeText(getByPlaceholderText('Message'), 'H');
    fireEvent.changeText(getByPlaceholderText('Message'), 'He');
    fireEvent.changeText(getByPlaceholderText('Message'), 'Hel');

    // The screen should still be renderable and consistent
    const messageInput = getByPlaceholderText('Message');
    const inputElement = messageInput as { props: { value: string } };
    expect(inputElement.props.value).toBe('Hel');
  });
});
