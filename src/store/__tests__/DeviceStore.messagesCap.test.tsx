import React from 'react';
import { Text } from 'react-native';
import { render, waitFor } from '../../test-utils';
import { DeviceProvider, useDevice } from '../DeviceStore';

// Reported from a device: "it doesn't show all the device's messages".
//
// MessagesScreen groups this list into CONVERSATIONS, and it was capped at the
// 50 newest messages in the WHOLE provider — so a phone with a few hundred SMS
// only ever showed the conversations that happened to appear in those 50. #927
// fixed paging INSIDE a thread (getMessagesForThread); the list still asked for
// 50.
//
// The assertion is on the argument, not on a rendered count: what was wrong is
// how many messages the store asks the provider for, and that is a single
// number a test can pin. The shape is still imperfect — grouping N messages
// cannot enumerate conversations correctly at any N, since one chatty thread
// can bury every other, and the real fix is the conversations table — so this
// pins the cap rather than claiming the design is now right.

const launcherMock = jest.requireMock('../../../modules/launcher-module/src').default;

function Probe() {
  const { messages } = useDevice();
  return <Text>{`count:${messages.length}`}</Text>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DeviceStore conversation-list cap', () => {
  it('asks the provider for far more than the 50 that hid whole conversations', async () => {
    launcherMock.getRecentMessages.mockResolvedValue([]);
    render(
      <DeviceProvider>
        <Probe />
      </DeviceProvider>,
    );

    await waitFor(() => expect(launcherMock.getRecentMessages).toHaveBeenCalled());
    const [limit] = launcherMock.getRecentMessages.mock.calls[0];
    expect(limit).toBeGreaterThan(50);
  });

  it('surfaces every conversation present in the returned page', async () => {
    // 120 messages spread over 40 conversations is the shape that broke: under
    // a 50-message cap, two thirds of the threads simply were not there.
    const messages = Array.from({ length: 120 }, (_, i) => ({
      id: `m${i}`,
      address: `+35191234${String(i % 40).padStart(4, '0')}`,
      body: `msg ${i}`,
      date: 1_700_000_000_000 - i * 1000,
      type: 1,
      isRead: true,
    }));
    launcherMock.getRecentMessages.mockResolvedValue(messages);

    const { getByText } = render(
      <DeviceProvider>
        <Probe />
      </DeviceProvider>,
    );

    await waitFor(() => expect(getByText('count:120')).toBeTruthy());
  });

  it('still degrades to an empty list when the provider throws', async () => {
    // Unchanged, and worth keeping: no READ_SMS, or no provider at all, must
    // not take the store down.
    launcherMock.getRecentMessages.mockRejectedValue(new Error('SecurityException'));
    const { getByText } = render(
      <DeviceProvider>
        <Probe />
      </DeviceProvider>,
    );
    await waitFor(() => expect(getByText('count:0')).toBeTruthy());
  });
});
