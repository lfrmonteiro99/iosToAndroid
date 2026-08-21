import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { BrowserTabGrid, BrowserTab } from '../BrowserTabGrid';

const TABS: BrowserTab[] = [
  { id: 'a', url: 'https://example.com', title: 'Example Domain', isPrivate: false },
  { id: 'b', url: 'https://www.google.com', title: '', isPrivate: false },
  {
    id: 'c',
    url: 'https://very-long-domain-name-that-should-be-truncated-eventually.example.com/some/deep/path',
    title: '',
    isPrivate: false,
  },
  { id: 'p1', url: 'https://private.example.com', title: 'Private One', isPrivate: true },
  { id: 'p2', url: 'https://secret.example.com', title: '', isPrivate: true },
];

function makeHandlers() {
  return {
    onSelectTab: jest.fn(),
    onNewTab: jest.fn(),
    onCloseTab: jest.fn(),
  };
}

describe('BrowserTabGrid', () => {
  it('renders one card per tab, showing title and url', () => {
    const handlers = makeHandlers();
    const utils = render(<BrowserTabGrid tabs={TABS} activeTabId="a" {...handlers} />);
    expect(utils.getByLabelText('Tab: Example Domain')).toBeTruthy();
    expect(utils.getByText('Example Domain')).toBeTruthy();
    expect(utils.getByText('https://example.com')).toBeTruthy();
  });

  it('falls back to the url as the accessible label when a tab has no title', () => {
    const handlers = makeHandlers();
    const utils = render(<BrowserTabGrid tabs={TABS} activeTabId="a" {...handlers} />);
    expect(utils.getByLabelText('Tab: https://www.google.com')).toBeTruthy();
  });

  it('truncates a very long url so it does not overflow the card', () => {
    const handlers = makeHandlers();
    const utils = render(<BrowserTabGrid tabs={TABS} activeTabId="a" {...handlers} />);
    const rendered = utils.getByText(/…$/);
    expect(rendered).toBeTruthy();
    const text = rendered.props.children as string;
    expect(text.length).toBeLessThan(TABS[2].url.length);
  });

  it('renders a "+ New Tab" affordance', () => {
    const handlers = makeHandlers();
    const utils = render(<BrowserTabGrid tabs={TABS} activeTabId="a" {...handlers} />);
    expect(utils.getByLabelText('New Tab')).toBeTruthy();
  });

  it('pressing "+ New Tab" calls onNewTab', () => {
    const handlers = makeHandlers();
    const utils = render(<BrowserTabGrid tabs={TABS} activeTabId="a" {...handlers} />);
    fireEvent.press(utils.getByLabelText('New Tab'));
    expect(handlers.onNewTab).toHaveBeenCalledTimes(1);
  });

  it('tapping a tab card calls onSelectTab with that tab id', () => {
    const handlers = makeHandlers();
    const utils = render(<BrowserTabGrid tabs={TABS} activeTabId="a" {...handlers} />);
    fireEvent.press(utils.getByLabelText('Tab: https://www.google.com'));
    expect(handlers.onSelectTab).toHaveBeenCalledWith('b');
    expect(handlers.onSelectTab).toHaveBeenCalledTimes(1);
  });

  it('tapping the close affordance on a card calls onCloseTab, not onSelectTab', () => {
    const handlers = makeHandlers();
    const utils = render(<BrowserTabGrid tabs={TABS} activeTabId="a" {...handlers} />);
    fireEvent.press(utils.getByLabelText('Close tab: Example Domain'));
    expect(handlers.onCloseTab).toHaveBeenCalledWith('a');
    expect(handlers.onSelectTab).not.toHaveBeenCalled();
  });

  it('renders nothing but the New Tab affordance when there are no tabs (empty grid)', () => {
    const handlers = makeHandlers();
    const utils = render(<BrowserTabGrid tabs={[]} activeTabId="" {...handlers} />);
    expect(utils.getByLabelText('New Tab')).toBeTruthy();
    expect(utils.queryByLabelText(/^Tab: /)).toBeNull();
  });

  it('renders a segmented control with Tabs / Private segments', () => {
    const handlers = makeHandlers();
    const utils = render(<BrowserTabGrid tabs={TABS} activeTabId="a" {...handlers} />);
    expect(utils.getByText('Tabs')).toBeTruthy();
    expect(utils.getByText('Private')).toBeTruthy();
  });

  it('filters the shown tabs by isPrivate: "Private" segment shows only private tabs', () => {
    const handlers = makeHandlers();
    const utils = render(<BrowserTabGrid tabs={TABS} activeTabId="a" {...handlers} />);

    // Default segment is "Tabs" (index 0) → only non-private tabs visible.
    expect(utils.getByLabelText('Tab: Example Domain')).toBeTruthy();
    expect(utils.queryByLabelText('Tab: Private One')).toBeNull();

    // Switch to the "Private" segment.
    fireEvent.press(utils.getByText('Private'));

    // Now only private tabs are visible; the normal tabs are hidden.
    expect(utils.getByLabelText('Tab: Private One')).toBeTruthy();
    expect(utils.queryByLabelText('Tab: Example Domain')).toBeNull();
    expect(utils.queryByLabelText('Tab: https://www.google.com')).toBeNull();
  });

  it('returns to showing normal tabs when switching back to "Tabs" from "Private"', () => {
    const handlers = makeHandlers();
    const utils = render(<BrowserTabGrid tabs={TABS} activeTabId="a" {...handlers} />);

    fireEvent.press(utils.getByText('Private'));
    expect(utils.queryByLabelText('Tab: Example Domain')).toBeNull();

    fireEvent.press(utils.getByText('Tabs'));
    expect(utils.getByLabelText('Tab: Example Domain')).toBeTruthy();
    expect(utils.queryByLabelText('Tab: Private One')).toBeNull();
  });

  it('"+ New Tab" on the "Private" segment passes isPrivate=true', () => {
    const handlers = makeHandlers();
    const utils = render(<BrowserTabGrid tabs={TABS} activeTabId="a" {...handlers} />);

    fireEvent.press(utils.getByText('Private'));
    fireEvent.press(utils.getByLabelText('New Tab'));

    expect(handlers.onNewTab).toHaveBeenCalledTimes(1);
    expect(handlers.onNewTab).toHaveBeenCalledWith(true);
  });

  it('"+ New Tab" on the "Tabs" (default) segment passes isPrivate=false', () => {
    const handlers = makeHandlers();
    const utils = render(<BrowserTabGrid tabs={TABS} activeTabId="a" {...handlers} />);

    fireEvent.press(utils.getByLabelText('New Tab'));

    expect(handlers.onNewTab).toHaveBeenCalledTimes(1);
    expect(handlers.onNewTab).toHaveBeenCalledWith(false);
  });

  it('toggling the segment repeatedly without creating tabs preserves the active tab id', () => {
    const handlers = makeHandlers();
    const utils = render(<BrowserTabGrid tabs={TABS} activeTabId="a" {...handlers} />);

    fireEvent.press(utils.getByText('Private'));
    fireEvent.press(utils.getByText('Tabs'));
    fireEvent.press(utils.getByText('Private'));
    fireEvent.press(utils.getByText('Tabs'));

    // No crash, no new-tab callback, active tab unchanged.
    expect(handlers.onNewTab).not.toHaveBeenCalled();
    expect(handlers.onSelectTab).not.toHaveBeenCalled();
  });

  it('does not crash (and shows only New Tab) when the active segment has no matching tabs', () => {
    // All-private list, but the default segment is "Tabs" → empty grid, no crash.
    const privateOnly: BrowserTab[] = [
      { id: 'p1', url: 'https://private.example.com', title: 'Private One', isPrivate: true },
    ];
    const handlers = makeHandlers();
    const utils = render(<BrowserTabGrid tabs={privateOnly} activeTabId="p1" {...handlers} />);

    // Default "Tabs" segment shows nothing (no normal tabs).
    expect(utils.queryByLabelText(/^Tab: /)).toBeNull();
    expect(utils.getByLabelText('New Tab')).toBeTruthy();

    // Switching to "Private" reveals the single private tab — no crash.
    fireEvent.press(utils.getByText('Private'));
    expect(utils.getByLabelText('Tab: Private One')).toBeTruthy();
  });
});
