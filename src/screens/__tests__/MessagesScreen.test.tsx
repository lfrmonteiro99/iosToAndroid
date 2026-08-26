import React from 'react';
import { Pressable, Text } from 'react-native';
import { render, fireEvent } from '../../test-utils';
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
