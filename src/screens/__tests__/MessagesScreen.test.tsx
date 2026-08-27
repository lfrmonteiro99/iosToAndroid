import React from 'react';
import { FlatList, PermissionsAndroid, Pressable, Text } from 'react-native';
import { act, render, fireEvent, waitFor } from '../../test-utils';
import LauncherModule from '../../../modules/launcher-module/src';
import { MessagesScreen, groupConversations } from '../MessagesScreen';
import { useSettings } from '../../store/SettingsStore';
import type { DeviceSms } from '../../store/DeviceStore';

function getEffectiveFontSize(element: { props: { style: unknown } }): number {
  const styles = Array.isArray(element.props.style) ? element.props.style : [element.props.style];
  let fontSize = 0;
  for (const s of styles) {
    if (s && typeof s === 'object' && 'fontSize' in (s as object)) {
      fontSize = (s as { fontSize: number }).fontSize;
    }
  }
  return fontSize;
}

function SetTextSize({ index }: { index: number }) {
  const { update } = useSettings();
  return (
    <Pressable testID="set-text-size" onPress={() => update('textSizeIndex', index)}>
      <Text>resize</Text>
    </Pressable>
  );
}

describe('MessagesScreen Dynamic Type', () => {
  it('Messages title fontSize scales with textSizeIndex (typography.largeTitle token)', () => {
    const { getByText, getByTestId } = render(
      <>
        <SetTextSize index={3} />
        <MessagesScreen />
      </>,
    );

    const defaultFontSize = getEffectiveFontSize(getByText('Messages'));

    fireEvent.press(getByTestId('set-text-size'));

    const scaledFontSize = getEffectiveFontSize(getByText('Messages'));
    expect(scaledFontSize).toBeGreaterThan(defaultFontSize);
  });
});

describe('MessagesScreen', () => {
  it('renders Messages title', () => {
    const { getByText } = render(<MessagesScreen />);
    expect(getByText('Messages')).toBeTruthy();
  });

  it('renders compose button', () => {
    const { getByLabelText } = render(<MessagesScreen />);
    expect(getByLabelText('Compose new message')).toBeTruthy();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<MessagesScreen />);
    expect(toJSON()).toBeTruthy();
  });
});

describe('groupConversations (#928 — group by normalized phone key)', () => {
  function sms(overrides: Partial<DeviceSms> & { date?: number }): DeviceSms {
    return {
      id: `id_${Math.random()}`,
      address: '',
      body: '',
      dateFormatted: '',
      type: 1,
      isRead: true,
      ...overrides,
    } as DeviceSms;
  }

  it('groups the same person written in three different phone formats into one conversation', () => {
    const messages = [
      sms({ address: '+351912345678', body: 'a', date: 1 }),
      sms({ address: '912345678', body: 'b', date: 2 }),
      sms({ address: '00351 912 345 678', body: 'c', date: 3 }),
    ];
    expect(groupConversations(messages)).toHaveLength(1);
  });

  it('uses the most recent message address as the canonical conversation address', () => {
    const messages = [
      sms({ address: '912345678', body: 'oldest', date: 1 }),
      sms({ address: '+351912345678', body: 'newest', date: 2 }),
    ];
    const [conv] = groupConversations(messages);
    expect(conv.address).toBe('+351912345678');
    expect(conv.lastMessage.body).toBe('newest');
  });

  it('keeps two distinct short codes as separate conversations', () => {
    const messages = [
      sms({ address: '12345', body: 'bank a', date: 1 }),
      sms({ address: '12346', body: 'bank b', date: 2 }),
    ];
    expect(groupConversations(messages)).toHaveLength(2);
  });

  it('groups empty/null addresses into a single "unknown" conversation, not one per message', () => {
    const messages = [
      sms({ address: '', body: 'x', date: 1 }),
      sms({ address: '', body: 'y', date: 2 }),
    ];
    expect(groupConversations(messages)).toHaveLength(1);
    expect(groupConversations(messages)[0].address).toBe('unknown');
  });
});

// ─── #926: the list is paged from the threads table ─────────────────────────
//
// The reported defect: "it doesn't show all the device's messages". The list
// was built by grouping the N newest messages of the whole provider, so a
// chatty thread buried every other conversation. These cover the screen's half
// of the fix — where its rows come from, and that reaching the end asks for
// more. The paging rules themselves are in useConversationPages' own tests.

const launcher = LauncherModule as unknown as { getConversations: jest.Mock; getRecentMessages: jest.Mock };

function threadRow(id: number, date: number, over: Record<string, unknown> = {}) {
  return {
    threadId: String(id),
    date,
    dateFormatted: 'Jan 1, 09:00',
    messageCount: 4,
    snippet: `snippet for thread ${id}`,
    isRead: true,
    addresses: [`+35191234567${id}`],
    address: `+35191234567${id}`,
    ...over,
  };
}

