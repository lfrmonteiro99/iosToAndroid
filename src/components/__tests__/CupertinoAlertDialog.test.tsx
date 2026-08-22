import React from 'react';
import { Text } from 'react-native';
import { render } from '../../test-utils';
import { CupertinoAlertDialog } from '../CupertinoAlertDialog';
import { Shape } from '../../theme/CupertinoTheme';

function flattenStyle(style: unknown): Record<string, unknown>[] {
  if (Array.isArray(style)) return style.flat(Infinity).filter(Boolean) as Record<string, unknown>[];
  return style ? [style as Record<string, unknown>] : [];
}

describe('CupertinoAlertDialog', () => {
  it('renders action labels with numberOfLines={1} to prevent overflow', () => {
    const { UNSAFE_getAllByType } = render(
      <CupertinoAlertDialog
        visible
        onClose={jest.fn()}
        title="Confirm Action"
        message="Are you sure?"
        actions={[
          { label: 'Dismiss', onPress: jest.fn(), style: 'cancel' },
          { label: 'Proceed', onPress: jest.fn(), style: 'destructive' },
        ]}
      />,
    );

    const texts = UNSAFE_getAllByType(Text);
    const actionLabels = texts.filter(
      (t) => t.props.children === 'Dismiss' || t.props.children === 'Proceed',
    );

    expect(actionLabels).toHaveLength(2);
    actionLabels.forEach((label) => {
      expect(label.props.numberOfLines).toBe(1);
    });
  });

  // #481: the alert dialog is a "cartão" surface per §1.6 and must consume
  // Shape.card (10), not the old BorderRadius.card14 (14).
  it('renders the dialog at the Shape.card radius (10)', () => {
    const { getByTestId } = render(
      <CupertinoAlertDialog
        visible
        onClose={jest.fn()}
        title="Confirm Action"
        actions={[{ label: 'OK', onPress: jest.fn() }]}
      />,
    );

    const dialog = getByTestId('alert-dialog');
    const flat = flattenStyle(dialog.props.style);
    const radiusStyle = flat.find((s) => 'borderRadius' in s) as { borderRadius: number } | undefined;

    expect(radiusStyle).toBeDefined();
    expect(radiusStyle?.borderRadius).toBe(Shape.card.radius);
    expect(radiusStyle?.borderRadius).toBe(10);
  });
});
