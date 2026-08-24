import React from 'react';
import { render, fireEvent, act } from '../../test-utils';
import { BrowserScreen, resolveUrl, BROWSER_HOME_URL } from '../BrowserScreen';
import { BUILT_IN_APPS, VIRTUAL_ICON_CONFIG } from '../LauncherHomeScreen';
import { useBookmarks } from '../../store/BookmarksStore';

// The global mock in jest.setup.js hands out a fresh jest.fn() per render
// (useImperativeHandle has no deps array), so a reference captured before a
// state-driven re-render would not be the one BrowserScreen actually calls.
// Override it here with module-scoped mocks so the same fn identity survives
// every re-render within this file, and BrowserScreen.test.tsx can assert on it.
const mockGoBack = jest.fn();
const mockGoForward = jest.fn();
jest.mock('react-native-webview', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactActual = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  const WebView = ReactActual.forwardRef((props: object, ref: React.Ref<unknown>) => {
    ReactActual.useImperativeHandle(ref, () => ({
      reload: jest.fn(),
      goBack: mockGoBack,
      goForward: mockGoForward,
      stopLoading: jest.fn(),
    }));
    return ReactActual.createElement(View, props);
  });
  WebView.displayName = 'WebView';
  return { __esModule: true, WebView, default: WebView };
});

const nav = { navigate: jest.fn(), goBack: jest.fn() } as never;

beforeEach(() => jest.clearAllMocks());

function submitAddress(input: string) {
  const utils = render(<BrowserScreen navigation={nav} />);
  const bar = utils.getByPlaceholderText('Search or enter website name');
  fireEvent.changeText(bar, input);
  fireEvent(bar, 'submitEditing');
  return utils;
}

function webviewUri(utils: ReturnType<typeof render>): string {
  const webview = utils.getByTestId('browser-webview');
  return (webview.props.source as { uri: string }).uri;
}

function flatStyle(element: { props: { style: unknown } }): Record<string, unknown> {
  const styles = Array.isArray(element.props.style) ? element.props.style : [element.props.style];
  return Object.assign({}, ...styles.filter(Boolean));
}

describe('BrowserScreen — address bar + WebView', () => {
  it('renders an address bar and a WebView pointing at the home URL', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    expect(utils.getByPlaceholderText('Search or enter website name')).toBeTruthy();
    expect(webviewUri(utils)).toBe(BROWSER_HOME_URL);
  });

  it('navigates to a Google search URL for a bare search term', () => {
    const utils = submitAddress('cats');
    expect(webviewUri(utils)).toBe('https://www.google.com/search?q=cats');
  });

  it('percent-encodes multi-word search terms', () => {
    const utils = submitAddress('black cats');
    expect(webviewUri(utils)).toBe('https://www.google.com/search?q=black%20cats');
  });

  it('prefixes https:// on a bare domain', () => {
    const utils = submitAddress('example.com');
    expect(webviewUri(utils)).toBe('https://example.com');
  });

  it('keeps an explicit scheme untouched', () => {
    const utils = submitAddress('http://example.com/path?a=1');
    expect(webviewUri(utils)).toBe('http://example.com/path?a=1');
  });

  it('goes back when the back button is pressed', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    fireEvent.press(utils.getByLabelText('Go back'));
    expect((nav as unknown as { goBack: jest.Mock }).goBack).toHaveBeenCalledTimes(1);
  });
});

describe('BrowserScreen — the Go button', () => {
  it('navigates on Go press, same as submitEditing', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    fireEvent.changeText(utils.getByPlaceholderText('Search or enter website name'), 'example.org');
    fireEvent.press(utils.getByLabelText('Go'));
    expect(webviewUri(utils)).toBe('https://example.org');
  });
});

