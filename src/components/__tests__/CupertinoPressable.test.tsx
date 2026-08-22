import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '../../test-utils';
import { CupertinoPressable } from '../CupertinoPressable';

// CupertinoPressable is the migration vehicle for issue #496: it wires the
// useCupertinoPress primitive (scale 0.96 / opacity 0.40, reduceMotion-aware)
// onto a Pressable so call sites stop hand-rolling `opacity: pressed ? N : 1`.
//
// The repo-wide reanimated mock runs useAnimatedStyle's factory once at render
// and collapses interpolate to identity, so these tests assert the *wiring and
// the layout contract* (which is what the migration can break); the numeric
// press curve is covered by src/hooks/__tests__/useCupertinoPress.test.tsx.

function stylesOf(el: { props: { style: unknown } }): Array<Record<string, unknown>> {
  const s = el.props.style;
  const flat = Array.isArray(s) ? s.flat(Infinity) : [s];
  return flat.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
}

describe('CupertinoPressable', () => {
  it('renders its children and keeps the static style on the pressable itself', () => {
    const { getByTestId, getByText } = render(
      <CupertinoPressable testID="p" style={{ paddingVertical: 11 }}>
        <Text>hello</Text>
      </CupertinoPressable>,
    );
    expect(getByText('hello')).toBeTruthy();
    // The layout style must stay on the pressable — sites relied on it for size.
    expect(stylesOf(getByTestId('p'))).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingVertical: 11 })]),
    );
  });

  it('does not wrap children in an extra view (layout tree unchanged)', () => {
    const { getByTestId } = render(
      <CupertinoPressable testID="p">
        <Text testID="child">x</Text>
      </CupertinoPressable>,
    );
    // The child is a direct child of the pressable.
    const pressable = getByTestId('p');
    const childIds = (pressable.children as Array<string | { props: { testID?: string } }>).map(
      (c) => (typeof c === 'string' ? c : c.props.testID),
    );
    expect(childIds).toContain('child');
  });

  it('exposes no `pressed`-derived opacity in its style (the ad hoc convention is gone)', () => {
    const { getByTestId } = render(
      <CupertinoPressable testID="p" style={{ opacity: 1 }}>
        <Text>x</Text>
      </CupertinoPressable>,
    );
    // The style prop is a plain array, never a ({pressed}) => ... callback.
    expect(typeof getByTestId('p').props.style).not.toBe('function');
  });

  it('still fires onPress, and forwards caller onPressIn/onPressOut alongside the animation', () => {
    const onPress = jest.fn();
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    const { getByTestId } = render(
      <CupertinoPressable
        testID="p"
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        <Text>x</Text>
      </CupertinoPressable>,
    );
    fireEvent(getByTestId('p'), 'pressIn');
    fireEvent(getByTestId('p'), 'pressOut');
    fireEvent.press(getByTestId('p'));
    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(onPressOut).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('works without any caller press handlers (no crash on press in/out)', () => {
    const { getByTestId } = render(
      <CupertinoPressable testID="p">
        <Text>x</Text>
      </CupertinoPressable>,
    );
    expect(() => {
      fireEvent(getByTestId('p'), 'pressIn');
      fireEvent(getByTestId('p'), 'pressOut');
    }).not.toThrow();
  });

  it('survives a double press-in followed by a single press-out (recurring defect here)', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <CupertinoPressable testID="p" onPress={onPress}>
        <Text>x</Text>
      </CupertinoPressable>,
    );
    expect(() => {
      fireEvent(getByTestId('p'), 'pressIn');
      fireEvent(getByTestId('p'), 'pressIn');
      fireEvent(getByTestId('p'), 'pressOut');
      fireEvent.press(getByTestId('p'));
      fireEvent.press(getByTestId('p'));
    }).not.toThrow();
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('when disabled, forwards disabled and does not call onPress (inverse of the fix)', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <CupertinoPressable testID="p" disabled onPress={onPress}>
        <Text>x</Text>
      </CupertinoPressable>,
    );
    expect(getByTestId('p').props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(getByTestId('p'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('forwards accessibility props untouched', () => {
    const { getByLabelText } = render(
      <CupertinoPressable accessibilityRole="button" accessibilityLabel="Do it">
        <Text>x</Text>
      </CupertinoPressable>,
    );
    expect(getByLabelText('Do it')).toBeTruthy();
  });

  it('accepts an empty children set without throwing', () => {
    expect(() => render(<CupertinoPressable testID="p" />)).not.toThrow();
  });
});
