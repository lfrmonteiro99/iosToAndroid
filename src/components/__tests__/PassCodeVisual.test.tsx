import React from 'react';
import { render } from '../../test-utils';
import { PassCodeVisual } from '../PassCodeVisual';

function getBarWidths(getAllByTestId: (id: RegExp | string) => Array<{ props: { style: unknown } }>) {
  return getAllByTestId(/^pass-code-bar-/).map((node) => {
    const styleValue = node.props.style;
    const styles: Array<Record<string, unknown>> = Array.isArray(styleValue)
      ? styleValue
      : [styleValue as Record<string, unknown>];
    const flatStyle = styles.reduce((acc, s) => ({ ...acc, ...s }), {} as Record<string, unknown>);
    return flatStyle.width;
  });
}

describe('PassCodeVisual', () => {
  it('produces the same bar widths across renders for the same code', () => {
    const { getAllByTestId, rerender } = render(<PassCodeVisual code="ABC123" />);
    const first = getBarWidths(getAllByTestId);

    rerender(<PassCodeVisual code="ABC123" />);
    const second = getBarWidths(getAllByTestId);

    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(0);
  });

  it('produces the same bar widths in a fresh mount for the same code (deterministic, not memoized)', () => {
    const { getAllByTestId, unmount } = render(<PassCodeVisual code="XYZ-999" />);
    const first = getBarWidths(getAllByTestId);
    unmount();

    const { getAllByTestId: getAllByTestId2 } = render(<PassCodeVisual code="XYZ-999" />);
    const second = getBarWidths(getAllByTestId2);

    expect(second).toEqual(first);
  });

  it('produces different widths for different codes (not a constant sequence)', () => {
    const { getAllByTestId } = render(<PassCodeVisual code="AAAAAA" />);
    const a = getBarWidths(getAllByTestId);

    const { getAllByTestId: getAllByTestId2 } = render(<PassCodeVisual code="ZZZZZZ" />);
    const b = getBarWidths(getAllByTestId2);

    expect(b).not.toEqual(a);
  });

  it('handles an empty code without crashing and stays deterministic', () => {
    const { getAllByTestId, rerender } = render(<PassCodeVisual code="" />);
    const first = getBarWidths(getAllByTestId);

    rerender(<PassCodeVisual code="" />);
    const second = getBarWidths(getAllByTestId);

    expect(second).toEqual(first);
  });
});