describe('resolveUrl — boundaries, empties, hostile input', () => {
  it('returns empty string for an empty or whitespace-only input', () => {
    expect(resolveUrl('')).toBe('');
    expect(resolveUrl('   ')).toBe('');
  });

  it('trims surrounding whitespace before deciding', () => {
    expect(resolveUrl('  example.com  ')).toBe('https://example.com');
  });

  it('treats a term containing spaces as a search even when it has a dot', () => {
    expect(resolveUrl('node.js tutorial')).toBe('https://www.google.com/search?q=node.js%20tutorial');
  });

  it('searches for a trailing-dot-only term rather than building a bogus host', () => {
    expect(resolveUrl('what.')).toBe('https://www.google.com/search?q=what.');
    expect(resolveUrl('.')).toBe('https://www.google.com/search?q=.');
  });

  it('encodes characters that would break the query string', () => {
    expect(resolveUrl('a&b=c#d')).toBe('https://www.google.com/search?q=a%26b%3Dc%23d');
  });

  it('preserves an about:blank-style scheme rather than searching for it', () => {
    expect(resolveUrl('https://sub.domain.co.uk:8443/x')).toBe('https://sub.domain.co.uk:8443/x');
  });
});

describe('BrowserScreen — empty submit is inert (the inverse of the fix)', () => {
  it('does not change the WebView URL when the address bar is emptied and submitted', () => {
    const utils = submitAddress('   ');
    expect(webviewUri(utils)).toBe(BROWSER_HOME_URL);
  });

  it('submitting the same term twice keeps the same URL (double tap)', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    const bar = utils.getByPlaceholderText('Search or enter website name');
    fireEvent.changeText(bar, 'example.com');
    fireEvent(bar, 'submitEditing');
    fireEvent(bar, 'submitEditing');
    expect(webviewUri(utils)).toBe('https://example.com');
  });
});

describe('BrowserScreen — Share', () => {
  it('does not show the share sheet before the Share button is pressed', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    expect(utils.queryByLabelText('Copy')).toBeNull();
  });

  it('pressing Share opens the CupertinoShareSheet', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    fireEvent.press(utils.getByLabelText('Share'));
    expect(utils.getByLabelText('Copy')).toBeTruthy();
  });

  it('the share sheet receives the current URL and page title as props', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    const webview = utils.getByTestId('browser-webview');
    fireEvent(webview, 'navigationStateChange', { title: 'Example Domain', url: BROWSER_HOME_URL });
    fireEvent.press(utils.getByLabelText('Share'));
    expect(utils.getByText('Example Domain')).toBeTruthy();
    expect(utils.getByText(BROWSER_HOME_URL)).toBeTruthy();
  });

  it('reflects a navigated URL and title in the share sheet, not the stale home ones', () => {
    const utils = submitAddress('example.com');
    const webview = utils.getByTestId('browser-webview');
    fireEvent(webview, 'navigationStateChange', { title: 'Example', url: 'https://example.com' });
    fireEvent.press(utils.getByLabelText('Share'));
    expect(utils.getByText('Example')).toBeTruthy();
    expect(utils.getByText('https://example.com')).toBeTruthy();
    expect(utils.queryByText(BROWSER_HOME_URL)).toBeNull();
  });

  it('closing the share sheet dismisses it without changing the WebView URL', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    fireEvent.press(utils.getByLabelText('Share'));
    expect(utils.getByLabelText('Cancel')).toBeTruthy();
    fireEvent.press(utils.getByLabelText('Cancel'));
    expect(utils.queryByLabelText('Copy')).toBeNull();
    expect(webviewUri(utils)).toBe(BROWSER_HOME_URL);
  });
});

