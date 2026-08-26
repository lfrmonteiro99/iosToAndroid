import React from 'react';
import { FlatList, PermissionsAndroid } from 'react-native';
import { act } from '@testing-library/react-native';
import { render, fireEvent, waitFor } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConversationScreen } from '../ConversationScreen';
import { DeviceContext, type DeviceContextValue, type DeviceContact, type DeviceSms } from '../../store/DeviceStore';

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

// getLauncher() resolves modules/launcher-module/src via require() (jest's VM
// rejects dynamic import()), which goes through moduleNameMapper/jest.setup.js
// — NOT the same object as the direct __mocks__ require above (see
// jest-expo-inline-mock-shadows-manual-mocks). This is the one ConversationScreen
// actually calls.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const activeLauncher = require('../../../modules/launcher-module/src').default;

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
    // Red step (verified before committing): running this test against the pre-fix
    // ConversationScreen — inline Pressable+MessageBubble without React.memo(MessageRow) —
    // makes it fail: __getRenderCount() > 0 after keystrokes because FlatList re-renders
    // MessageRow and propagates to MessageBubble on every inputText state change.
    // With React.memo(MessageRow) the props are identical across keystrokes, so
    // MessageBubble is never invoked again. __getRenderCount() stays at 0.

    // One message for this thread, from the screen's own getMessagesForThread
    // call (#927) — no longer sourced from device.messages.
    activeLauncher.getMessagesForThread.mockResolvedValueOnce([
      { id: 'msg-001', address: '+15551234567', body: 'Test message hello', date: 1, dateFormatted: 'Today', type: 1, isRead: true },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bubbleMock = require('../MessageBubble') as { __getRenderCount: () => number; __resetRenderCount: () => void };
    bubbleMock.__resetRenderCount();

    const { getByPlaceholderText, findByText } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    // The message must be present in the list (MessageRow mounted with a real message).
    expect(await findByText('Test message hello')).toBeTruthy();

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

describe('ConversationScreen — per-thread paginated history (#927)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMemoryAsyncStorage();
  });

  it('shows this thread\'s own history beyond the 50-message global cap, not filtered from device.messages', async () => {
    // Simulate what the old getRecentMessages(50)-based filter produced:
    // 200 SMS across 5 conversations, only the 50 most recent survive
    // GLOBALLY. Our conversation (+15551234567) is the least recently
    // active, so almost none of its 40 messages would have made that cut.
    const ADDRESSES = ['+15551234567', '+15559990001', '+15559990002', '+15559990003', '+15559990004'];
    const allMessages: DeviceSms[] = [];
    ADDRESSES.forEach((addr, addrIdx) => {
      for (let i = 0; i < 40; i++) {
        // Target address (index 0) gets the OLDEST dates (1..40); the other
        // four get much newer, non-overlapping ranges — so the target loses
        // the global top-50-by-recency cut entirely.
        const date = addrIdx === 0 ? i + 1 : 100000 - addrIdx * 1000 - i;
        allMessages.push({
          id: `${addr}-${i}`, address: addr, body: `${addr} msg ${i}`,
          dateFormatted: 'Today', type: 1, isRead: true, date,
        } as unknown as DeviceSms);
      }
    });
    const globalTop50 = [...allMessages]
      .sort((a, b) => ((b as DeviceSms & { date?: number }).date ?? 0) - ((a as DeviceSms & { date?: number }).date ?? 0))
      .slice(0, 50);
    const targetInOldGlobalCap = globalTop50.filter((m) => m.address === '+15551234567');
    // Sanity on the fixture itself: the old global-cap bug would show fewer
    // than 10 of this thread's 40 messages.
    expect(targetInOldGlobalCap.length).toBeLessThan(10);

    const threadOwnMessages = allMessages
      .filter((m) => m.address === '+15551234567')
      .sort((a, b) => ((b as DeviceSms & { date?: number }).date ?? 0) - ((a as DeviceSms & { date?: number }).date ?? 0))
      .slice(0, 30);
    activeLauncher.getMessagesForThread.mockResolvedValueOnce(threadOwnMessages);

    const { findByText, UNSAFE_getByType } = render(
      <DeviceContext.Provider value={deviceCtxWith({ messages: globalTop50 })}>
        <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
      </DeviceContext.Provider>
    );

    await waitFor(() => {
      expect(activeLauncher.getMessagesForThread).toHaveBeenCalledWith('+15551234567', 30, null);
    });

    // The nearest-top message actually renders...
    expect(await findByText(threadOwnMessages[0].body)).toBeTruthy();
    // ...and all 30 reached the list's data (FlatList virtualization only
    // renders the first ~10 rows in this test environment, so the 30th row's
    // presence is asserted on the underlying data, like PhotosScreen.test.tsx).
    await waitFor(() => {
      const data = UNSAFE_getByType(FlatList).props.data as { body?: string }[];
      expect(data.some((d) => d.body === threadOwnMessages[29].body)).toBe(true);
    });
  });

  it('loads the previous page by beforeDate (keyset) when the list reaches the top, not by offset', async () => {
    const firstPage: DeviceSms[] = Array.from({ length: 30 }, (_, i) => ({
      id: `p1-${i}`, address: '+15551234567', body: `Page1 msg ${i}`,
      dateFormatted: 'Today', type: 1, isRead: true, date: 1000 - i,
    } as unknown as DeviceSms));
    const secondPage: DeviceSms[] = Array.from({ length: 5 }, (_, i) => ({
      id: `p2-${i}`, address: '+15551234567', body: `Page2 msg ${i}`,
      dateFormatted: 'Today', type: 1, isRead: true, date: 900 - i,
    } as unknown as DeviceSms));
    activeLauncher.getMessagesForThread
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);

    const { UNSAFE_getByType, findByText } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    await waitFor(() => {
      expect(activeLauncher.getMessagesForThread).toHaveBeenNthCalledWith(1, '+15551234567', 30, null);
    });
    expect(await findByText('Page1 msg 0')).toBeTruthy();

    await act(async () => {
      UNSAFE_getByType(FlatList).props.onEndReached();
    });

    // beforeDate is 971 — the LAST loaded message's own date (1000 - 29),
    // not a page number/offset. That's what makes it keyset pagination.
    await waitFor(() => {
      expect(activeLauncher.getMessagesForThread).toHaveBeenNthCalledWith(2, '+15551234567', 30, 971);
    });
    // FlatList virtualization only renders the first ~10 rows in this test
    // environment, so assert on the underlying data array (like
    // PhotosScreen.test.tsx's pagination tests) rather than getByText for
    // rows far down the list.
    await waitFor(() => {
      const data = UNSAFE_getByType(FlatList).props.data as { body?: string }[];
      expect(data.some((d) => d.body === 'Page2 msg 0')).toBe(true);
      // The first page's rows are still present too — an append, not a replace.
      expect(data.some((d) => d.body === 'Page1 msg 0')).toBe(true);
    });
  });

  it('ignores a second onEndReached fired before the first page-load settles (no duplicate fetch)', async () => {
    // A full page (30 == MESSAGES_PAGE_SIZE) so hasMoreMessages stays true —
    // otherwise loadOlderMessages short-circuits before ever calling native.
    const fullFirstPage: DeviceSms[] = Array.from({ length: 30 }, (_, i) => ({
      id: `first-${i}`, address: '+15551234567', body: `First page msg ${i}`,
      dateFormatted: 'Today', type: 1, isRead: true, date: 1000 - i,
    } as unknown as DeviceSms));
    let resolvePage: ((v: DeviceSms[]) => void) | undefined;
    activeLauncher.getMessagesForThread
      .mockResolvedValueOnce(fullFirstPage)
      .mockImplementationOnce(() => new Promise((resolve) => { resolvePage = resolve; }));

    const { UNSAFE_getByType, findByText } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );
    await findByText('First page msg 0');

    const list = UNSAFE_getByType(FlatList);
    await act(async () => {
      list.props.onEndReached();
      list.props.onEndReached(); // fired again before the first resolves
    });

    expect(activeLauncher.getMessagesForThread).toHaveBeenCalledTimes(2); // 1 first page + 1 older page, not 3
    await act(async () => {
      resolvePage?.([]);
    });
  });

  it('degrades to an empty thread with no crash when the native call fails (e.g. missing READ_SMS)', async () => {
    activeLauncher.getMessagesForThread.mockRejectedValueOnce(new Error('Permission denial: READ_SMS'));

    const { getByText, toJSON } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );

    await waitFor(() => expect(activeLauncher.getMessagesForThread).toHaveBeenCalled());

    expect(toJSON()).toBeTruthy();
    expect(getByText('No messages with this contact')).toBeTruthy();
    // No message-related alert was raised (unrelated background alerts from
    // other providers in the tree are out of scope for this assertion).
    expect(mockAlert.mock.calls.some(([title]) => /message/i.test(String(title)))).toBe(false);
  });

  it('does not update state after unmount when the thread response resolves late', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let resolvePage: ((v: DeviceSms[]) => void) | undefined;
    activeLauncher.getMessagesForThread.mockImplementationOnce(
      () => new Promise((resolve) => { resolvePage = resolve; }),
    );

    const { unmount } = render(
      <ConversationScreen navigation={mockNavigation as never} route={mockRoute as never} />
    );
    unmount();

    await act(async () => {
      resolvePage?.([{ id: 'late', address: '+15551234567', body: 'Late message', dateFormatted: 'Today', type: 1, isRead: true, date: 1 } as unknown as DeviceSms]);
      await Promise.resolve();
    });

    expect(errorSpy.mock.calls.some(([msg]) => String(msg).includes('unmounted component'))).toBe(false);
    errorSpy.mockRestore();
  });
});
