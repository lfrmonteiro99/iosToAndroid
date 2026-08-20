import React from 'react';
import { Text } from 'react-native';
import { render } from '../../test-utils';
import { CupertinoAlertDialog } from '../CupertinoAlertDialog';

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
});
