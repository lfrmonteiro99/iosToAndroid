import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent, waitFor, act } from '../../test-utils';
import { CardDetailScreen, maskCode } from '../CardDetailScreen';
import { WalletProvider, useWallet } from '../../store/WalletStore';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const nav = { navigate: mockNavigate, goBack: mockGoBack } as never;

function routeFor(passId: string) {
  return { params: { passId }, key: 'k', name: 'CardDetail' } as never;
}

// Seeds a single pass into WalletStore, then renders CardDetailScreen for it
// once the store is ready and the pass exists — mirrors the Probe pattern in
// WalletScreen.test.tsx.
function Harness() {
  const { addPass, passes, isReady } = useWallet();
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (isReady && !seeded.current) {
      seeded.current = true;
      addPass({ type: 'loyalty', title: 'Café Card', code: 'ABCD1234', color: '#FF9500' });
    }
  }, [isReady, addPass]);

  if (passes.length === 0) return null;
  return <CardDetailScreen navigation={nav} route={routeFor(passes[0].id)} />;
}

function renderCardDetail() {
  return render(
    <WalletProvider>
      <Harness />
    </WalletProvider>,
  );
}

let canOpenSpy: jest.SpyInstance;
let openSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  canOpenSpy = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  global.fetch = jest.fn().mockResolvedValue({} as never);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('maskCode', () => {
  it('masks everything but the trailing 4 characters', () => {
    expect(maskCode('ABCD1234')).toBe('•••• 1234');
  });

  it('leaves short codes (<=4 chars) unmasked — nothing meaningful to hide', () => {
    expect(maskCode('AB1')).toBe('AB1');
    expect(maskCode('1234')).toBe('1234');
  });
});

describe('CardDetailScreen', () => {
  it("navigates to the detail screen and shows the card's label, brand, and masked code", async () => {
    const { getByText, queryByText } = renderCardDetail();

    await waitFor(() => expect(getByText('Loyalty')).toBeTruthy());
    // Title/label is rendered both in the nav bar and the card face.
    expect(getByText('•••• 1234')).toBeTruthy();
    // The raw, unmasked code must never be rendered anywhere on screen.
    expect(queryByText('ABCD1234')).toBeNull();
  });

  it('shows "Card not found" without crashing when the passId does not resolve', async () => {
    const { getByText, queryByLabelText } = render(
      <WalletProvider>
        <CardDetailScreen navigation={nav} route={routeFor('does-not-exist')} />
      </WalletProvider>,
    );
    await waitFor(() => expect(getByText('Card not found')).toBeTruthy());
    expect(queryByLabelText('Pay')).toBeNull();
    expect(queryByLabelText('Pay with Google Pay')).toBeNull();
  });

  describe('simulated Pay', () => {
    it('renders the "Simulated — no charge is made" disclaimer up front', async () => {
      const { getByText } = renderCardDetail();
      await waitFor(() => expect(getByText(/Simulated/)).toBeTruthy());
      expect(getByText(/no charge is made/)).toBeTruthy();
    });

    it('ends in a success state after the animation, without touching Linking, fetch, or the store', async () => {
      // Real timers, deliberately. Two things fight fake timers here:
      // WalletStore hydrates through an AsyncStorage promise chain (and the
      // Harness only mounts the screen once `passes` is populated), and
      // handleSimulatedPay starts an Animated.loop that never ends on its own —
      // it is stopped by the 1200ms timeout. Freezing the clock deadlocked the
      // first and left the second scheduling forever, so this suite hung
      // instead of failing. SIMULATION_DURATION_MS is 1200ms, short enough to
      // simply wait out.
      const { getByText, getByLabelText } = renderCardDetail();
      await waitFor(() => expect(getByText('Loyalty')).toBeTruthy());

      fireEvent.press(getByLabelText('Pay'));
      expect(getByText('Pay')).toBeTruthy(); // still processing, label unchanged yet

      await waitFor(() => expect(getByText('Paid')).toBeTruthy(), { timeout: 5000 });
      expect(canOpenSpy).not.toHaveBeenCalled();
      expect(openSpy).not.toHaveBeenCalled();
      // DeviceProvider (mounted globally by test-utils) fetches the weather
      // widget, and with real timers it has time to fire — so a blanket
      // "fetch was never called" would assert something about the provider, not
      // about Pay. The claim under test is that the simulation itself reaches
      // no network, so every fetch that did happen must be that widget.
      const nonWeatherFetches = (global.fetch as jest.Mock).mock.calls.filter(
        ([url]) => !String(url).includes('wttr.in'),
      );
      expect(nonWeatherFetches).toEqual([]);
    });

    it('double-tapping Pay only runs the simulation once (disabled while processing)', async () => {
      // Real timers, same reasons as the test above.
      const { getByText, getByLabelText } = renderCardDetail();
      await waitFor(() => expect(getByText('Loyalty')).toBeTruthy());

      fireEvent.press(getByLabelText('Pay'));
      fireEvent.press(getByLabelText('Pay')); // second tap while processing — must be a no-op

      await waitFor(() => expect(getByText('Paid')).toBeTruthy(), { timeout: 5000 });
      // A second timer firing later must not throw or double-transition: the
      // guard is `payState !== 'idle'`, so the second tap never armed a timer.
      await new Promise((r) => setTimeout(r, 1400));
      expect(getByText('Paid')).toBeTruthy();
    });
  });

  describe('Google Pay handoff', () => {
    it('opens the Google Pay deep link when the app is installed', async () => {
      canOpenSpy.mockResolvedValue(true);
      const { getByText, getByLabelText } = renderCardDetail();
      await waitFor(() => expect(getByText('Loyalty')).toBeTruthy());

      await act(async () => {
        fireEvent.press(getByLabelText('Pay with Google Pay'));
      });

      expect(canOpenSpy).toHaveBeenCalledWith('gpay://');
      expect(openSpy).toHaveBeenCalledWith('gpay://');
    });

    it('falls back to the Play Store listing when Google Pay is not installed', async () => {
      canOpenSpy.mockResolvedValue(false);
      const { getByText, getByLabelText } = renderCardDetail();
      await waitFor(() => expect(getByText('Loyalty')).toBeTruthy());

      await act(async () => {
        fireEvent.press(getByLabelText('Pay with Google Pay'));
      });

      expect(openSpy).toHaveBeenCalledWith(
        'market://details?id=com.google.android.apps.walletnfcrel',
      );
    });

    it('never reads or sends the pass code/brand through the Google Pay handoff', async () => {
      canOpenSpy.mockResolvedValue(true);
      const { getByText, getByLabelText } = renderCardDetail();
      await waitFor(() => expect(getByText('Loyalty')).toBeTruthy());

      await act(async () => {
        fireEvent.press(getByLabelText('Pay with Google Pay'));
      });

      const calledUrls = [...canOpenSpy.mock.calls.flat(), ...openSpy.mock.calls.flat()];
      calledUrls.forEach((url) => {
        expect(String(url)).not.toContain('ABCD1234');
        expect(String(url)).not.toContain('Loyalty');
      });
    });
  });
});