describe('MessagesScreen conversation paging (#926)', () => {
  beforeEach(() => {
    launcher.getConversations.mockReset();
    launcher.getConversations.mockResolvedValue([]);
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  });

  afterEach(() => {
    (PermissionsAndroid.check as unknown as jest.SpyInstance).mockRestore();
  });

  it('lists the threads the provider reports, even though the recent-message slice is empty', async () => {
    launcher.getConversations.mockResolvedValue([threadRow(1, 5000), threadRow(2, 4000)]);

    const { findByText } = render(<MessagesScreen />);

    expect(await findByText('snippet for thread 1')).toBeTruthy();
    expect(await findByText('snippet for thread 2')).toBeTruthy();
  });

  it('reaching the end of the list asks for the next page', async () => {
    const firstPage = Array.from({ length: 30 }, (_, i) => threadRow(i + 1, 900_000 - i * 1000));
    // Answered by cursor, like the provider does: null is the newest page.
    launcher.getConversations.mockImplementation((_limit: number, beforeDate: number | null) =>
      Promise.resolve(beforeDate == null ? firstPage : [threadRow(31, 800_000)]),
    );

    const { findByText, UNSAFE_getByType } = render(<MessagesScreen />);
    await findByText('snippet for thread 1');
    launcher.getConversations.mockClear();

    await act(async () => {
      UNSAFE_getByType(FlatList).props.onEndReached();
    });

    expect(launcher.getConversations).toHaveBeenCalledTimes(1);
    // The cursor is the oldest thread held, so the page is keyset, not offset.
    expect(launcher.getConversations.mock.calls[0][1]).toBe(900_000 - 29 * 1000);
    // Asserted on the list's data, not on rendered text: the 31st row is
    // outside what FlatList renders on a fresh mount.
    const data = UNSAFE_getByType(FlatList).props.data as { threadId?: string }[];
    expect(data).toHaveLength(31);
    expect(data[30].threadId).toBe('31');
  });

  it('does not page while a search is narrowing the list', async () => {
    const firstPage = Array.from({ length: 30 }, (_, i) => threadRow(i + 1, 900_000 - i * 1000));
    launcher.getConversations.mockResolvedValue(firstPage);

    const { findByText, getByPlaceholderText, UNSAFE_getByType } = render(<MessagesScreen />);
    await findByText('snippet for thread 1');

    fireEvent.changeText(getByPlaceholderText('Search'), 'thread 1');
    launcher.getConversations.mockClear();
    await act(async () => {
      UNSAFE_getByType(FlatList).props.onEndReached();
    });

    expect(launcher.getConversations).not.toHaveBeenCalled();
  });

  it('keeps a thread and a group with the same participant as two rows', async () => {
    launcher.getConversations.mockResolvedValue([
      threadRow(1, 5000, { snippet: 'one to one' }),
      // A group thread whose first recipient is the same person.
      threadRow(2, 4000, {
        snippet: 'the group',
        address: '+351912345671',
        addresses: ['+351912345671', '+351999999999'],
      }),
    ]);

    const { findByText } = render(<MessagesScreen />);

    expect(await findByText('one to one')).toBeTruthy();
    expect(await findByText('the group')).toBeTruthy();
  });

  it('falls back to grouping the recent messages when the threads query answers nothing', async () => {
    launcher.getConversations.mockResolvedValue([]);
    launcher.getRecentMessages.mockResolvedValueOnce([
      {
        id: 'm1',
        address: '+351912345678',
        body: 'from the recent slice',
        date: 5000,
        dateFormatted: 'Jan 1, 09:00',
        type: 1,
        isRead: true,
      },
    ]);

    const { findByText } = render(<MessagesScreen />);

    expect(await findByText('from the recent slice')).toBeTruthy();
  });

  it('shows the threads even before the permission check resolves', async () => {
    // A device that granted READ_SMS in a previous run: the list must fill from
    // the provider instead of waiting behind the check.
    let resolveCheck: (v: boolean) => void = () => {};
    (PermissionsAndroid.check as unknown as jest.Mock).mockImplementation(
      () => new Promise<boolean>((res) => { resolveCheck = res; }),
    );
    launcher.getConversations.mockResolvedValue([threadRow(1, 5000)]);

    const { findByText } = render(<MessagesScreen />);
    expect(await findByText('snippet for thread 1')).toBeTruthy();

    await act(async () => { resolveCheck(true); });
    await waitFor(() => expect(launcher.getConversations).toHaveBeenCalled());
  });
});
