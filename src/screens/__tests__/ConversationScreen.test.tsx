import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConversationScreen } from '../ConversationScreen';
import { DeviceContext, type DeviceContextValue } from '../../store/DeviceStore';

// Mock MessageBubble so we can count how many times it renders.
// ConversationScreen imports MessageBubble from ./MessageBubble; this mock
// intercepts that import and exposes a render counter for the memoization test.
jest.mock('../MessageBubble', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View, Text } = require('react-native') as typeof import('react-native');
  let renderCount = 0;
  const MockBubble = jest.fn(({ message }: { message: { body: string } }) => {
    renderCount++;
    return React.createElement(View, null, React.createElement(Text, null, message.body));
  });
  return {
    MessageBubble: MockBubble,
    REACTIONS: ['❤️', '👍', '👎', '😂', '‼️', '❓'],
    isLocalImageMessage: jest.fn(() => false),
    __getRenderCount: () => renderCount,
    __resetRenderCount: () => { renderCount = 0; },
  };
});

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

  it('does not re-render message rows when typing in the compose field (renderItem should be memoized)', () => {
    // Red step (verified before committing): running this test against the pre-fix
    // ConversationScreen — inline Pressable+MessageBubble without React.memo(MessageRow) —
    // makes it fail: __getRenderCount() > 0 after keystrokes because FlatList re-renders
    // MessageRow and propagates to MessageBubble on every inputText state change.
    // With React.memo(MessageRow) the props are identical across keystrokes, so
    // MessageBubble is never invoked again. __getRenderCount() stays at 0.

    // Inject one message for this conversation via DeviceContext.Provider.
    // The innermost provider wins over DeviceProvider inside AllProviders, so
    // ConversationScreen.useDevice() returns our controlled value immediately — no
    // async launcher loading needed, no timing uncertainty.
    const deviceCtxValue: DeviceContextValue = {
      messages: [{ id: 'msg-001', address: '+15551234567', body: 'Test message hello', dateFormatted: 'Today', type: 1, isRead: true }],
      contacts: [],
      battery: { level: 0.72, isCharging: false },
      brightness: 0.5,
      volume: 0.5,
      wifi: { enabled: true, ssid: 'TestWifi', rssi: -50, linkSpeed: 0, ip: '192.168.1.100', networks: [] },
      bluetooth: { enabled: true, name: 'TestDevice', address: '', pairedDevices: [] },
      storage: { totalGB: '128', usedGB: '89', freeGB: '39', usedPercentage: 70 },
      network: { isConnected: true, isWifi: true, isCellular: false },
      weather: { temp: 22, condition: 'Sunny', icon: 'sunny', city: 'Test City' },
      notificationAccessGranted: false,
      isReady: true,
      refresh: jest.fn(() => Promise.resolve()),
      setBrightness: jest.fn(() => Promise.resolve()),
      setVolume: jest.fn(() => Promise.resolve()),
      toggleWifi: jest.fn(() => Promise.resolve()),
      toggleBluetooth: jest.fn(() => Promise.resolve()),
      openSystemPanel: jest.fn(() => Promise.resolve()),
      requestContactsPermission: jest.fn(() => Promise.resolve(false)),
      requestSmsPermission: jest.fn(() => Promise.resolve(false)),
    };

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bubbleMock = require('../MessageBubble') as { __getRenderCount: () => number; __resetRenderCount: () => void };
    bubbleMock.__resetRenderCount();

    const { getByPlaceholderText, getByText } = render(
      <DeviceContext.Provider value={deviceCtxValue}>
        <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
      </DeviceContext.Provider>
    );

    // The message must be present in the list (MessageRow mounted with a real message).
    expect(getByText('Test message hello')).toBeTruthy();

    // Reset counter after initial mount so only keystroke re-renders count.
    bubbleMock.__resetRenderCount();

    // Three keystrokes change inputText state → ConversationScreen re-renders.
    // None of MessageRow's props change (message data, reactions, selectedMsgId, callbacks
    // are all stable across keystrokes), so React.memo(MessageRow) absorbs the re-renders.
    fireEvent.changeText(getByPlaceholderText('Message'), 'H');
    fireEvent.changeText(getByPlaceholderText('Message'), 'He');
    fireEvent.changeText(getByPlaceholderText('Message'), 'Hel');

    // MessageBubble must not have re-rendered after the keystrokes.
    expect(bubbleMock.__getRenderCount()).toBe(0);

    // Sanity: input value reflects the last keystroke.
    const input = getByPlaceholderText('Message') as unknown as { props: { value: string } };
    expect(input.props.value).toBe('Hel');
  });
});
