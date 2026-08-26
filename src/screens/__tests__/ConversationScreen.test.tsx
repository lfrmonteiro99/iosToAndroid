import React from 'react';
import { PermissionsAndroid } from 'react-native';
import { render, fireEvent, waitFor } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConversationScreen } from '../ConversationScreen';
import { DeviceContext, type DeviceContextValue, type DeviceContact } from '../../store/DeviceStore';

// useAlert() resolves to a no-op in AllProviders (test-utils does not mount
// AlertProvider), so alert() calls are invisible to assertions by default.
// Mock it here to capture what ConversationScreen tells the user.
const mockAlert = jest.fn();
jest.mock('../../components', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const actual = jest.requireActual('../../components');
  return { ...actual, useAlert: () => mockAlert };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const launcherMock = require('../../__mocks__/launcherModule').default;

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
const mockComposeRoute = { params: { address: '' } };

const CONTACTS: DeviceContact[] = [
  { id: 'c1', firstName: 'Ana', lastName: 'Silva', phone: '+351911111111' },
  { id: 'c2', firstName: 'Bruno', lastName: 'Costa', phone: '+351922222222' },
];

function deviceCtxWith(overrides: Partial<DeviceContextValue>): DeviceContextValue {
  return {
    messages: [],
    contacts: [],
    battery: { level: 0.72, isCharging: false },
    brightness: 0.5,
    volume: 0.5,
    wifi: { enabled: true, ssid: 'TestWifi', rssi: -50, linkSpeed: 0, ip: '192.168.1.100', networks: [] },
    wifiError: false,
    bluetooth: { enabled: true, name: 'TestDevice', address: '', pairedDevices: [] },
    bluetoothError: false,
    storage: { totalGB: '128', usedGB: '89', freeGB: '39', usedPercentage: 70 },
    storageError: false,
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
    autoBrightness: true,
    setAutoBrightness: jest.fn(() => Promise.resolve()),
    ...overrides,
  };
}

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

  it('shows the history when opened from a contact whose stored number is formatted differently than the message address (#928)', () => {
    // Route "address" arrives in the contact's stored format (+351911111111,
    // matching CONTACTS[0].phone); the SMS provider recorded the same person's
    // messages in the bare national format (911111111). Without normalized
    // comparison these never match, and the conversation opens empty even
    // though the messages exist — the symptom reported in #928.
    const differentFormatRoute = { params: { address: '+351911111111' } };
    const { getByText } = render(
      <DeviceContext.Provider
        value={deviceCtxWith({
          contacts: CONTACTS,
          messages: [
            { id: 'm1', address: '911111111', body: 'Ola from Ana', dateFormatted: 'Today', type: 1, isRead: true },
          ],
        })}
      >
        <ConversationScreen navigation={mockNavigation as never} route={differentFormatRoute as never} />
      </DeviceContext.Provider>
    );
    expect(getByText('Ola from Ana')).toBeTruthy();
  });

  it('does NOT show messages from an unrelated address that merely shares digits (no over-matching)', () => {
    const { queryByText } = render(
      <DeviceContext.Provider
        value={deviceCtxWith({
          messages: [
            { id: 'm2', address: '+1911111111', body: 'Different person entirely', dateFormatted: 'Today', type: 1, isRead: true },
          ],
        })}
      >
        <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
      </DeviceContext.Provider>
    );
    expect(queryByText('Different person entirely')).toBeNull();
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
      wifiError: false,
      bluetooth: { enabled: true, name: 'TestDevice', address: '', pairedDevices: [] },
      bluetoothError: false,
      storage: { totalGB: '128', usedGB: '89', freeGB: '39', usedPercentage: 70 },
      storageError: false,
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
      autoBrightness: true,
      setAutoBrightness: jest.fn(() => Promise.resolve()),
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

describe('ConversationScreen — failed send preserves text and draft (#930)', () => {
  it('keeps the typed message and the saved draft when the send is not confirmed', async () => {
    const store = setupMemoryAsyncStorage();
    const { getByPlaceholderText, getByLabelText } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    const messageBox = getByPlaceholderText('Message') as unknown as { props: { value: string } };
    fireEvent.changeText(messageBox, 'Hello there');

    // Let the debounced draft save (500ms, see handleInputChange) land before sending.
    await waitFor(() => {
      expect(store.get('@iostoandroid/draft_+15551234567')).toBe('Hello there');
    }, { timeout: 2000 });

    fireEvent.press(getByLabelText('Send message'));

    // getLauncher()'s dynamic import cannot execute in this Jest environment
    // (see the "sends to the chosen recipient" test above), so
    // sendSmsNative always resolves to `false` here — exactly the shape a
    // real unconfirmed/failed native sendSms now produces after #930
    // (previously the native side always resolved `true`, so this failure
    // path was unreachable from a real send). This proves the existing
    // ConversationScreen.tsx guard — clear input/draft only `if (success)`
    // — actually holds under a genuine failure, not just that it reads
    // correctly on paper.
    await waitFor(() => {
      expect(mockAlert.mock.calls.some(([title]) => title === 'Failed')).toBe(true);
    }, { timeout: 2000 });

    expect(messageBox.props.value).toBe('Hello there');
    expect(store.get('@iostoandroid/draft_+15551234567')).toBe('Hello there');
  });
});

describe('ConversationScreen — compose new message (#439)', () => {
  let checkSpy: jest.SpyInstance;

  beforeEach(() => {
    // Spies through to the real (mocked-native) implementation — just gives
    // us call-history assertions on top of the existing behaviour.
    checkSpy = jest.spyOn(PermissionsAndroid, 'check');
  });

  it('shows a recipient field when opened with no address', () => {
    const { getByLabelText, getByText } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockComposeRoute as never} />
    );
    expect(getByLabelText('Recipient')).toBeTruthy();
    expect(getByText('New Message')).toBeTruthy();
  });

  it('does NOT show a recipient field for an existing conversation (no regression)', () => {
    const { queryByLabelText, getByText } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );
    expect(queryByLabelText('Recipient')).toBeNull();
    expect(getByText('+15551234567')).toBeTruthy();
  });

  it('filters contact suggestions by typed name and selects one as the recipient', () => {
    const { getByLabelText, getByText, queryByLabelText, queryByText } = render(
      <DeviceContext.Provider value={deviceCtxWith({ contacts: CONTACTS })}>
        <ConversationScreen navigation={mockNavigation as never} route={mockComposeRoute as never} />
      </DeviceContext.Provider>
    );

    fireEvent.changeText(getByLabelText('Recipient'), 'ana');

    expect(getByText('Ana Silva')).toBeTruthy();
    expect(queryByText('Bruno Costa')).toBeNull();

    fireEvent.press(getByText('Ana Silva'));

    // Field disappears once a recipient is chosen, and the nav title updates.
    expect(queryByLabelText('Recipient')).toBeNull();
    expect(getByText('Ana Silva')).toBeTruthy();
  });

  it('accepts a typed phone number as the recipient on submit, without a matching contact', () => {
    const { getByLabelText, queryByLabelText, getByText } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockComposeRoute as never} />
    );

    const recipientField = getByLabelText('Recipient');
    fireEvent.changeText(recipientField, '+351933333333');
    fireEvent(recipientField, 'submitEditing');

    expect(queryByLabelText('Recipient')).toBeNull();
    expect(getByText('+351933333333')).toBeTruthy();
  });

  it('refuses to send without a recipient, with a message that does not blame permissions', async () => {
    const { getByPlaceholderText, getByLabelText } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockComposeRoute as never} />
    );

    fireEvent.changeText(getByPlaceholderText('Message'), 'Hello there');

    fireEvent.press(getByLabelText('Send message'));

    // waitFor (not a fixed microtask flush) so the assertion only passes once
    // the async handleSend chain has genuinely settled — a fixed flush can look
    // green just because it ran out of ticks before reaching the bridge call.
    // Filtered by title: AppsStore also calls useAlert() in this tree (an
    // unrelated "Could not load apps" background alert unmocked in this test
    // env), so a raw call-count assertion on the shared mock would be noise.
    await waitFor(() => {
      expect(mockAlert.mock.calls.some(([title]) => title === 'No Recipient')).toBe(true);
    }, { timeout: 2000 });

    expect(launcherMock.sendSms).not.toHaveBeenCalled();
    // The guard must short-circuit before the native SEND_SMS permission
    // negotiation even starts — a missing recipient isn't a permissions problem.
    expect(checkSpy).not.toHaveBeenCalled();
    const [, message] = mockAlert.mock.calls.find(([title]) => title === 'No Recipient')!;
    expect(String(message)).not.toMatch(/permission/i);
    expect(String(message)).not.toBe('Could not send message. Check permissions and try again.');
  });

  it('sends to the chosen recipient once one has been picked (compose → pick → send)', async () => {
    const { getByLabelText, getByText, getByPlaceholderText } = render(
      <DeviceContext.Provider value={deviceCtxWith({ contacts: CONTACTS })}>
        <ConversationScreen navigation={mockNavigation as never} route={mockComposeRoute as never} />
      </DeviceContext.Provider>
    );

    fireEvent.changeText(getByLabelText('Recipient'), 'bruno');
    fireEvent.press(getByText('Bruno Costa'));
    fireEvent.changeText(getByPlaceholderText('Message'), 'Hey Bruno');

    fireEvent.press(getByLabelText('Send message'));

    // Reaching the real SEND_SMS permission negotiation (a genuine, spy-able
    // side effect, unlike the native launcher bridge behind a dynamic import()
    // that this Jest environment cannot execute — see PR description) proves
    // the picked recipient cleared the "No Recipient" guard and the send
    // attempt proceeded, exactly as it does for a pre-existing conversation.
    await waitFor(() => {
      expect(checkSpy).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.SEND_SMS);
    }, { timeout: 2000 });

    expect(mockAlert.mock.calls.some(([title]) => title === 'No Recipient')).toBe(false);
  });
});
