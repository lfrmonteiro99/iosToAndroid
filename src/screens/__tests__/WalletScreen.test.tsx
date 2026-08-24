import React from 'react';
import { render, fireEvent, waitFor, act } from '../../test-utils';
import { WalletScreen } from '../WalletScreen';
import { WalletProvider, useWallet } from '../../store/WalletStore';
import { useCard } from '../../store/CardStore';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
    canGoBack: jest.fn(() => false),
    getParent: () => ({ navigate: jest.fn() }),
  }),
  useRoute: () => ({ params: {} }),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
}));

// WalletScreen renders through AllProviders (test-utils), which now includes
// WalletProvider and CardProvider, so useWallet()/useCard() resolve. The
// stores' isReady gates resolve asynchronously, so every render waits for
// them before asserting content.

describe('WalletScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

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

  it('shows a card in the Cards section with only label, brand, and masked last-4', async () => {
    let cardApi: ReturnType<typeof useCard> | null = null;
    function CardProbe() {
      cardApi = useCard();
      return null;
    }
    const { getByText, queryByText } = render(
      <>
        <CardProbe />
        <WalletScreen />
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
    const { getByText, queryByText, getByLabelText } = render(
      <WalletProvider>
        <Probe />
        <WalletScreen />
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
    const { getByText, getByLabelText } = render(
      <WalletProvider>
        <Probe />
        <WalletScreen />
      </WalletProvider>,
    );
    await waitFor(() => expect(api).not.toBeNull());
    await act(async () => {
      api!.addPass({ type: 'ticket', title: 'Seed', code: 'X', color: '#000' });
    });
    await waitFor(() => expect(getByText('Seed')).toBeTruthy());

    fireEvent.press(getByLabelText('Add card'));

    expect(mockNavigate).toHaveBeenCalledWith('CardEdit');
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
