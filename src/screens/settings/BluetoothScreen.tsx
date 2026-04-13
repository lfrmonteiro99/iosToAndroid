import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useDevice } from '../../store/DeviceStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
  useAlert,
} from '../../components';

const getLauncher = async () => {
  try {
    return (await import('../../../modules/launcher-module/src')).default;
  } catch {
    return null;
  }
};

interface DiscoveredDevice {
  name: string;
  address: string;
  type: number;
  rssi: number;
  bondState: number;
}

function getDeviceIcon(type: number): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 1:
      return 'laptop-outline';
    case 2:
      return 'phone-portrait-outline';
    case 7:
      return 'headset-outline';
    default:
      return 'bluetooth';
  }
}

function getDeviceIconBackground(type: number, accentColor: string): string {
  switch (type) {
    case 7:
      return '#FF9500';
    case 1:
      return '#5856D6';
    case 2:
      return '#34C759';
    default:
      return accentColor;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function BluetoothScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { bluetooth, toggleBluetooth, refresh } = useDevice();
  const alert = useAlert();

  const [discovered, setDiscovered] = useState<DiscoveredDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [pairingAddress, setPairingAddress] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pairedAddresses = new Set(bluetooth.pairedDevices.map((d) => d.address));

  const startScan = useCallback(async () => {
    if (!bluetooth.enabled) return;
    setScanning(true);
    const mod = await getLauncher();
    if (!mod) { setScanning(false); return; }
    try {
      await mod.startBluetoothDiscovery();
      // Poll for discovered devices every 2 seconds
      pollRef.current = setInterval(async () => {
        const devices = await mod.getDiscoveredBluetoothDevices();
        setDiscovered(devices.filter((d) => !pairedAddresses.has(d.address)));
      }, 2000);
      // Auto-stop scan after 20 seconds
      setTimeout(async () => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        await mod.stopBluetoothDiscovery();
        setScanning(false);
      }, 20000);
    } catch {
      setScanning(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bluetooth.enabled]);

  const stopScan = useCallback(async () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    const mod = await getLauncher();
    if (mod) await mod.stopBluetoothDiscovery();
    setScanning(false);
  }, []);

  const handlePair = useCallback(async (device: DiscoveredDevice) => {
    setPairingAddress(device.address);
    const mod = await getLauncher();
    if (!mod) { setPairingAddress(null); return; }
    try {
      const ok = await mod.pairBluetoothDevice(device.address);
      if (ok) {
        alert('Pairing', `Pairing with "${device.name}". Confirm any passkey that appears.`);
        // Refresh paired list after a short delay
        setTimeout(async () => { await refresh(); setPairingAddress(null); }, 2500);
      } else {
        alert('Pair Failed', 'Could not start pairing with this device.');
        setPairingAddress(null);
      }
    } catch {
      setPairingAddress(null);
    }
  }, [alert, refresh]);

  const handleUnpair = useCallback(async (address: string, name: string) => {
    const mod = await getLauncher();
    if (!mod) return;
    const ok = await mod.unpairBluetoothDevice(address);
    if (ok) {
      alert('Unpaired', `"${name}" has been forgotten.`);
      await refresh();
    } else {
      alert('Unpair Failed', 'Could not unpair this device.');
    }
  }, [alert, refresh]);

  useEffect(() => {
    if (bluetooth.enabled) {
      startScan();
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      (async () => {
        const mod = await getLauncher();
        if (mod) await mod.stopBluetoothDiscovery();
      })();
    };
  }, [bluetooth.enabled, startScan]);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Bluetooth"
        leftButton={
          <Text
            style={[typography.body, { color: colors.systemBlue }]}
            onPress={() => navigation.goBack()}
          >
            Settings
          </Text>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Bluetooth Toggle */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Bluetooth"
              trailing={
                <CupertinoSwitch
                  value={bluetooth.enabled}
                  onValueChange={() => toggleBluetooth()}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {bluetooth.enabled && (
          <>
            {/* My Device Info */}
            <View style={{ paddingHorizontal: spacing.md }}>
              <CupertinoListSection header="My Device">
                <CupertinoListTile
                  title="Name"
                  trailing={
                    <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                      {bluetooth.name || 'Unknown'}
                    </Text>
                  }
                  showChevron={false}
                />
                {bluetooth.address ? (
                  <CupertinoListTile
                    title="Address"
                    trailing={
                      <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                        {bluetooth.address}
                      </Text>
                    }
                    showChevron={false}
                  />
                ) : null}
              </CupertinoListSection>
            </View>

            {/* Paired Devices */}
            <View style={{ paddingHorizontal: spacing.md }}>
              <CupertinoListSection header="My Devices">
                {bluetooth.pairedDevices.length > 0 ? (
                  bluetooth.pairedDevices.map((device) => {
                    const deviceType = device.type ?? 0;
                    return (
                      <CupertinoListTile
                        key={device.address}
                        title={device.name || 'Unknown Device'}
                        subtitle="Connected"
                        leading={{
                          name: getDeviceIcon(deviceType),
                          color: '#FFFFFF',
                          backgroundColor: getDeviceIconBackground(deviceType, colors.systemBlue),
                        }}
                        trailing={
                          <Pressable onPress={() => handleUnpair(device.address, device.name)}>
                            <Text style={[typography.caption1, { color: colors.systemRed }]}>
                              Forget
                            </Text>
                          </Pressable>
                        }
                        showChevron={false}
                      />
                    );
                  })
                ) : (
                  <CupertinoListTile
                    title="No paired devices"
                    showChevron={false}
                  />
                )}
              </CupertinoListSection>
            </View>

            {/* Scan header */}
            <View style={[styles.scanHeaderRow, { paddingHorizontal: spacing.md + 16 }]}>
              <Text style={[typography.footnote, { color: colors.secondaryLabel }]}>
                OTHER DEVICES
              </Text>
              {scanning ? (
                <ActivityIndicator size="small" color={colors.systemBlue} />
              ) : (
                <Pressable onPress={startScan} hitSlop={8}>
                  <Text style={[typography.footnote, { color: colors.systemBlue }]}>
                    Scan
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Other Devices (discovered) */}
            <View style={{ paddingHorizontal: spacing.md }}>
              <CupertinoListSection>
                {discovered.length === 0 ? (
                  <CupertinoListTile
                    title={scanning ? 'Searching for devices…' : 'No nearby devices'}
                    showChevron={false}
                  />
                ) : (
                  discovered.map((device) => {
                    const deviceType = device.type ?? 0;
                    const isPairing = pairingAddress === device.address;
                    return (
                      <CupertinoListTile
                        key={device.address}
                        title={device.name || 'Unknown Device'}
                        subtitle={`Signal: ${device.rssi} dBm`}
                        leading={{
                          name: getDeviceIcon(deviceType),
                          color: '#FFFFFF',
                          backgroundColor: getDeviceIconBackground(deviceType, colors.systemBlue),
                        }}
                        trailing={
                          isPairing ? (
                            <ActivityIndicator size="small" color={colors.systemBlue} />
                          ) : (
                            <Text style={[typography.caption1, { color: colors.systemBlue }]}>
                              Connect
                            </Text>
                          )
                        }
                        showChevron
                        onPress={() => !isPairing && handlePair(device)}
                      />
                    );
                  })
                )}
              </CupertinoListSection>
            </View>

            <Text style={[typography.footnote, styles.footer, { color: colors.secondaryLabel }]}>
              When pairing, Android may show a passkey confirmation dialog — this is required for security.
            </Text>

            {scanning && (
              <View style={styles.stopScanRow}>
                <Pressable onPress={stopScan} hitSlop={8}>
                  <Text style={[typography.body, { color: colors.systemRed }]}>
                    Stop Scanning
                  </Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  footer: {
    marginHorizontal: 32,
    marginTop: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
  scanHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 6,
    paddingTop: 16,
  },
  stopScanRow: {
    alignItems: 'center',
    paddingVertical: 16,
  },
});
