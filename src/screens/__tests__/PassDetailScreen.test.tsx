import React, { useEffect, useRef } from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import { PassDetailScreen } from '../PassDetailScreen';
import { WalletProvider, useWallet, WalletPass } from '../../store/WalletStore';
import type { AppNavigationProp, AppRouteProp } from '../../navigation/types';

function makeNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
  } as unknown as AppNavigationProp;
}

function makeRoute(passId: string): AppRouteProp<'PassDetail'> {
  return {
    key: 'PassDetail-test',
    name: 'PassDetail',
    params: { passId },
  } as AppRouteProp<'PassDetail'>;
}

// The AsyncStorage mock in jest.setup.js always resolves getItem() to null,
// so passes only live in-memory for the lifetime of one WalletProvider tree.
// This harness seeds a pass through the real store and only mounts
// PassDetailScreen once that pass's id is known, keeping everything inside a
// single provider instance (mirrors the Probe pattern in WalletScreen.test.tsx).
function Harness({
  navigation,
  seed,
  onApi,
}: {
  navigation: AppNavigationProp;
  seed?: Partial<Omit<WalletPass, 'id' | 'createdAt'>>;
  onApi?: (api: ReturnType<typeof useWallet>) => void;
}) {
  const wallet = useWallet();
  onApi?.(wallet);
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    wallet.addPass({
      type: 'boarding',
      title: 'TAP LIS-OPO',
      subtitle: 'Gate 14',
      code: 'ABC123',
      color: '#007AFF',
      ...seed,
    });
    // Seed exactly once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (wallet.passes.length === 0) return null;
  return <PassDetailScreen navigation={navigation} route={makeRoute(wallet.passes[0].id)} />;
}

describe('PassDetailScreen', () => {
  it('renders title, subtitle and the pass code visual for an existing pass', async () => {
    const { getByText, getByTestId } = render(
      <WalletProvider>
        <Harness navigation={makeNavigation()} />
      </WalletProvider>,
    );

    await waitFor(() => expect(getByText('TAP LIS-OPO')).toBeTruthy());
    expect(getByText('Gate 14')).toBeTruthy();
    expect(getByTestId('pass-code-bar-0')).toBeTruthy();
  });

  it('does not render a subtitle element when the pass has none', async () => {
    const { getByText, queryByText } = render(
      <WalletProvider>
        <Harness navigation={makeNavigation()} seed={{ subtitle: undefined }} />
      </WalletProvider>,
    );

    await waitFor(() => expect(getByText('TAP LIS-OPO')).toBeTruthy());
    expect(queryByText('Gate 14')).toBeNull();
  });

  it('shows a not-found state for an unknown passId and does not crash', async () => {
    const { getByText, queryByText } = render(
      <PassDetailScreen navigation={makeNavigation()} route={makeRoute('does-not-exist')} />,
    );

    expect(getByText('Pass not found.')).toBeTruthy();
    expect(queryByText('Delete Pass')).toBeNull();
  });

  it('does not navigate away when the delete alert is only opened, not confirmed', async () => {
    const navigation = makeNavigation();
    let api: ReturnType<typeof useWallet> | null = null;
    const { getByText } = render(
      <WalletProvider>
        <Harness navigation={navigation} onApi={(a) => { api = a; }} />
      </WalletProvider>,
    );
    await waitFor(() => expect(getByText('TAP LIS-OPO')).toBeTruthy());

    fireEvent.press(getByText('Delete Pass'));

    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(api!.passes.length).toBe(1);
  });

  it('cancelling the delete alert keeps the pass and does not navigate', async () => {
    const navigation = makeNavigation();
    let api: ReturnType<typeof useWallet> | null = null;
    const { getByText, getAllByText } = render(
      <WalletProvider>
        <Harness navigation={navigation} onApi={(a) => { api = a; }} />
      </WalletProvider>,
    );
    await waitFor(() => expect(getByText('TAP LIS-OPO')).toBeTruthy());

    fireEvent.press(getByText('Delete Pass'));
    const cancel = getAllByText('Cancel');
    fireEvent.press(cancel[cancel.length - 1]);

    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(api!.passes.length).toBe(1);
    expect(getByText('TAP LIS-OPO')).toBeTruthy();
  });

  it('confirming the delete alert calls deletePass then navigation.goBack, removing the pass', async () => {
    const navigation = makeNavigation();
    let api: ReturnType<typeof useWallet> | null = null;
    const { getByText, getAllByText } = render(
      <WalletProvider>
        <Harness navigation={navigation} onApi={(a) => { api = a; }} />
      </WalletProvider>,
    );
    await waitFor(() => expect(getByText('TAP LIS-OPO')).toBeTruthy());

    fireEvent.press(getByText('Delete Pass'));
    const confirm = getAllByText('Delete');
    fireEvent.press(confirm[confirm.length - 1]);

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(api!.passes.length).toBe(0));
  });

  it('never renders an Edit affordance (out of scope for this issue)', async () => {
    const { getByText, queryByText } = render(
      <WalletProvider>
        <Harness navigation={makeNavigation()} />
      </WalletProvider>,
    );
    await waitFor(() => expect(getByText('TAP LIS-OPO')).toBeTruthy());

    expect(queryByText('Edit')).toBeNull();
  });
});
