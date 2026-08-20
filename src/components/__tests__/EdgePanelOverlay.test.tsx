import React from 'react';
import { Text } from 'react-native';
import { render } from '../../test-utils';
import { EdgePanelOverlay } from '../EdgePanelOverlay';

const mockZone = { top: 0, bottom: 50, left: 200, right: 390 };

describe('EdgePanelOverlay', () => {
  it('renders children inside the panel sheet', () => {
    // Red step: remove {children} from EdgePanelOverlay's Animated.View → no Text nodes with
    // "Control Center" exist. Sheet has display:none at rest (panelProgress=0), so we query
    // through the tree with UNSAFE_getAllByType to reach all mounted nodes.
    const { UNSAFE_getAllByType } = render(
      <EdgePanelOverlay
        zone={mockZone}
        onCommit={jest.fn()}
        sheetHeightFraction={0.55}
        commitPredicate={() => 'none'}
      >
        <Text>Control Center</Text>
      </EdgePanelOverlay>,
    );

    const texts = UNSAFE_getAllByType(Text);
    const labels = texts.map((t) => t.props.children);
    expect(labels).toContain('Control Center');
  });

  it('renders different children for the NotificationCenter variant', () => {
    const { UNSAFE_getAllByType } = render(
      <EdgePanelOverlay
        zone={mockZone}
        onCommit={jest.fn()}
        sheetHeightFraction={0.65}
        commitPredicate={() => 'none'}
      >
        <Text>Notification Center</Text>
      </EdgePanelOverlay>,
    );

    const texts = UNSAFE_getAllByType(Text);
    const labels = texts.map((t) => t.props.children);
    expect(labels).toContain('Notification Center');
  });
});
