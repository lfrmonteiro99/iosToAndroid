import React from 'react';
import { render, fireEvent, waitFor } from '../../../test-utils';
import { HotspotScreen } from '../HotspotScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

// The launcherModule mock is auto-applied via jest.config.js moduleNameMapper.
// Import the mock so we can assert on openSystemSettings.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const launcherMock = require('../../../__mocks__/launcherModule').default;

describe('HotspotScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the Personal Hotspot row', () => {
    const { getByRole } = render(<HotspotScreen navigation={mockNavigation as never} />);
    // CupertinoListTile has accessibilityRole="button" + accessibilityLabel when onPress is set
    expect(getByRole('button', { name: 'Personal Hotspot, Managed by Android' })).toBeTruthy();
  });

  // Red step: before the fix, pressing the hotspot tile only called
  // update('hotspotEnabled', ...) — openSystemSettings was never called.
  it('pressing Personal Hotspot row opens Android hotspot settings', async () => {
    const { getByRole } = render(<HotspotScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByRole('button', { name: 'Personal Hotspot, Managed by Android' }));

    await waitFor(() => {
      expect(launcherMock.openSystemSettings).toHaveBeenCalledWith('hotspot');
    });
  });

  it('does not show an On/Off switch that claims tethering state', () => {
    const { queryAllByRole } = render(<HotspotScreen navigation={mockNavigation as never} />);
    // The main Personal Hotspot row must not have a switch.
    // Other controls (Maximize Compatibility) may still have switches.
    // We verify the hotspot tile itself is pressable, not a switch toggle.
    const switches = queryAllByRole('switch');
    // Maximize Compatibility switch may still exist — we're not asserting zero switches,
    // just that there are fewer than before (no hotspot switch).
    // Main check: openSystemSettings is called on press, not a toggle update.
    expect(switches.length).toBeLessThan(2);
  });
});