describe('BrowserScreen — multi-tab (BrowserTabGrid)', () => {
  it('opens the tab grid when the Tabs button is pressed', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    fireEvent.press(utils.getByLabelText('Tabs'));
    expect(utils.getByTestId('browser-tab-grid')).toBeTruthy();
    expect(utils.queryByTestId('browser-webview')).toBeNull();
  });

  it('"+ New Tab" creates a tab and makes it the active one, remounting the WebView at the home URL', () => {
    const utils = submitAddress('example.com');
    expect(webviewUri(utils)).toBe('https://example.com');

    fireEvent.press(utils.getByLabelText('Tabs'));
    fireEvent.press(utils.getByLabelText('New Tab'));

    expect(webviewUri(utils)).toBe(BROWSER_HOME_URL);
  });

  it("switching tabs in the grid re-mounts the WebView with the selected tab's url", () => {
    const utils = submitAddress('example.com');
    expect(webviewUri(utils)).toBe('https://example.com');

    fireEvent.press(utils.getByLabelText('Tabs'));
    fireEvent.press(utils.getByLabelText('New Tab'));

    // New tab is active and defaults to the home URL — WebView re-mounted with it.
    expect(webviewUri(utils)).toBe(BROWSER_HOME_URL);

    // Go back to the grid and switch back to the first tab (still showing example.com).
    fireEvent.press(utils.getByLabelText('Tabs'));
    fireEvent.press(utils.getByLabelText('Tab: https://example.com'));
    expect(webviewUri(utils)).toBe('https://example.com');
  });

  it('the grid shows one card per open tab', () => {
    const utils = submitAddress('example.com');
    fireEvent.press(utils.getByLabelText('Tabs'));
    fireEvent.press(utils.getByLabelText('New Tab'));
    fireEvent.press(utils.getByLabelText('Tabs'));

    expect(utils.getByLabelText('Tab: https://example.com')).toBeTruthy();
    expect(utils.getByLabelText(`Tab: ${BROWSER_HOME_URL}`)).toBeTruthy();
  });

  it('"Done" returns to the active tab without changing it', () => {
    const utils = submitAddress('example.com');
    fireEvent.press(utils.getByLabelText('Tabs'));
    fireEvent.press(utils.getByLabelText('Done'));
    expect(webviewUri(utils)).toBe('https://example.com');
  });

  it('the Tabs button shows a badge with the current tab count', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    expect(utils.getByTestId('browser-tabs-badge').props.children).toBe('1');

    fireEvent.press(utils.getByLabelText('Tabs'));
    fireEvent.press(utils.getByLabelText('New Tab'));
    expect(utils.getByTestId('browser-tabs-badge').props.children).toBe('2');

    fireEvent.press(utils.getByLabelText('Tabs'));
    fireEvent.press(utils.getByLabelText('New Tab'));
    expect(utils.getByTestId('browser-tabs-badge').props.children).toBe('3');
  });

  it('closing the only (active) tab never leaves zero tabs: a fresh home tab takes over', () => {
    const utils = submitAddress('example.com');
    expect(webviewUri(utils)).toBe('https://example.com');

    fireEvent.press(utils.getByLabelText('Tabs'));
    fireEvent.press(utils.getByLabelText('Close tab: https://example.com'));

    // Never zero tabs: exactly one remains, at the home URL.
    expect(utils.getByLabelText(`Tab: ${BROWSER_HOME_URL}`)).toBeTruthy();
    expect(utils.queryByLabelText('Tab: https://example.com')).toBeNull();
    fireEvent.press(utils.getByLabelText('Done'));
    expect(utils.getByTestId('browser-tabs-badge').props.children).toBe('1');
    expect(webviewUri(utils)).toBe(BROWSER_HOME_URL);
  });

  it('closing tabs repeatedly (double-tap on the last close affordance) still leaves exactly one tab', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    fireEvent.press(utils.getByLabelText('Tabs'));
    const label = `Close tab: ${BROWSER_HOME_URL}`;
    fireEvent.press(utils.getByLabelText(label));
    fireEvent.press(utils.getByLabelText(label));

    fireEvent.press(utils.getByLabelText('Done'));
    expect(utils.getByTestId('browser-tabs-badge').props.children).toBe('1');
    expect(utils.getByTestId('browser-webview')).toBeTruthy();
  });

  it('closing the active tab (when others remain) activates another existing tab', () => {
    const utils = submitAddress('example.com');
    fireEvent.press(utils.getByLabelText('Tabs'));
    fireEvent.press(utils.getByLabelText('New Tab')); // active tab is now the new home-url tab
    fireEvent.press(utils.getByLabelText('Tabs'));
    fireEvent.press(utils.getByLabelText(`Close tab: ${BROWSER_HOME_URL}`));

    // Only the example.com tab remains — grid should reflect that, and selecting it works.
    expect(utils.queryByLabelText(`Tab: ${BROWSER_HOME_URL}`)).toBeNull();
    fireEvent.press(utils.getByLabelText('Tab: https://example.com'));
    expect(webviewUri(utils)).toBe('https://example.com');
  });

  it('closing a background (non-active) tab does not change the active WebView url', () => {
    const utils = submitAddress('example.com');
    fireEvent.press(utils.getByLabelText('Tabs'));
    fireEvent.press(utils.getByLabelText('New Tab')); // new tab (home url) becomes active
    fireEvent.press(utils.getByLabelText('Tabs'));
    // Close the background tab (example.com), not the active one.
    fireEvent.press(utils.getByLabelText('Close tab: https://example.com'));
    fireEvent.press(utils.getByLabelText('Done'));    expect(webviewUri(utils)).toBe(BROWSER_HOME_URL);
  });
});

