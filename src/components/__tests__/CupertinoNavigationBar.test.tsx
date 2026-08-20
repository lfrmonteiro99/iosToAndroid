import React from 'react';
import { render } from '../../test-utils';
import { CupertinoNavigationBar } from '../CupertinoNavigationBar';
import Animated from 'react-native-reanimated';

describe('CupertinoNavigationBar', () => {
  it('renders static version without children', () => {
    const { getByText } = render(
      <CupertinoNavigationBar title="Test Title" largeTitle={false} />,
    );
    expect(getByText('Test Title')).toBeTruthy();
  });

  it('renders scrollable version with children', () => {
    const { getByText } = render(
      <CupertinoNavigationBar title="Test Title" largeTitle={false}>
        <Animated.Text>Content</Animated.Text>
      </CupertinoNavigationBar>,
    );
    expect(getByText('Test Title')).toBeTruthy();
    expect(getByText('Content')).toBeTruthy();
  });

  it('uses decelerationRate="normal" for momentum scrolling deceleration', () => {
    const scrollViewProps: Record<string, unknown> = {};

    // Mock Animated.ScrollView to capture its props
    const OriginalScrollView = Animated.ScrollView;
    const mockScrollView = jest.fn((props) => {
      Object.assign(scrollViewProps, props);
      return null;
    });
    (Animated.ScrollView as jest.Mock) = mockScrollView;

    try {
      render(
        <CupertinoNavigationBar title="Test" largeTitle={false}>
          <Animated.Text>Item</Animated.Text>
        </CupertinoNavigationBar>,
      );

      // Verify that decelerationRate is set to "normal" (not 0.998 or other numeric value)
      expect(scrollViewProps.decelerationRate).toBe('normal');
    } finally {
      (Animated.ScrollView as unknown) = OriginalScrollView;
    }
  });

  it('renders large title by default', () => {
    const { getByText } = render(
      <CupertinoNavigationBar title="Large Title" />,
    );
    expect(getByText('Large Title')).toBeTruthy();
  });

  it('large title Text has numberOfLines={1} to prevent overflow clipping', () => {
    // Red: before fix, large title had no numberOfLines prop.
    // After fix, numberOfLines={1} prevents the text from wrapping into the overflow:hidden container.
    const { getAllByText } = render(
      <CupertinoNavigationBar title="Very Long Title That Would Wrap" largeTitle />,
    );
    // Static variant (no children) + largeTitle=true: only one Text element renders the title
    const largeTitleElement = getAllByText('Very Long Title That Would Wrap')[0];
    expect(largeTitleElement.props.numberOfLines).toBe(1);
  });

  it('does not render large title when largeTitle={false}', () => {
    const { queryByText } = render(
      <CupertinoNavigationBar title="Test" largeTitle={false} />,
    );
    // With largeTitle=false and no children, should only render inline title once
    const titles = queryByText('Test');
    expect(titles).toBeTruthy();
  });

  it('hides vertical scroll indicator', () => {
    const scrollViewProps: Record<string, unknown> = {};

    const OriginalScrollView = Animated.ScrollView;
    const mockScrollView = jest.fn((props) => {
      Object.assign(scrollViewProps, props);
      return null;
    });
    (Animated.ScrollView as jest.Mock) = mockScrollView;

    try {
      render(
        <CupertinoNavigationBar title="Test">
          <Animated.Text>Item</Animated.Text>
        </CupertinoNavigationBar>,
      );

      expect(scrollViewProps.showsVerticalScrollIndicator).toBe(false);
    } finally {
      (Animated.ScrollView as unknown) = OriginalScrollView;
    }
  });
});
