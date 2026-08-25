import React from 'react';
import * as RL from '../../utils/useResponsiveLayout';
import { render, within } from '../../test-utils';
import { SettingsScreen } from '../SettingsScreen';

// Drive the responsive switch by controlling the layout hook (the same width
// class the real device emits). The classifier itself is covered deterministically
// in useResponsiveLayout.test.ts; here we verify SettingsScreen wires the
// regular/compact class to the sidebar without altering the phone body.
function setLayout(layout: 'compact' | 'regular') {
  jest.spyOn(RL, 'useResponsiveLayout').mockReturnValue({
    layout,
    isTablet: layout === 'regular',
    width: layout === 'regular' ? 820 : 390,
    height: 1180,
  });
}

describe('SettingsScreen responsive layout (issue #633)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the sidebar master column on regular (tablet) width', () => {
    setLayout('regular');
    const { getByTestId, getByText } = render(<SettingsScreen />);
    expect(getByTestId('split-sidebar')).toBeTruthy();
    // Sidebar group headers from the issue: General / Privacy / Automation.
    const sidebar = within(getByTestId('settings-sidebar'));
    // "General" appears both as a group header and as the General item → at least 2.
    expect(sidebar.getAllByText('General').length).toBeGreaterThanOrEqual(2);
    expect(sidebar.getByText('Privacy')).toBeTruthy();
    expect(sidebar.getByText('Automation')).toBeTruthy();
    // Content pane still renders the settings list.
    expect(getByTestId('split-content')).toBeTruthy();
    expect(getByText('Wi-Fi')).toBeTruthy();
  });

  it('hides the sidebar on compact (phone) width — single pane, body untouched', () => {
    setLayout('compact');
    const { queryByTestId, getByText } = render(<SettingsScreen />);
    expect(queryByTestId('split-sidebar')).toBeNull();
    // Phone body is unchanged: every top-level setting still renders.
    expect(getByText('Wi-Fi')).toBeTruthy();
    expect(getByText('General')).toBeTruthy();
    expect(getByText('Battery')).toBeTruthy();
  });
});