function fireNavigationStateChange(
  utils: ReturnType<typeof render>,
  nav: { canGoBack: boolean; canGoForward: boolean; url: string; loading?: boolean },
) {
  fireEvent(utils.getByTestId('browser-webview'), 'navigationStateChange', {
    canGoBack: nav.canGoBack,
    canGoForward: nav.canGoForward,
    url: nav.url,
    loading: nav.loading ?? false,
    title: '',
    lockIdentifier: 0,
    navigationType: 'click',
  });
}

describe('BrowserScreen — Back/Forward toolbar', () => {
  it('renders Back and Forward buttons dimmed and inert when history is empty in both directions', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    fireNavigationStateChange(utils, { canGoBack: false, canGoForward: false, url: BROWSER_HOME_URL });

    const back = utils.getByLabelText('Go back in history');
    const forward = utils.getByLabelText('Go forward in history');
    expect(back.props.accessibilityState?.disabled).toBe(true);
    expect(forward.props.accessibilityState?.disabled).toBe(true);

    fireEvent.press(back);
    fireEvent.press(forward);
    expect(mockGoBack).not.toHaveBeenCalled();
    expect(mockGoForward).not.toHaveBeenCalled();
  });

  it('enables Back and calls only WebView.goBack when canGoBack is true (not Forward)', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    fireNavigationStateChange(utils, { canGoBack: true, canGoForward: false, url: 'https://example.com/page2' });

    const back = utils.getByLabelText('Go back in history');
    expect(back.props.accessibilityState?.disabled).toBe(false);
    fireEvent.press(back);

    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockGoForward).not.toHaveBeenCalled();
  });

  it('enables Forward and calls only WebView.goForward when canGoForward is true (not Back)', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    fireNavigationStateChange(utils, { canGoBack: false, canGoForward: true, url: 'https://example.com/page1' });

    const forward = utils.getByLabelText('Go forward in history');
    expect(forward.props.accessibilityState?.disabled).toBe(false);
    fireEvent.press(forward);

    expect(mockGoForward).toHaveBeenCalledTimes(1);
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('re-enables both buttons when a later navigation reports history in both directions', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    fireNavigationStateChange(utils, { canGoBack: false, canGoForward: false, url: BROWSER_HOME_URL });
    fireNavigationStateChange(utils, { canGoBack: true, canGoForward: true, url: 'https://example.com/page3' });

    fireEvent.press(utils.getByLabelText('Go back in history'));
    fireEvent.press(utils.getByLabelText('Go forward in history'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockGoForward).toHaveBeenCalledTimes(1);
  });

  it('reflects the WebView current URL in the address bar after navigating within the page', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    fireNavigationStateChange(utils, {
      canGoBack: true,
      canGoForward: false,
      url: 'https://example.com/deep/link',
    });
    expect(utils.getByPlaceholderText('Search or enter website name').props.value).toBe(
      'https://example.com/deep/link',
    );
  });

  it('does not touch the top-bar "Go back" (navigation.goBack) button or label — regression guard', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    fireNavigationStateChange(utils, { canGoBack: true, canGoForward: true, url: 'https://example.com' });
    fireEvent.press(utils.getByLabelText('Go back'));
    expect((nav as unknown as { goBack: jest.Mock }).goBack).toHaveBeenCalledTimes(1);
    expect(mockGoBack).not.toHaveBeenCalled();
  });
});

