import LauncherModule, { onBridgeError } from '../index';
import { requireNativeModule } from 'expo';

jest.mock('expo', () => ({
  requireNativeModule: () => ({
    getInstalledApps: jest.fn().mockRejectedValue(new Error('native error')),
  }),
}));

describe('Bridge error reporting', () => {
  it('calls reportBridgeError when native call rejects', async () => {
    const listener = jest.fn();
    onBridgeError(listener);
    await LauncherModule.getInstalledApps();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('getInstalledApps', expect.any(Error));
  });
});