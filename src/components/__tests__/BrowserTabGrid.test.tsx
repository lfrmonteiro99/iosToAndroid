import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { BrowserTabGrid, BrowserTab } from '../BrowserTabGrid';

const TABS: BrowserTab[] = [
  { id: 'a', url: 'https://example.com', title: 'Example Domain' },
  { id: 'b', url: 'https://www.google.com', title: '' },
  { id: 'c', url: 'https://very-long-domain-name-that-should-be-truncated-eventually.example.com/some/deep/path', title: '' },
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
});
