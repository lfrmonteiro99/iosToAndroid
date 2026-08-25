import React from 'react';
import { Text } from 'react-native';
import { render } from '../../test-utils';
import { CupertinoSplitView } from '../CupertinoSplitView';

describe('CupertinoSplitView (spec §24 — tablet sidebar + content)', () => {
  it('renders content alone on compact (phone) layout — no sidebar pane', () => {
    const { getByTestId, queryByTestId } = render(
      <CupertinoSplitView
        forceLayout="compact"
        sidebar={<Text testID="sb">Sidebar</Text>}
        content={<Text testID="ct">Content</Text>}
      />,
    );
    expect(getByTestId('ct')).toBeTruthy();
    expect(queryByTestId('sb')).toBeNull();
    expect(queryByTestId('split-sidebar')).toBeNull();
    expect(queryByTestId('split-content')).toBeNull();
  });

  it('renders a stable sidebar next to the content on regular (tablet) layout', () => {
    const { getByTestId } = render(
      <CupertinoSplitView
        forceLayout="regular"
        sidebar={<Text testID="sb">Sidebar</Text>}
        content={<Text testID="ct">Content</Text>}
      />,
    );
    expect(getByTestId('split-sidebar')).toBeTruthy();
    expect(getByTestId('split-content')).toBeTruthy();
    expect(getByTestId('sb')).toBeTruthy();
    expect(getByTestId('ct')).toBeTruthy();
  });

  it('follows the live width class when forceLayout is omitted', () => {
    // Jest default window width is 750 (< 768) → compact, so no sidebar.
    const compact = render(
      <CupertinoSplitView
        sidebar={<Text testID="sb">Sidebar</Text>}
        content={<Text testID="ct">Content</Text>}
      />,
    );
    expect(compact.queryByTestId('split-sidebar')).toBeNull();
    expect(compact.getByTestId('ct')).toBeTruthy();
  });
});
