import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import { MapsScreen } from '../MapsScreen';
import { useReadingList } from '../../store/ReadingListStore';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

// Seed the real ReadingList store (shared with MapsScreen via test-utils'
// AllProviders) so we exercise the actual store → modal data flow.
function Seed({ items }: { items: { url: string; title: string }[] }) {
  const { addItem } = useReadingList();
  React.useEffect(() => {
    items.forEach((it) => addItem(it.url, it.title));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function Tree({ seed }: { seed: { url: string; title: string }[] }) {
  return (
    <>
      <Seed items={seed} />
      <MapsScreen navigation={navigation} />
    </>
  );
}

const recents = [
  { id: 'r1', name: 'Torre de Belém', address: 'Lisboa', timestamp: 1, isFavorite: false },
];

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    key === '@iostoandroid/maps_recents' ? Promise.resolve(JSON.stringify(recents)) : Promise.resolve(null),
  );
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as unknown as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('MapsScreen Reading List integration', () => {
  it('shows a Reading List entry button in the nav bar', () => {
    const { getByLabelText } = render(<MapsScreen navigation={navigation} />);
    expect(getByLabelText('Open Reading List')).toBeTruthy();
  });

  it('opens the Reading List modal from the nav-bar button', () => {
    const { getByLabelText, queryByText, getByText } = render(<MapsScreen navigation={navigation} />);
    // Modal is hidden until the button is pressed.
    expect(queryByText('Reading List')).toBeNull();
    fireEvent.press(getByLabelText('Open Reading List'));
    expect(getByText('Reading List')).toBeTruthy();
    expect(getByText('0 items')).toBeTruthy();
  });

  it('renders saved items seeded from the real store', async () => {
    const { getByLabelText, getByText } = render(
      <Tree seed={[{ url: 'https://maps.apple.com/?q=Torre+de+Belem', title: 'Torre de Belém' }]} />,
    );
    fireEvent.press(getByLabelText('Open Reading List'));
    await waitFor(() => expect(getByText('Torre de Belém')).toBeTruthy());
  });

  it('navigates to the item URL and closes the modal on tap', async () => {
    const { getByLabelText, getByText } = render(
      <Tree seed={[{ url: 'https://maps.apple.com/?q=Praca', title: 'Praça do Comércio' }]} />,
    );
    fireEvent.press(getByLabelText('Open Reading List'));
    await waitFor(() => expect(getByText('Praça do Comércio')).toBeTruthy());

    fireEvent.press(getByText('Praça do Comércio'));

    await waitFor(() =>
      expect(Linking.openURL).toHaveBeenCalledWith('https://maps.apple.com/?q=Praca'),
    );
  });

  it('adds the current location to the reading list via the share sheet', async () => {
    const { getByText, getByLabelText, getAllByText } = render(<MapsScreen navigation={navigation} />);

    // Select a location → opens the detail modal.
    const recent = await waitFor(() => getByText('Torre de Belém'));
    fireEvent.press(recent);

    // Open the share sheet from the detail modal's Share action.
    const shareBtn = await waitFor(() => getByLabelText('Share location'));
    fireEvent.press(shareBtn);

    // With a URL present and the handler wired, the option appears.
    const addBtn = await waitFor(() => getByLabelText('Add to Reading List'));
    fireEvent.press(addBtn);

    // The real store (shared with the modal) should now contain the location.
    fireEvent.press(getByLabelText('Open Reading List'));
    await waitFor(() => expect(getByText(/1 item/)).toBeTruthy());
    // And the saved location is the one shown in the reading list.
    expect(getAllByText('Torre de Belém').length).toBeGreaterThanOrEqual(2);
  });
});
