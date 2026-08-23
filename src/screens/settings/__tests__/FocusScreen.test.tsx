import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, fireEvent, waitFor } from '../../../test-utils';
import { FocusScreen } from '../FocusScreen';
import { notificationCallbackForFocus } from '../../../utils/notificationFocusFilter';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

describe('FocusScreen', () => {
  it('renders all focus mode options', () => {
    const { getByText } = render(<FocusScreen navigation={mockNavigation as never} />);
    expect(getByText('Do Not Disturb')).toBeTruthy();
    expect(getByText('Sleep')).toBeTruthy();
    expect(getByText('Work')).toBeTruthy();
    expect(getByText('Personal')).toBeTruthy();
  });

  it('renders the screen without crashing', () => {
    const { toJSON } = render(<FocusScreen navigation={mockNavigation as never} />);
    expect(toJSON()).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Notification suppression unit tests (red step proven against pre-fix App.tsx)
// ---------------------------------------------------------------------------
describe('notificationCallbackForFocus — focus mode suppression', () => {
  const makeRefs = (focusMode: string) => ({
    seenIds: { current: new Set<string>() } as React.MutableRefObject<Set<string>>,
    focusModeRef: { current: focusMode } as React.MutableRefObject<string>,
  });

  const testNotif = { id: 'n1', title: 'Hello', text: 'World', packageName: 'com.test.app' };

  it('does NOT call setBanner when focus mode is active (doNotDisturb)', () => {
    const { seenIds, focusModeRef } = makeRefs('doNotDisturb');
    const setBanner = jest.fn();

    notificationCallbackForFocus(testNotif, seenIds, focusModeRef, setBanner);

    expect(setBanner).not.toHaveBeenCalled();
  });

  it('does NOT call setBanner when focus mode is active (sleep)', () => {
    const { seenIds, focusModeRef } = makeRefs('sleep');
    const setBanner = jest.fn();

    notificationCallbackForFocus(testNotif, seenIds, focusModeRef, setBanner);

    expect(setBanner).not.toHaveBeenCalled();
  });

  it('DOES call setBanner when focus mode is off', () => {
    const { seenIds, focusModeRef } = makeRefs('off');
    const setBanner = jest.fn();

    notificationCallbackForFocus(testNotif, seenIds, focusModeRef, setBanner);

    expect(setBanner).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Hello',
      body: 'World',
      appName: 'app',
    }));
  });

  it('does not re-show an already-seen notification id', () => {
    const { seenIds, focusModeRef } = makeRefs('off');
    seenIds.current.add('n1');
    const setBanner = jest.fn();

    notificationCallbackForFocus(testNotif, seenIds, focusModeRef, setBanner);

    expect(setBanner).not.toHaveBeenCalled();
  });

  it('silently ignores null/undefined notification', () => {
    const { seenIds, focusModeRef } = makeRefs('off');
    const setBanner = jest.fn();

    notificationCallbackForFocus(null, seenIds, focusModeRef, setBanner);
    notificationCallbackForFocus(undefined, seenIds, focusModeRef, setBanner);

    expect(setBanner).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Hidden Pages per Focus mode (#618)
// ---------------------------------------------------------------------------
// Monta o FocusScreen real: abre o multiselect de um modo, alterna uma página e
// verifica que a escolha vai para o AsyncStorage (persiste entre arranques) e
// que o resumo da linha muda. O modo 'off' não tem linha nenhuma — não filtra.
describe('FocusScreen — Hidden Pages (#618)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  });

  it('renders one Hidden Pages row per mode, and none for Off', () => {
    const { getByText, queryByText } = render(
      <FocusScreen navigation={mockNavigation as never} />,
    );
    expect(getByText('Work — Hidden Pages')).toBeTruthy();
    expect(getByText('Sleep — Hidden Pages')).toBeTruthy();
    expect(getByText('Do Not Disturb — Hidden Pages')).toBeTruthy();
    expect(getByText('Personal — Hidden Pages')).toBeTruthy();
    expect(queryByText('Off — Hidden Pages')).toBeNull();
  });

  it('shows "None" until a page is hidden, then the count', async () => {
    const { getByText, getAllByText } = render(
      <FocusScreen navigation={mockNavigation as never} />,
    );
    expect(getAllByText('None').length).toBeGreaterThan(0);

    fireEvent.press(getByText('Work — Hidden Pages'));
    fireEvent.press(getByText('Page 1'));

    await waitFor(() => expect(getByText('1 hidden')).toBeTruthy());
  });

  it('persists focusPageVisibility to AsyncStorage (survives a restart)', async () => {
    const { getByText } = render(<FocusScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByText('Work — Hidden Pages'));
    fireEvent.press(getByText('Page 1'));

    await waitFor(() => {
      const write = (AsyncStorage.setItem as jest.Mock).mock.calls
        .filter(([key]) => key === '@iostoandroid/settings')
        .pop();
      expect(write).toBeTruthy();
      expect(JSON.parse(write![1] as string).focusPageVisibility).toEqual({ work: [0] });
    });
  });

  it('un-hides the page when the same row is tapped twice (double tap is a no-op)', async () => {
    const { getByText, getAllByText } = render(
      <FocusScreen navigation={mockNavigation as never} />,
    );

    fireEvent.press(getByText('Work — Hidden Pages'));
    fireEvent.press(getByText('Page 1'));
    await waitFor(() => expect(getByText('1 hidden')).toBeTruthy());

    fireEvent.press(getByText('Work — Hidden Pages'));
    fireEvent.press(getByText('✓ Page 1'));

    await waitFor(() => expect(getAllByText('None').length).toBeGreaterThan(0));
  });

  it('keeps each mode independent — hiding a Work page leaves Sleep untouched', async () => {
    const { getByText } = render(<FocusScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByText('Work — Hidden Pages'));
    fireEvent.press(getByText('Page 1'));

    await waitFor(() => {
      const write = (AsyncStorage.setItem as jest.Mock).mock.calls
        .filter(([key]) => key === '@iostoandroid/settings')
        .pop();
      expect(JSON.parse(write![1] as string).focusPageVisibility.sleep).toBeUndefined();
    });
  });
});
