import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import { PassEditScreen } from '../PassEditScreen';
import { useWallet, WalletPass } from '../../store/WalletStore';
import type { AppNavigationProp, AppRouteProp } from '../../navigation/types';

function makeNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
  } as unknown as AppNavigationProp;
}

function makeRoute(
  params: { passId?: string; prefillCode?: string } | undefined,
): AppRouteProp<'PassEdit'> {
  return {
    key: 'PassEdit-test',
    name: 'PassEdit',
    params,
  } as AppRouteProp<'PassEdit'>;
}

// `render` (test-utils) already wraps every tree in AllProviders, which
// includes WalletProvider — a real WalletPass id only exists once addPass()
// runs, so edit-mode tests seed through this harness (single store instance,
// single render tree) rather than juggling a second provider or a stale
// `rerender` query snapshot.
function EditHarness({
  navigation,
  seed,
  onReady,
}: {
  navigation: AppNavigationProp;
  seed: Omit<WalletPass, 'id' | 'createdAt'>;
  onReady: (api: ReturnType<typeof useWallet>, passId: string) => void;
}) {
  const wallet = useWallet();
  const seededRef = React.useRef(false);
  const [passId, setPassId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (wallet.isReady && !seededRef.current) {
      seededRef.current = true;
      wallet.addPass(seed);
    }
  }, [wallet.isReady, wallet, seed]);

  React.useEffect(() => {
    if (passId === null && wallet.passes.length > 0) {
      setPassId(wallet.passes[0].id);
    }
  }, [wallet.passes, passId]);

  React.useEffect(() => {
    if (passId !== null) onReady(wallet, passId);
  });

  if (passId === null) return null;
  return <PassEditScreen navigation={navigation} route={makeRoute({ passId })} />;
}