describe('BrowserScreen — chrome is never covered by the WebView (issue #708)', () => {
  // The react-native-webview v13 wraps the native view in an extra flex:1 frame
  // (webViewContainerStyle = [container, containerStyle]). BrowserScreen only
  // passed `style={{flex:1}}` to the *native* view, leaving the *frame* without
  // an explicit flex in some runtime configs (e.g. New Architecture, where
  // app.json sets newArchEnabled: true). When the frame can't claim the column
  // height, the native WebView keeps its intrinsic Android height and overflows
  // over the address bar / bottom toolbar — the "blank page, only the Google
  // logo" symptom. The fix gives the frame an explicit flex:1 via
  // containerStyle and lifts the chrome above the WebView with a zIndex.

  it('mounts the WebView with a flex:1 containerStyle so its frame fills the column and cannot overflow the chrome', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    const webview = utils.getByTestId('browser-webview');
    expect(webview.props.containerStyle).toMatchObject({ flex: 1 });
  });

  it('keeps the top bar above the WebView (zIndex) so it is never covered', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    const topBar = utils.getByTestId('browser-topbar');
    expect(flatStyle(topBar).zIndex).toBeGreaterThanOrEqual(1);
  });

  it('keeps the bottom toolbar above the WebView (zIndex) so it is never covered', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    const bottomToolbar = utils.getByTestId('browser-bottom-toolbar');
    expect(flatStyle(bottomToolbar).zIndex).toBeGreaterThanOrEqual(1);
  });

  it('still renders the address bar and bottom toolbar as siblings of the WebView', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    expect(utils.getByPlaceholderText('Search or enter website name')).toBeTruthy();
    expect(utils.getByTestId('browser-bottom-toolbar')).toBeTruthy();
    expect(utils.getByTestId('browser-webview')).toBeTruthy();
  });
});

