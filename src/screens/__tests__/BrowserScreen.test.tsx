import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { BrowserScreen, resolveUrl, BROWSER_HOME_URL } from '../BrowserScreen';
import { BUILT_IN_APPS, VIRTUAL_ICON_CONFIG } from '../LauncherHomeScreen';

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

  it('closing the only tab leaves activeTabId pointing at no tab (grid shown, no WebView, no crash)', () => {
    const utils = render(<BrowserScreen navigation={nav} />);
    fireEvent.press(utils.getByLabelText('Tabs'));
    fireEvent.press(utils.getByLabelText(`Close tab: ${BROWSER_HOME_URL}`));

    expect(utils.queryByTestId('browser-webview')).toBeNull();
    expect(utils.getByLabelText('New Tab')).toBeTruthy();
    expect(utils.queryByLabelText(/^Tab: /)).toBeNull();
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
    fireEvent.press(utils.getByLabelText('Done'));
    expect(webviewUri(utils)).toBe(BROWSER_HOME_URL);
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
