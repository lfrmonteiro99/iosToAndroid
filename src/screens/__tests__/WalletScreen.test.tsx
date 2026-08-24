import React from 'react';
import { render, waitFor, fireEvent, act } from '../../test-utils';
import { WalletScreen } from '../WalletScreen';
import { WalletProvider, useWallet } from '../../store/WalletStore';
import { useCard } from '../../store/CardStore';
import type { AppNavigationProp } from '../../navigation/types';

// WalletScreen renders through AllProviders (test-utils), which includes
// WalletProvider and CardProvider, so useWallet()/useCard() resolve. The
// stores' isReady gates resolve asynchronously, so every render waits for
// them before asserting content.
//
// Issue #281 replaces the issue-#280 inline add-sheet flow with navigation to
// a dedicated PassEditScreen — WalletScreen now requires a `navigation` prop
// and only dispatches navigate() calls; it owns no form state of its own.
// Issue #285 layers the Cards section and "Add Card" → CardEdit navigation
// on top of that same navigation-prop contract.

function makeNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
  } as unknown as AppNavigationProp;
}

describe('WalletScreen', () => {
  it('shows the empty state when there are no passes and isReady is true', async () => {
    const { getByText } = render(<WalletScreen navigation={makeNavigation()} />);
    await waitFor(() => expect(getByText('No Passes')).toBeTruthy());
    expect(getByText('Add Pass')).toBeTruthy();
  });

  it('does NOT show the empty state before the store is ready (isReady gate)', async () => {
    const { queryByText } = render(<WalletScreen navigation={makeNavigation()} />);
    expect(queryByText('No Passes')).toBeNull();
  });

  it('navigates to PassEdit with no passId when "Add" is tapped (create mode)', async () => {
    const navigation = makeNavigation();
    const { getByLabelText, getByText } = render(<WalletScreen navigation={navigation} />);
    await waitFor(() => expect(getByText('No Passes')).toBeTruthy());

    fireEvent.press(getByLabelText('Add pass'));

    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledWith('PassEdit', {});
  });

  it('navigates to PassScan when the "Scan" nav-bar action is tapped', async () => {
    const navigation = makeNavigation();
    const { getByLabelText, getByText } = render(<WalletScreen navigation={navigation} />);
    await waitFor(() => expect(getByText('No Passes')).toBeTruthy());

    fireEvent.press(getByLabelText('Scan pass'));

    expect(navigation.navigate).toHaveBeenCalledWith('PassScan');
  });

  it('navigates to PassEdit from the empty-state "Add Pass" action too', async () => {
    const navigation = makeNavigation();
    const { getByText } = render(<WalletScreen navigation={navigation} />);
    await waitFor(() => expect(getByText('No Passes')).toBeTruthy());

    fireEvent.press(getByText('Add Pass'));

    expect(navigation.navigate).toHaveBeenCalledWith('PassEdit', {});
  });

  it('navigates to PassEdit with the pass id when an existing row is tapped (edit mode)', async () => {
    let api: ReturnType<typeof useWallet> | null = null;
    function Probe() {
      api = useWallet();
      return null;
    }
    const navigation = makeNavigation();
    const { getByText } = render(
      <WalletProvider>
        <Probe />
        <WalletScreen navigation={navigation} />
      </WalletProvider>,
    );
    await waitFor(() => expect(api).not.toBeNull());
    await act(async () => {
      api!.addPass({ type: 'boarding', title: 'TAP Lisbon-Porto', code: 'ABC123', color: '#007AFF' });
    });

    await waitFor(() => expect(getByText('TAP Lisbon-Porto')).toBeTruthy());
    fireEvent.press(getByText('TAP Lisbon-Porto'));

    const id = api!.passes[0].id;
    expect(navigation.navigate).toHaveBeenCalledWith('PassEdit', { passId: id });
  });

  it('does not render the issue-280 inline add sheet anymore (no "New Pass" title in WalletScreen)', async () => {
    const navigation = makeNavigation();
    const { getByLabelText, queryByText, getByText } = render(<WalletScreen navigation={navigation} />);
    await waitFor(() => expect(getByText('No Passes')).toBeTruthy());

    fireEvent.press(getByLabelText('Add pass'));

    // The old inline sheet rendered "New Pass" as a header inside WalletScreen.
    // Now that affordance lives on PassEditScreen; WalletScreen must not open it.
    expect(queryByText('New Pass')).toBeNull();
  });

  it('shows a card in the Cards section with only label, brand, and masked last-4', async () => {
    let cardApi: ReturnType<typeof useCard> | null = null;
    function CardProbe() {
      cardApi = useCard();
      return null;
    }
    const navigation = makeNavigation();
    const { getByText, queryByText } = render(
      <>
        <CardProbe />
        <WalletScreen navigation={navigation} />
      </>,
    );
    await waitFor(() => expect(cardApi).not.toBeNull());
    await waitFor(() => expect(cardApi!.isReady).toBe(true));

    await act(async () => {
      cardApi!.addCard({
        label: 'Personal Visa',
        brand: 'visa',
        last4: '4242',
        expiryMonth: 12,
        expiryYear: 2030,
      });
    });

    await waitFor(() => expect(getByText('Personal Visa')).toBeTruthy());
    expect(getByText('Visa')).toBeTruthy();
    expect(getByText('•••• 4242')).toBeTruthy();
    // Never the full number, only the masked form.
    expect(queryByText('4242424242424242')).toBeNull();
  });

  it('does not render a "Cards" section header when there are no cards, even with passes present', async () => {
    let api: ReturnType<typeof useWallet> | null = null;
    function Probe() {
      api = useWallet();
      return null;
    }
    const navigation = makeNavigation();
    const { getByText, queryByText, getByLabelText } = render(
      <WalletProvider>
        <Probe />
        <WalletScreen navigation={navigation} />
      </WalletProvider>,
    );
    await waitFor(() => expect(api).not.toBeNull());
    await act(async () => {
      api!.addPass({ type: 'ticket', title: 'OnlyPass', code: 'X', color: '#000' });
    });

    await waitFor(() => expect(getByText('OnlyPass')).toBeTruthy());
    expect(queryByText('Cards')).toBeNull();
    // The "Add Card" affordance is still reachable even with zero cards.
    expect(getByLabelText('Add card')).toBeTruthy();
  });

  it('navigates to CardEdit when "Add Card" is pressed', async () => {
    // The "Add card" row only renders once the screen leaves the full empty
    // state, which requires at least one pass or card — seed a pass.
    let api: ReturnType<typeof useWallet> | null = null;
    function Probe() {
      api = useWallet();
      return null;
    }
    const navigation = makeNavigation();
    const { getByText, getByLabelText } = render(
      <WalletProvider>
        <Probe />
        <WalletScreen navigation={navigation} />
      </WalletProvider>,
    );
    await waitFor(() => expect(api).not.toBeNull());
    await act(async () => {
      api!.addPass({ type: 'ticket', title: 'Seed', code: 'X', color: '#000' });
    });
    await waitFor(() => expect(getByText('Seed')).toBeTruthy());

    fireEvent.press(getByLabelText('Add card'));

    expect(navigation.navigate).toHaveBeenCalledWith('CardEdit');
  });
});
