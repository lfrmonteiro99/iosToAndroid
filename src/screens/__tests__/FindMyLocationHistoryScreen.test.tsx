import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FindMyLocationHistoryScreen } from '../FindMyLocationHistoryScreen';

const HISTORY_KEY = '@iostoandroid/findmy_location_history';

// AllProviders (test-utils) does NOT mount AlertProvider, so useAlert() is a
// no-op there. Mock the real module path the screen imports useAlert from, to
// capture what the screen asks the user to confirm.
const mockAlert = jest.fn();
jest.mock('../../components/AlertProvider', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ...jest.requireActual('../../components/AlertProvider'),
  useAlert: () => mockAlert,
}));

// Stateful in-memory AsyncStorage so seeded history is observable and a
// clearHistory() removal sticks across assertions.
function setupMemoryAsyncStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
    store.has(key) ? store.get(key) : null,
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
    store.delete(key);
  });
  return store;
}

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() } as never;

const SEED = [
  { latitude: 37.7749, longitude: -122.4194, accuracy: 10, timestamp: 1_700_000_003_000 },
  { latitude: 37.33, longitude: -122.0, accuracy: 12, timestamp: 1_700_000_002_000 },
  { latitude: 38.0, longitude: -121.0, accuracy: 8, timestamp: 1_700_000_001_000 },
];

function renderScreen(seed: typeof SEED | null) {
  const init: Record<string, string> = {};
  if (seed !== null) init[HISTORY_KEY] = JSON.stringify(seed);
  const store = setupMemoryAsyncStorage(init);
  const utils = render(<FindMyLocationHistoryScreen navigation={mockNavigation} />);
  return { ...utils, store };
}

describe('FindMyLocationHistoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMemoryAsyncStorage();
  });

  it('renders one row per history entry, most recent first', async () => {
    const { getByText, queryByText, toJSON } = renderScreen(SEED);
    await waitFor(() => expect(queryByText('No Location History')).toBeNull());

    // Each coordinate renders exactly once.
    expect(getByText('37.7749, -122.4194')).toBeTruthy();
    expect(getByText('37.3300, -122.0000')).toBeTruthy();
    expect(getByText('38.0000, -121.0000')).toBeTruthy();

    // Document order must be most-recent first: newest (ts 3) above oldest (ts 1).
    const flat = JSON.stringify(toJSON());
    const newest = flat.indexOf('37.7749, -122.4194');
    const middle = flat.indexOf('37.3300, -122.0000');
    const oldest = flat.indexOf('38.0000, -121.0000');
    expect(newest).toBeGreaterThanOrEqual(0);
    expect(newest).toBeLessThan(middle);
    expect(middle).toBeLessThan(oldest);
  });

  it('renders the empty state when history is empty', async () => {
    const { getByText } = renderScreen(null);
    await waitFor(() => expect(getByText('No Location History')).toBeTruthy());
  });

  it('shows a Clear button in the navigation bar', async () => {
    const { getByText } = renderScreen(SEED);
    await waitFor(() => expect(getByText('Clear')).toBeTruthy());
  });

  it('opens a confirmation alert with destructive + cancel when Clear is tapped', async () => {
    const { getByText } = renderScreen(SEED);
    await waitFor(() => expect(getByText('Clear')).toBeTruthy());

    fireEvent.press(getByText('Clear'));

    expect(mockAlert).toHaveBeenCalledTimes(1);
    const [title, , actions] = mockAlert.mock.calls[0];
    expect(title).toBe('Clear Location History');
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Clear', style: 'destructive' }),
      ]),
    );
  });

  it('leaves history unchanged when the confirmation is cancelled', async () => {
    const { getByText, store } = renderScreen(SEED);
    await waitFor(() => expect(getByText('Clear')).toBeTruthy());
    // Let hydration settle so the cancel assertion observes a stable store.
    await waitFor(() => expect(store.get(HISTORY_KEY)).toBeTruthy());
    fireEvent.press(getByText('Clear'));

    // The Cancel action carries no onPress, so dismissing the dialog never
    // invokes clearHistory(). Verify the persisted key and the rows survive.
    const cancel = mockAlert.mock.calls[0][2].find(
      (a: { text: string }) => a.text === 'Cancel',
    );
    expect(cancel.style).toBe('cancel');
    expect(cancel.onPress).toBeUndefined();

    // No removal of the persisted key; history still present.
    expect(store.has(HISTORY_KEY)).toBe(true);
    expect(getByText('37.7749, -122.4194')).toBeTruthy();
  });

  it('empties history and removes the persisted entry when the destructive action is confirmed', async () => {
    const { getByText, store } = renderScreen(SEED);
    await waitFor(() => expect(getByText('Clear')).toBeTruthy());
    // Let hydration finish persisting the seeded history to storage before we
    // clear, otherwise the still-in-flight hydration write can land after the
    // removal and recreate the key. clearHistory removes the entry, and no
    // later write occurs because the persist effect skips empty arrays.
    await waitFor(() => expect(store.get(HISTORY_KEY)).toBeTruthy());
    fireEvent.press(getByText('Clear'));

    const destructive = mockAlert.mock.calls[0][2].find(
      (a: { text: string }) => a.text === 'Clear',
    );
    destructive.onPress();

    await waitFor(() => expect(getByText('No Location History')).toBeTruthy());
    // Persisted entry removed, not left as a `[]` placeholder.
    await waitFor(() => expect(store.has(HISTORY_KEY)).toBe(false));
    expect(await AsyncStorage.getItem(HISTORY_KEY)).toBeNull();
  });
});