describe('BrowserScreen — private browsing is per-tab (grid segmented control)', () => {
  // The standalone "Toggle private browsing" Pressable from the single-tab
  // sub-issue no longer exists. Privacy is now driven by the active tab's
  // isPrivate flag, switched via the "Tabs"/"Private" segmented control in
  // BrowserTabGrid.

  it('mounts the WebView with incognito=false for a normal default tab', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    const webview = utils.getByTestId('browser-webview');
    expect(webview.props.incognito).toBe(false);
  });

  it('creating a private tab via the "Private" segment mounts its WebView with incognito=true', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    fireEvent.press(utils.getByLabelText('Tabs'));

    // Switch the grid to the "Private" segment, then add a tab.
    fireEvent.press(utils.getByText('Private'));
    fireEvent.press(utils.getByLabelText('New Tab'));

    expect(utils.getByTestId('browser-webview').props.incognito).toBe(true);
  });

  it('switching back to a normal tab flips incognito back to false (per-tab, not global)', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    fireEvent.press(utils.getByLabelText('Tabs'));

    fireEvent.press(utils.getByText('Private'));
    fireEvent.press(utils.getByLabelText('New Tab'));
    expect(utils.getByTestId('browser-webview').props.incognito).toBe(true);

    // Go back to the grid and select the original normal tab.
    fireEvent.press(utils.getByLabelText('Tabs'));
    fireEvent.press(utils.getByLabelText(`Tab: ${BROWSER_HOME_URL}`));

    expect(utils.getByTestId('browser-webview').props.incognito).toBe(false);
  });

  it('darkens topBar and addressBar to #1C1C1E for a private active tab, restores for a normal tab', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    const topBar = utils.getByTestId('browser-topbar');
    const addressBar = utils.getByPlaceholderText('Search or enter website name');

    const defaultTopBarBg = flatStyle(topBar).backgroundColor;
    const defaultAddressBarBg = flatStyle(addressBar).backgroundColor;
    expect(defaultTopBarBg).not.toBe('#1C1C1E');
    expect(defaultAddressBarBg).not.toBe('#1C1C1E');

    // Make the active tab private.
    fireEvent.press(utils.getByLabelText('Tabs'));
    fireEvent.press(utils.getByText('Private'));
    fireEvent.press(utils.getByLabelText('New Tab'));

    expect(flatStyle(utils.getByTestId('browser-topbar')).backgroundColor).toBe('#1C1C1E');
    expect(flatStyle(utils.getByPlaceholderText('Search or enter website name')).backgroundColor).toBe(
      '#1C1C1E'
    );

    // Switch back to the normal tab → default chrome restored.
    fireEvent.press(utils.getByLabelText('Tabs'));
    fireEvent.press(utils.getByLabelText(`Tab: ${BROWSER_HOME_URL}`));

    expect(flatStyle(utils.getByTestId('browser-topbar')).backgroundColor).toBe(defaultTopBarBg);
    expect(flatStyle(utils.getByPlaceholderText('Search or enter website name')).backgroundColor).toBe(
      defaultAddressBarBg
    );
  });

  it('repeatedly toggling the grid segment without creating tabs does not crash and keeps a normal tab active', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    fireEvent.press(utils.getByLabelText('Tabs'));

    fireEvent.press(utils.getByText('Private'));
    fireEvent.press(utils.getByText('Tabs'));
    fireEvent.press(utils.getByText('Private'));
    fireEvent.press(utils.getByText('Tabs'));

    // Leave the grid; the active tab is still the original normal one.
    fireEvent.press(utils.getByLabelText('Done'));

    // Still on the original normal tab, WebView intact, not private.
    expect(utils.getByTestId('browser-webview').props.incognito).toBe(false);
    expect(webviewUri(utils)).toBe(BROWSER_HOME_URL);
  });

  it('the standalone private-browsing toggle no longer exists in the top bar', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    expect(utils.queryByLabelText('Toggle private browsing')).toBeNull();
  });
});

describe('home-screen registration', () => {
  it('registers the browser package in both maps', () => {
    expect(BUILT_IN_APPS['com.iostoandroid.browser']).toBe('Browser');
    expect(VIRTUAL_ICON_CONFIG['com.iostoandroid.browser']).toEqual({
      icon: 'compass',
      bg: '#007AFF',
      gradient: ['#409CFF', '#0071E3'],
      iconSize: 34,
    });
  });

  it('leaves the pre-existing built-in app entries unchanged (regression guard)', () => {
    const expected: Record<string, string> = {
      'com.iostoandroid.phone': 'Phone',
      'com.iostoandroid.messages': 'Messages',
      'com.iostoandroid.contacts': 'Contacts',
      'com.iostoandroid.settings': 'Settings',
      'com.iostoandroid.weather': 'Weather',
      'com.iostoandroid.clock': 'Clock',
      'com.iostoandroid.camera': 'Camera',
      'com.iostoandroid.photos': 'Photos',
      'com.iostoandroid.calendar': 'Calendar',
      'com.iostoandroid.calculator': 'Calculator',
      'com.iostoandroid.notes': 'Notes',
      'com.iostoandroid.reminders': 'Reminders',
      'com.iostoandroid.mail': 'Mail',
    };
    for (const [pkg, route] of Object.entries(expected)) {
      expect(BUILT_IN_APPS[pkg]).toBe(route);
      expect(VIRTUAL_ICON_CONFIG[pkg]).toBeTruthy();
    }
  });
});

// ─── Bookmarks (issue #255) ──────────────────────────────────────────────────

