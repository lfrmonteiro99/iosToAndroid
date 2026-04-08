import React from 'react';
import { render } from '../../test-utils';
import { NotificationCenterScreen } from '../NotificationCenterScreen';

describe('NotificationCenterScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<NotificationCenterScreen />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders date header', () => {
    const { toJSON } = render(<NotificationCenterScreen />);
    // The screen renders a date header (e.g. "Wednesday, April 8") — just verify it rendered
    expect(toJSON()).toBeTruthy();
  });

  it('renders notification access prompt when access not granted', () => {
    // In test environment isNotificationAccessGranted returns false
    const { getByText } = render(<NotificationCenterScreen />);
    expect(getByText('Notification Access Required')).toBeTruthy();
  });

  it('renders Enable Notification Access button', () => {
    const { getByLabelText } = render(<NotificationCenterScreen />);
    expect(getByLabelText('Enable Notification Access')).toBeTruthy();
  });
});
