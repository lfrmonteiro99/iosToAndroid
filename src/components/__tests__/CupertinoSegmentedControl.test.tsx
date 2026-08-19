import React from 'react';
import * as Reanimated from 'react-native-reanimated';
import { render, fireEvent } from '../../test-utils';
import { CupertinoSegmentedControl } from '../CupertinoSegmentedControl';

/**
 * Fires the `onLayout` of the control's root view, which is what populates
 * `containerWidth` in the component. Without this the component never leaves
 * `containerWidth === 0` and the whole segWidth branch is dead code.
 */
function layout(node: unknown, width: number) {
  fireEvent(node as never, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height: 32 } },
  });
}

describe('CupertinoSegmentedControl', () => {
  let withSpringSpy: jest.SpyInstance;
  let sharedValueSpy: jest.SpyInstance;

  beforeEach(() => {
    withSpringSpy = jest.spyOn(Reanimated, 'withSpring');
    // The reanimated test double hands back a fresh object on every call, so
    // the only way to see what the effect wrote is to keep every object it
    // ever returned.
    sharedValueSpy = jest.spyOn(Reanimated, 'useSharedValue');
  });

  afterEach(() => {
    withSpringSpy.mockRestore();
    sharedValueSpy.mockRestore();
  });

  /** Every value handed to `withSpring` as the animation target. */
  const springTargets = () => withSpringSpy.mock.calls.map((call) => call[0]);

  /** Everything ever written to a shared value, across all renders. */
  const sharedValues = () =>
    sharedValueSpy.mock.results.map((result) => (result.value as { value: unknown }).value);

  /**
   * The component calls `useSharedValue` twice per render, translateX first and
   * animatedWidth second, so the last result belongs to the animated width of
   * the most recent render.
   */
  const latestAnimatedWidth = () => sharedValues().slice(-1)[0];

  it('renders every segment and reports the pressed index', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <CupertinoSegmentedControl
        values={['Option A', 'Option B', 'Option C']}
        selectedIndex={0}
        onChange={onChange}
      />
    );

    expect(getByText('Option A')).toBeTruthy();
    expect(getByText('Option B')).toBeTruthy();
    expect(getByText('Option C')).toBeTruthy();

    fireEvent.press(getByText('Option C'));
    expect(onChange).toHaveBeenCalledWith(2);

    // Pressing the same segment twice must report it twice, not swallow the
    // second press (double-tap is a recurring defect in this codebase).
    fireEvent.press(getByText('Option C'));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(2, 2);
  });

  it('does not crash when pressed without an onChange handler', () => {
    const { getByText } = render(
      <CupertinoSegmentedControl values={['Solo']} selectedIndex={0} />
    );

    expect(() => fireEvent.press(getByText('Solo'))).not.toThrow();
  });

  // The inverse of the fix: an empty control must stay invisible. This guard
  // already existed on main; it is asserted here so the segWidth fix below
  // cannot be "fixed" by making the empty control render something.
  it('renders nothing when values is empty', () => {
    const { toJSON } = render(
      <CupertinoSegmentedControl values={[]} selectedIndex={0} onChange={jest.fn()} />
    );

    expect(toJSON()).toBeNull();
  });

  it('animates the thumb to the measured segment width once laid out', () => {
    const { root } = render(
      <CupertinoSegmentedControl
        values={['A', 'B', 'C']}
        selectedIndex={2}
        onChange={jest.fn()}
      />
    );

    // Before layout there is nothing to measure, so no animation may start.
    expect(withSpringSpy).not.toHaveBeenCalled();

    layout(root, 300);

    expect(springTargets()).toEqual([200]); // index 2 * (300 / 3)
  });

  it('does not animate while the container measures zero width', () => {
    const { root } = render(
      <CupertinoSegmentedControl values={['A', 'B']} selectedIndex={1} onChange={jest.fn()} />
    );

    layout(root, 0);

    // 0 / 2 === 0, but a spring towards 0 from an unmeasured control would
    // still be wrong: nothing has been measured yet.
    expect(withSpringSpy).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------
  // Issue #189 (M4). The `values.length === 0` early return already existed
  // and covers the *initial* mount. The defect that survives it is the
  // transition: a control that has already been measured and then loses its
  // values (a store that re-hydrates, a filter that empties a tab list).
  // The early return fires only AFTER the hooks, so the effect still runs
  // with `segWidth = containerWidth / 0 === Infinity` and poisons both
  // shared values on its way out.
  // ---------------------------------------------------------------------
  it('never targets a non-finite position when values empty after layout', () => {
    const { root, rerender } = render(
      <CupertinoSegmentedControl values={['A', 'B']} selectedIndex={1} onChange={jest.fn()} />
    );
    layout(root, 300);
    rerender(
      <CupertinoSegmentedControl values={[]} selectedIndex={1} onChange={jest.fn()} />
    );

    // selectedIndex 1 * Infinity === Infinity
    expect(springTargets().filter((target) => !Number.isFinite(target))).toEqual([]);

    // selectedIndex 0 * Infinity === NaN, a different poison value out of the
    // same division, so it is exercised explicitly.
    withSpringSpy.mockClear();
    const second = render(
      <CupertinoSegmentedControl values={['A', 'B']} selectedIndex={0} onChange={jest.fn()} />
    );
    layout(second.root, 300);
    second.rerender(
      <CupertinoSegmentedControl values={[]} selectedIndex={0} onChange={jest.fn()} />
    );

    expect(springTargets().filter((target) => !Number.isFinite(target))).toEqual([]);
  });

  it('never writes a non-finite width to the animated thumb when values empty', () => {
    const { root, rerender } = render(
      <CupertinoSegmentedControl values={['A', 'B']} selectedIndex={1} onChange={jest.fn()} />
    );
    layout(root, 300);
    rerender(
      <CupertinoSegmentedControl values={[]} selectedIndex={1} onChange={jest.fn()} />
    );

    // `animatedWidth` feeds the thumb's `width` style, which `useAnimatedStyle`
    // reads during render. A width written while empty is therefore what the
    // control carries into the next frame, hidden or not.
    expect(sharedValues().filter((value) => !Number.isFinite(value))).toEqual([]);
    expect(latestAnimatedWidth()).toBe(0);
  });

  it('still recomputes the segment width when values shrink to one', () => {
    const { root, rerender } = render(
      <CupertinoSegmentedControl values={['A', 'B', 'C']} selectedIndex={0} onChange={jest.fn()} />
    );
    layout(root, 300);
    rerender(
      <CupertinoSegmentedControl values={['A']} selectedIndex={0} onChange={jest.fn()} />
    );

    // Guarding the empty case must not turn every non-empty recomputation off:
    // one value must still claim the whole measured container.
    expect(latestAnimatedWidth()).toBe(300);
  });
});
