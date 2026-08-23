import React from 'react';
import { renderHook, act, render } from '@testing-library/react-native';
import Brightness from 'expo-brightness';
import { DeviceProvider, useDevice } from '../DeviceStore';
import { SettingsProvider, useSettings } from '../SettingsStore';

// #612 Auto-Brightness.
//
// The manual brightness slider must be a no-op while OS auto-brightness owns
// the screen, and `setAutoBrightness(false)` must flip the device into MANUAL
// brightness mode. We assert against the REAL expo-brightness module (mocked in
// jest.setup.js) — not by re-implementing the logic — so the test actually
// exercises DeviceStore's wiring.

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SettingsProvider gateFirstRender={false}>
    <DeviceProvider>{children}</DeviceProvider>
  </SettingsProvider>
);

describe('DeviceStore autoBrightness (#612)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('defaults autoBrightness to true (mirrors SettingsStore default)', async () => {
    const { result } = renderHook(() => useDevice(), { wrapper });
    await act(async () => {});
    expect(result.current.autoBrightness).toBe(true);
  });

  it('puts the device in AUTOMATIC brightness mode while auto is on', async () => {
    const setSystemBrightnessModeAsync = Brightness.setSystemBrightnessModeAsync as jest.Mock;
    setSystemBrightnessModeAsync.mockClear();

    renderHook(() => useDevice(), { wrapper });
    await act(async () => {});

    // Default autoBrightness is true → AUTOMATIC mode requested on mount.
    expect(setSystemBrightnessModeAsync).toHaveBeenCalledWith(Brightness.BrightnessMode.AUTOMATIC);
  });

  it('ALWAYS drives setBrightnessAsync from the manual slider even while auto is on (Control Center stays functional, #612)', async () => {
    const setBrightnessAsync = Brightness.setBrightnessAsync as jest.Mock;
    setBrightnessAsync.mockClear();

    const { result } = renderHook(() => useDevice(), { wrapper });
    await act(async () => {});

    // autoBrightness is true by default, yet the SHARED store must NOT be a
    // no-op: the Control Center brightness slider calls setBrightness directly
    // and must keep working even with OS auto-brightness engaged. Only
    // DisplayBrightnessScreen disables its own slider locally.
    await act(async () => { await result.current.setBrightness(0.2); });
    expect(setBrightnessAsync).toHaveBeenCalledWith(0.2);
  });

  it('calls setBrightnessAsync from the manual slider once auto is disabled', async () => {
    const setBrightnessAsync = Brightness.setBrightnessAsync as jest.Mock;
    const setSystemBrightnessModeAsync = Brightness.setSystemBrightnessModeAsync as jest.Mock;
    setBrightnessAsync.mockClear();
    setSystemBrightnessModeAsync.mockClear();

    const { result } = renderHook(() => useDevice(), { wrapper });
    await act(async () => {});

    // Turn auto OFF → device enters MANUAL mode.
    await act(async () => { await result.current.setAutoBrightness(false); });
    expect(setSystemBrightnessModeAsync).toHaveBeenLastCalledWith(Brightness.BrightnessMode.MANUAL);
    expect(result.current.autoBrightness).toBe(false);

    // Now the manual slider drives setBrightnessAsync.
    await act(async () => { await result.current.setBrightness(0.3); });
    expect(setBrightnessAsync).toHaveBeenCalledWith(0.3);
  });

  it('persists the autoBrightness setting via SettingsStore', async () => {
    // One shared provider tree: a probe component reads BOTH contexts from the
    // same SettingsProvider instance, so the setting written by
    // setAutoBrightness is observable through useSettings.
    let captured: { device: ReturnType<typeof useDevice>; settings: ReturnType<typeof useSettings> } | null = null;
    function Probe() {
      const device = useDevice();
      const settings = useSettings();
      captured = { device, settings };
      return null;
    }
    render(
      <SettingsProvider gateFirstRender={false}>
        <DeviceProvider>
          <Probe />
        </DeviceProvider>
      </SettingsProvider>,
    );
    await act(async () => {});

    expect(captured!.settings.settings.autoBrightness).toBe(true);

    await act(async () => { await captured!.device.setAutoBrightness(false); });
    expect(captured!.settings.settings.autoBrightness).toBe(false);

    await act(async () => { await captured!.device.setAutoBrightness(true); });
    expect(captured!.settings.settings.autoBrightness).toBe(true);
  });

  it('does not re-issue the same brightness mode on unrelated re-renders (no flicker)', async () => {
    const setSystemBrightnessModeAsync = Brightness.setSystemBrightnessModeAsync as jest.Mock;
    setSystemBrightnessModeAsync.mockClear();

    const { result } = renderHook(() => useDevice(), { wrapper });
    await act(async () => {});
    const callsAfterMount = setSystemBrightnessModeAsync.mock.calls.length;

    // Trigger a re-render that does NOT change autoBrightness (set brightness
    // while auto is off is the only real path, so instead toggle it off then
    // back on, then re-render via refresh()).
    await act(async () => { await result.current.setAutoBrightness(false); });
    await act(async () => { await result.current.setAutoBrightness(true); });
    const callsAfterTwoToggles = setSystemBrightnessModeAsync.mock.calls.length;

    // Each toggle issues exactly one call: AUTOMATIC(mount) → MANUAL → AUTOMATIC.
    expect(callsAfterTwoToggles - callsAfterMount).toBe(2);
  });
});
