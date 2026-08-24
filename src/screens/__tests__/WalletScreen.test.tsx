import React from 'react';
import { render, waitFor, fireEvent, act } from '../../test-utils';
import { WalletScreen } from '../WalletScreen';
import { WalletProvider, useWallet } from '../../store/WalletStore';
import type { AppNavigationProp } from '../../navigation/types';

// WalletScreen renders through AllProviders (test-utils), which includes
// WalletProvider, so useWallet() resolves. The store's isReady gate resolves
// asynchronously, so every render waits for it before asserting content.
//
// Issue #281 replaces the issue-#280 inline add-sheet flow with navigation to
// a dedicated PassEditScreen — WalletScreen now requires a `navigation` prop
// and only dispatches navigate() calls; it owns no form state of its own.

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
});
