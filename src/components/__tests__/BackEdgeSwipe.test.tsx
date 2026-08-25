import React from 'react';
import { Text } from 'react-native';
import { render } from '../../test-utils';

const mockCanGoBack = jest.fn(() => true);
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ canGoBack: mockCanGoBack, goBack: jest.fn(), navigate: jest.fn() }),
}));

// The real component resolves a native view manager that only exists on a
// device; here it is replaced by a marker so we can assert BackEdgeSwipe mounts
// IT for the edge catcher, and not a plain <View>.
jest.mock('../GestureExclusionView', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return {
    GestureExclusionView: (props: Record<string, unknown>) =>
      ReactActual.createElement(RN.View, { testID: 'gesture-exclusion', ...props }),
  };
});

import { BackEdgeSwipe } from '../BackEdgeSwipe';
import { gestureConfig } from '../../utils/gestureConfig';

// The edge catcher is deliberately hidden from accessibility
// (importantForAccessibility="no-hide-descendants"), so queries must opt in.
const HIDDEN = { includeHiddenElements: true } as const;

describe('BackEdgeSwipe system gesture exclusion', () => {
  beforeEach(() => {
    mockCanGoBack.mockReturnValue(true);
  });

  it('renders the edge catcher as the gesture-exclusion view when it can go back', () => {
    const { getByTestId } = render(
      <BackEdgeSwipe>
        <Text>child</Text>
      </BackEdgeSwipe>,
    );
    expect(getByTestId('gesture-exclusion', HIDDEN)).toBeTruthy();
  });

  it('gives the exclusion view the full-height left edge strip', () => {
    const { getByTestId } = render(
      <BackEdgeSwipe>
        <Text>child</Text>
      </BackEdgeSwipe>,
    );
    const style = getByTestId('gesture-exclusion', HIDDEN).props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
    expect(flat).toMatchObject({
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: gestureConfig.leftEdgeWidthDp,
    });
  });

  // Inverse of the fix: nothing may be excluded on screens with no back target,
  // otherwise we would steal the system gesture on root screens for nothing.
  it('renders no exclusion view when there is nothing to go back to', () => {
    mockCanGoBack.mockReturnValue(false);
    const { queryByTestId, getByText } = render(
      <BackEdgeSwipe>
        <Text>child</Text>
      </BackEdgeSwipe>,
    );
    expect(queryByTestId('gesture-exclusion', HIDDEN)).toBeNull();
    expect(getByText('child')).toBeTruthy();
  });

  // Repetition: mounting twice (screen pushed, popped, pushed again) must keep
  // producing exactly one exclusion strip, never zero and never a duplicate.
  it('mounts exactly one exclusion view per render, twice in a row', () => {
    const first = render(
      <BackEdgeSwipe>
        <Text>child</Text>
      </BackEdgeSwipe>,
    );
    expect(first.getAllByTestId('gesture-exclusion', HIDDEN)).toHaveLength(1);
    first.unmount();
    const second = render(
      <BackEdgeSwipe>
        <Text>child</Text>
      </BackEdgeSwipe>,
    );
    expect(second.getAllByTestId('gesture-exclusion', HIDDEN)).toHaveLength(1);
  });

  it('keeps rendering children alongside the exclusion view', () => {
    const { getByText } = render(
      <BackEdgeSwipe>
        <Text>child</Text>
      </BackEdgeSwipe>,
    );
    expect(getByText('child')).toBeTruthy();
  });
});
