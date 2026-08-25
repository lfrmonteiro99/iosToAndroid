import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, act } from '../../test-utils';
import { SmartStack } from '../SmartStack';

// iOS chrome (page dots + edit button) and per-widget accessibility live on
// the SmartStack component itself. These tests exercise the REAL component —
// no re-implementation of the dot/label logic here.
function threeItems() {
  return [
    { key: 'a', node: <Text>Widget A</Text> },
    { key: 'b', node: <Text>Widget B</Text> },
    { key: 'c', node: <Text>Widget C</Text> },
  ];
}

describe('<SmartStack /> iOS UI chrome', () => {
  it('renders exactly one page dot per widget', () => {
    const { getByTestId, queryAllByTestId } = render(<SmartStack items={threeItems()} testID="stack" />);
    expect(getByTestId('stack-dots')).toBeTruthy();
    expect(queryAllByTestId('stack-dot')).toHaveLength(3);
  });

  it('marks the top widget\'s dot as active and tracks the active dot as it auto-rotates', () => {
    jest.useFakeTimers();
    try {
      const { getByTestId } = render(
        <SmartStack items={threeItems()} autoRotateIntervalMs={1000} testID="stack" />,
      );
      // Initially 'a' is on top -> its dot is the active one.
      expect(getByTestId('stack-dot-active').props['data-key']).toBe('a');

      // Advance the auto-rotate timer past one interval: now 'b' is on top.
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(getByTestId('stack-dot-active').props['data-key']).toBe('b');

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(getByTestId('stack-dot-active').props['data-key']).toBe('c');
    } finally {
      jest.useRealTimers();
    }
  });

  it('renders no page dots for an empty stack', () => {
    const { queryByTestId } = render(<SmartStack items={[]} testID="stack" />);
    expect(queryByTestId('stack-dots')).toBeNull();
  });

  it('renders an edit button only when onEditStack is provided', () => {
    const { queryByTestId } = render(<SmartStack items={threeItems()} testID="stack" />);
    expect(queryByTestId('stack-edit')).toBeNull();

    const onEditStack = jest.fn();
    const { getByTestId } = render(
      <SmartStack items={threeItems()} onEditStack={onEditStack} testID="stack" />,
    );
    const btn = getByTestId('stack-edit');
    expect(btn).toBeTruthy();
    expect(btn.props.accessibilityLabel).toBe('Edit stack');
    fireEvent.press(btn);
    expect(onEditStack).toHaveBeenCalledTimes(1);
  });

  it('exposes a distinct accessibilityLabel for each widget in the stack (top + peeking layers)', () => {
    const { getByTestId } = render(
      <SmartStack
        items={threeItems()}
        accessibilityLabels={{ a: 'Battery widget', b: 'Weather widget', c: 'Storage widget' }}
        testID="stack"
      />,
    );
    // Top layer carries its own label.
    expect(getByTestId('stack-top').props.accessibilityLabel).toBe('Battery widget');
    // Each peeking back layer also carries its own label.
    expect(getByTestId('stack-layer-b').props.accessibilityLabel).toBe('Weather widget');
    expect(getByTestId('stack-layer-c').props.accessibilityLabel).toBe('Storage widget');
  });

  it('falls back to a generic per-key label when no accessibilityLabels map is supplied', () => {
    const { getByTestId } = render(
      <SmartStack items={threeItems()} testID="stack" />,
    );
    expect(getByTestId('stack-top').props.accessibilityLabel).toBe('Widget a');
    expect(getByTestId('stack-layer-b').props.accessibilityLabel).toBe('Widget b');
  });
});