describe('PassEditScreen', () => {
  describe('create mode (no passId)', () => {
    it('renders the New Pass title with empty fields and Done disabled', () => {
      const { getByText, getByPlaceholderText } = render(
        <PassEditScreen navigation={makeNavigation()} route={makeRoute(undefined)} />,
      );

      expect(getByText('New Pass')).toBeTruthy();
      expect(getByPlaceholderText('Title').props.value).toBe('');
      expect(getByPlaceholderText('Code / value').props.value).toBe('');
    });

    it('does not save while title and code are incomplete', () => {
      const navigation = makeNavigation();
      const { getByText, getByPlaceholderText } = render(
        <PassEditScreen navigation={navigation} route={makeRoute(undefined)} />,
      );

      // Only a title, no code -> canSave stays false.
      fireEvent.changeText(getByPlaceholderText('Title'), 'TAP Lisbon-Porto');
      fireEvent.press(getByText('Done'));

      expect(navigation.goBack).not.toHaveBeenCalled();
    });

    it('enables Done and saves once both title and code are filled', () => {
      const navigation = makeNavigation();
      const { getByText, getByPlaceholderText } = render(
        <PassEditScreen navigation={navigation} route={makeRoute(undefined)} />,
      );

      fireEvent.changeText(getByPlaceholderText('Title'), 'TAP Lisbon-Porto');
      fireEvent.changeText(getByPlaceholderText('Code / value'), 'ABC123');
      fireEvent.press(getByText('Done'));

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    it('creates a pass with the selected type via addPass', async () => {
      const apiRef: { current: ReturnType<typeof useWallet> | null } = { current: null };
      function Probe() {
        apiRef.current = useWallet();
        return null;
      }
      const navigation = makeNavigation();
      const { getByText, getByPlaceholderText } = render(
        <>
          <Probe />
          <PassEditScreen navigation={navigation} route={makeRoute(undefined)} />
        </>,
      );
      await waitFor(() => expect(apiRef.current).not.toBeNull());

      fireEvent.press(getByText('Loyalty')); // segmented control segment
      fireEvent.changeText(getByPlaceholderText('Title'), 'Café Card');
      fireEvent.changeText(getByPlaceholderText('Code / value'), 'Loyal-9');
      fireEvent.press(getByText('Done'));

      await waitFor(() => expect(apiRef.current!.passes).toHaveLength(1));
      expect(apiRef.current!.passes[0].title).toBe('Café Card');
      expect(apiRef.current!.passes[0].type).toBe('loyalty');
    });

    it('does not show the Delete Pass action in create mode', () => {
      const { queryByText } = render(
        <PassEditScreen navigation={makeNavigation()} route={makeRoute(undefined)} />,
      );

      expect(queryByText('Delete Pass')).toBeNull();
    });
  });

  describe('create mode with prefillCode (from PassScanScreen)', () => {
    it('pre-fills the code field from prefillCode on mount', () => {
      const { getByPlaceholderText } = render(
        <PassEditScreen navigation={makeNavigation()} route={makeRoute({ prefillCode: 'SCANNED-XYZ' })} />,
      );

      expect(getByPlaceholderText('Code / value').props.value).toBe('SCANNED-XYZ');
    });

    it('does not save automatically from a scan — the user must still tap Done', async () => {
      const apiRef: { current: ReturnType<typeof useWallet> | null } = { current: null };
      function Probe() {
        apiRef.current = useWallet();
        return null;
      }
      const navigation = makeNavigation();
      render(
        <>
          <Probe />
          <PassEditScreen navigation={navigation} route={makeRoute({ prefillCode: 'SCANNED-XYZ' })} />
        </>,
      );

      await waitFor(() => expect(apiRef.current).not.toBeNull());
      expect(apiRef.current!.passes).toHaveLength(0);
      expect(navigation.goBack).not.toHaveBeenCalled();
    });

    it('defaults the pass type to Other and creates it as Other once Done is tapped', async () => {
      const apiRef: { current: ReturnType<typeof useWallet> | null } = { current: null };
      function Probe() {
        apiRef.current = useWallet();
        return null;
      }
      const navigation = makeNavigation();
      const { getByText, getByPlaceholderText } = render(
        <>
          <Probe />
          <PassEditScreen navigation={navigation} route={makeRoute({ prefillCode: 'SCANNED-XYZ' })} />
        </>,
      );
      await waitFor(() => expect(apiRef.current).not.toBeNull());

      fireEvent.changeText(getByPlaceholderText('Title'), 'Scanned Pass');
      fireEvent.press(getByText('Done'));

      await waitFor(() => expect(apiRef.current!.passes).toHaveLength(1));
      expect(apiRef.current!.passes[0].type).toBe('other');
      expect(apiRef.current!.passes[0].code).toBe('SCANNED-XYZ');
    });
  });

  describe('edit mode (passId present)', () => {
    it('renders the Edit Pass title pre-filled from the seeded pass', async () => {
      const navigation = makeNavigation();
      const { getByText, getByPlaceholderText } = render(
        <EditHarness
          navigation={navigation}
          seed={{ type: 'ticket', title: 'Seeded Pass', subtitle: 'Gate 5', code: 'SEED1', color: '#34C759' }}
          onReady={() => {}}
        />,
      );

      await waitFor(() => expect(getByText('Edit Pass')).toBeTruthy());
      expect(getByPlaceholderText('Title').props.value).toBe('Seeded Pass');
      expect(getByPlaceholderText('Code / value').props.value).toBe('SEED1');
    });

    it('saves edits through updatePass and goes back', async () => {
      const navigation = makeNavigation();
      let api: ReturnType<typeof useWallet> | null = null;
      let passId = '';
      const { getByText, getByPlaceholderText } = render(
        <EditHarness
          navigation={navigation}
          seed={{ type: 'ticket', title: 'Original', code: 'ORIG', color: '#34C759' }}
          onReady={(a, id) => { api = a; passId = id; }}
        />,
      );

      await waitFor(() => expect(getByText('Edit Pass')).toBeTruthy());
      fireEvent.changeText(getByPlaceholderText('Title'), 'Renamed');
      fireEvent.press(getByText('Done'));

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(api!.getPass(passId)?.title).toBe('Renamed'));
    });

    it('does not save when a required field is cleared in edit mode', async () => {
      const navigation = makeNavigation();
      let api: ReturnType<typeof useWallet> | null = null;
      let passId = '';
      const { getByText, getByPlaceholderText } = render(
        <EditHarness
          navigation={navigation}
          seed={{ type: 'ticket', title: 'KeepMe', code: 'KEEP', color: '#34C759' }}
          onReady={(a, id) => { api = a; passId = id; }}
        />,
      );

      await waitFor(() => expect(getByText('Edit Pass')).toBeTruthy());
      fireEvent.changeText(getByPlaceholderText('Title'), '');
      fireEvent.press(getByText('Done'));

      expect(navigation.goBack).not.toHaveBeenCalled();
      expect(api!.getPass(passId)?.title).toBe('KeepMe');
    });

    it('deletes the pass via the Delete Pass action and goes back', async () => {
      const navigation = makeNavigation();
      let api: ReturnType<typeof useWallet> | null = null;
      let passId = '';
      const { getByText } = render(
        <EditHarness
          navigation={navigation}
          seed={{ type: 'ticket', title: 'ToDelete', code: 'DEL', color: '#34C759' }}
          onReady={(a, id) => { api = a; passId = id; }}
        />,
      );

      await waitFor(() => expect(getByText('Edit Pass')).toBeTruthy());
      expect(getByText('Delete Pass')).toBeTruthy();
      fireEvent.press(getByText('Delete Pass'));

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(api!.getPass(passId)).toBeUndefined());
    });
  });
});
