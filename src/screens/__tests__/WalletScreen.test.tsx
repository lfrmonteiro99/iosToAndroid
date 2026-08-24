import React from 'react';
import { render, fireEvent, waitFor, act } from '../../test-utils';
import { WalletScreen } from '../WalletScreen';
import { WalletProvider, useWallet } from '../../store/WalletStore';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

// WalletScreen renders through AllProviders (test-utils), which now includes
// WalletProvider, so useWallet() resolves. The store's isReady gate resolves
// asynchronously, so every render waits for it before asserting content.

describe('WalletScreen', () => {
  it('shows the empty state when there are no passes and isReady is true', async () => {
    const { getByText } = render(<WalletScreen />);
    await waitFor(() => expect(getByText('No Passes')).toBeTruthy());
    // The "Add Pass" affordance must be reachable from the empty state.
    expect(getByText('Add Pass')).toBeTruthy();
  });

  it('does NOT show the empty state before the store is ready (isReady gate)', async () => {
    // Render without awaiting readiness and confirm the empty-state copy is
    // absent until isReady flips — guards against regressing the gate that
    // the baseline SettingsStore bug depends on.
    const { queryByText } = render(<WalletScreen />);
    expect(queryByText('No Passes')).toBeNull();
  });

  it('adds a pass via the in-screen add flow and it appears in the list immediately', async () => {
    const { getByText, getByLabelText, getByPlaceholderText } = render(<WalletScreen />);
    await waitFor(() => expect(getByText('No Passes')).toBeTruthy());

    // Open the add sheet.
    fireEvent.press(getByLabelText('Add pass'));
    await waitFor(() => expect(getByText('New Pass')).toBeTruthy());

    // Fill the form (Title + Code are required to enable Add).
    fireEvent.changeText(getByPlaceholderText('Title'), 'TAP Lisbon-Porto');
    fireEvent.changeText(getByPlaceholderText('Code / value'), 'ABC123');

    // Save.
    fireEvent.press(getByLabelText('Save pass')); // the "Add" button in the sheet

    await waitFor(() => expect(getByText('TAP Lisbon-Porto')).toBeTruthy());
    // The empty state must be gone now that a pass exists.
    expect(queryEmptyState(getByText)).toBeNull();
  });

  it('does not save when required fields are blank (Add disabled until Title + Code)', async () => {
    const { getByLabelText, getByPlaceholderText, getByText, queryByText } = render(<WalletScreen />);
    await waitFor(() => expect(getByText('No Passes')).toBeTruthy());

    fireEvent.press(getByLabelText('Add pass'));
    await waitFor(() => expect(getByText('New Pass')).toBeTruthy());

    // Only title, no code -> still empty state, no list item.
    fireEvent.changeText(getByPlaceholderText('Title'), 'Incomplete');
    fireEvent.press(getByLabelText('Save pass'));

    await waitFor(() => expect(queryByText('Incomplete')).toBeNull());
    expect(getByText('No Passes')).toBeTruthy();
  });

  it('deletes a pass and the list returns to the empty state', async () => {
    // Seed one pass directly through the store, then render.
    let api: ReturnType<typeof useWallet> | null = null;
    function Probe() {
      api = useWallet();
      return null;
    }
    const { getByText, queryByText, unmount } = render(
      <WalletProvider>
        <Probe />
        <WalletScreen />
      </WalletProvider>,
    );
    await waitFor(() => expect(api).not.toBeNull());
    await act(async () => {
      api!.addPass({ type: 'ticket', title: 'ToDelete', code: 'X', color: '#000' });
    });

    await waitFor(() => expect(getByText('ToDelete')).toBeTruthy());

    // Open the add sheet is not where delete lives; the list still shows.
    // We delete via the store-bound action by re-rendering the probe and
    // calling deletePass, mirroring the on-screen delete intent.
    await act(async () => {
      api!.deletePass(api!.passes[0].id);
    });

    await waitFor(() => expect(getByText('No Passes')).toBeTruthy());
    expect(queryByText('ToDelete')).toBeNull();
    unmount();
  });

  it('persists the selected pass type through addPass', async () => {
    // Boarding is index 0; switch to Loyalty (index 2) and confirm the stored
    // pass carries the loyalty type.
    let api: ReturnType<typeof useWallet> | null = null;
    function Probe() {
      api = useWallet();
      return null;
    }
    const { getByText, getByLabelText, getByPlaceholderText } = render(
      <WalletProvider>
        <Probe />
        <WalletScreen />
      </WalletProvider>,
    );
    await waitFor(() => expect(api).not.toBeNull());
    await waitFor(() => expect(getByText('No Passes')).toBeTruthy());

    fireEvent.press(getByLabelText('Add pass'));
    await waitFor(() => expect(getByText('New Pass')).toBeTruthy());

    fireEvent.press(getByText('Loyalty')); // segmented control segment
    fireEvent.changeText(getByPlaceholderText('Title'), 'Café Card');
    fireEvent.changeText(getByPlaceholderText('Code / value'), 'Loyal-9');
    fireEvent.press(getByLabelText('Save pass'));

    await waitFor(() => expect(api!.passes[0].type).toBe('loyalty'));
    expect(api!.passes[0].title).toBe('Café Card');
  });

  it('navigates to CardDetail with the tapped pass id (#286)', async () => {
    let api: ReturnType<typeof useWallet> | null = null;
    function Probe() {
      api = useWallet();
      return null;
    }
    const { getByText } = render(
      <WalletProvider>
        <Probe />
        <WalletScreen />
      </WalletProvider>,
    );
    await waitFor(() => expect(api).not.toBeNull());
    await act(async () => {
      api!.addPass({ type: 'boarding', title: 'LIS-OPO', code: 'BP1', color: '#007AFF' });
    });
    await waitFor(() => expect(getByText('LIS-OPO')).toBeTruthy());

    fireEvent.press(getByText('LIS-OPO'));

    expect(mockNavigate).toHaveBeenCalledWith('CardDetail', { passId: api!.passes[0].id });
  });
});

// Local helper (avoids importing getAllByText/query formally).
function queryEmptyState(getByText: (t: string) => unknown): unknown {
  try {
    return getByText('No Passes');
  } catch {
    return null;
  }
}