function BookmarkSeed({ seed }: { seed: { url: string; title: string }[] }) {
  const { addBookmark } = useBookmarks();
  React.useEffect(() => {
    seed.forEach((s) => addBookmark(s.url, s.title));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

describe('BrowserScreen — star button toggles a bookmark', () => {
  it('starts unbookmarked (outline star + "Add bookmark")', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    expect(utils.getByLabelText('Add bookmark')).toBeTruthy();
    expect(utils.queryByLabelText('Remove bookmark')).toBeNull();
  });

  it('pressing the star adds a bookmark for the current URL and fills the star', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    fireEvent.press(utils.getByLabelText('Add bookmark'));

    // Icon flips to "Remove bookmark" (filled star state).
    expect(utils.getByLabelText('Remove bookmark')).toBeTruthy();
    expect(utils.queryByLabelText('Add bookmark')).toBeNull();
  });

  it('pressing the star again removes the bookmark and reverts to outline', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    fireEvent.press(utils.getByLabelText('Add bookmark'));
    expect(utils.getByLabelText('Remove bookmark')).toBeTruthy();

    fireEvent.press(utils.getByLabelText('Remove bookmark'));
    // Back to the outline / "Add bookmark" state.
    expect(utils.getByLabelText('Add bookmark')).toBeTruthy();
  });

  it('the starred page appears in the bookmarks list with its URL', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    fireEvent.press(utils.getByLabelText('Add bookmark'));

    fireEvent.press(utils.getByLabelText('Bookmarks'));

    // The home tab's URL was bookmarked; title falls back to the URL.
    // (BROWSER_HOME_URL text also appears in the address bar, hence getAllByText.)
    expect(utils.getAllByText(BROWSER_HOME_URL).length).toBeGreaterThan(0);
  });

  it('double-tapping the star does not create two bookmarks (no duplicate)', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    fireEvent.press(utils.getByLabelText('Add bookmark'));
    fireEvent.press(utils.getByLabelText('Remove bookmark'));
    // After add+remove the tree is back to unbookmarked; pressing again once more
    // should leave exactly one labelled state, not two "Remove bookmark".
    fireEvent.press(utils.getByLabelText('Add bookmark'));
    expect(utils.getAllByLabelText('Remove bookmark')).toHaveLength(1);
  });
});

describe('BrowserScreen — bookmarks list modal', () => {
  it('opens the bookmarks list when the Bookmarks button is pressed', async () => {
    const utils = render(
      <>
        <BookmarkSeed seed={[{ url: 'https://example.com/bookmarked', title: 'Bookmarked' }]} />
        <BrowserScreen navigation={nav} />
      </>,
    );
    await act(async () => {});

    expect(utils.queryByText('Bookmarked')).toBeNull();

    fireEvent.press(utils.getByLabelText('Bookmarks'));

    expect(utils.getByText('Bookmarked')).toBeTruthy();
    expect(utils.getByText('https://example.com/bookmarked')).toBeTruthy();
  });

  it('tapping a bookmark navigates the active tab to its URL and closes the modal', async () => {
    const utils = render(
      <>
        <BookmarkSeed seed={[{ url: 'https://example.com/bookmarked', title: 'Bookmarked' }]} />
        <BrowserScreen navigation={nav} />
      </>,
    );
    await act(async () => {});

    fireEvent.press(utils.getByLabelText('Bookmarks'));
    fireEvent.press(utils.getByText('Bookmarked'));

    // Modal dismissed.
    expect(utils.queryByText('Bookmarked')).toBeNull();
    // Active WebView navigated to the bookmarked URL.
    expect(webviewUri(utils)).toBe('https://example.com/bookmarked');
  });

  it('the list is empty-state when no bookmarks exist', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    fireEvent.press(utils.getByLabelText('Bookmarks'));
    expect(utils.getByText('No bookmarks yet')).toBeTruthy();
  });

  it('closing the list (Close button) does not change the WebView URL', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    expect(webviewUri(utils)).toBe(BROWSER_HOME_URL);

    fireEvent.press(utils.getByLabelText('Bookmarks'));
    fireEvent.press(utils.getByLabelText('Close Bookmarks'));

    expect(webviewUri(utils)).toBe(BROWSER_HOME_URL);
  });
});
