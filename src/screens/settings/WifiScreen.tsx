import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TextInput, Platform, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useDevice } from '../../store/DeviceStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
  CupertinoButton,
  CupertinoActivityIndicator,
  useAlert,
} from '../../components';
import type { AppNavigationProp } from '../../navigation/types';

interface ScannedNetwork {
  ssid: string;
  bssid: string;
  level: number;
  frequency: number;
  isSecure: boolean;
}

const getLauncher = async () => {
  if (Platform.OS !== 'android') return null;
  try {
    return (await import('../../../modules/launcher-module/src')).default;
  } catch {
    return null;
  }
};

function getSignalBars(level: number): number {
  if (level > -50) return 3;
  if (level > -70) return 2;
  return 1;
}

function getSignalIconName(_bars: number): keyof typeof Ionicons.glyphMap {
  return 'wifi';
}

function getFrequencyBand(frequency: number): string {
  return frequency >= 5000 ? '5 GHz' : '2.4 GHz';
}

function getRssiLabel(rssi: number): string {
  if (rssi > -50) return 'Excellent';
  if (rssi > -60) return 'Good';
  if (rssi > -70) return 'Fair';
  return 'Weak';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function WifiScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { wifi, toggleWifi } = useDevice();
  const alert = useAlert();

  const [scannedNetworks, setScannedNetworks] = useState<ScannedNetwork[]>([]);
  const [scanning, setScanning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [joinSsid, setJoinSsid] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joinSecurity, setJoinSecurity] = useState<'WPA2' | 'WPA3' | 'Open'>('WPA2');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [pendingNetwork, setPendingNetwork] = useState<ScannedNetwork | null>(null);

  const scanNetworks = useCallback(async () => {
    setScanning(true);
    try {
      const mod = await getLauncher();
      if (!mod) return;
      const networks = await mod.getWifiNetworks().catch(() => []);
      // Deduplicate by SSID and keep the strongest signal for each
      const seen = new Map<string, ScannedNetwork>();
      for (const n of networks) {
        if (!n.ssid) continue;
        const existing = seen.get(n.ssid);
        if (!existing || n.level > existing.level) {
          seen.set(n.ssid, n);
        }
      }
      setScannedNetworks(Array.from(seen.values()).sort((a, b) => b.level - a.level));
    } catch {
      // silently fail
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    if (wifi.enabled) {
      scanNetworks();
    } else {
      setScannedNetworks([]);
    }
  }, [wifi.enabled, scanNetworks]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await scanNetworks();
    setRefreshing(false);
  }, [scanNetworks]);

  const handleJoinNetwork = useCallback(() => {
    if (!joinSsid.trim()) {
      alert('Enter Network Name', 'Please type a network name (SSID) to join.');
      return;
    }
    // Show in-app password modal (no Android Settings panel)
    setPendingNetwork({ ssid: joinSsid.trim(), bssid: '', level: 0, frequency: 0, isSecure: true });
    setShowPasswordModal(true);
  }, [joinSsid, alert]);

  const handleNetworkTap = useCallback((network: ScannedNetwork) => {
    if (network.isSecure) {
      setPendingNetwork(network);
      setJoinPassword('');
      setJoinSecurity('WPA2');
      setShowPasswordModal(true);
    } else {
      // Open network — join directly
      (async () => {
        setConnecting(true);
        try {
          const mod = await getLauncher();
          if (!mod) return;
          const ok = await mod.joinWifiNetwork(network.ssid, '', 'Open');
          if (ok) {
            alert('Joining', `Connecting to "${network.ssid}"…`);
          } else {
            alert('Failed', 'Could not add this network.');
          }
        } finally {
          setConnecting(false);
        }
      })();
    }
  }, [alert]);

  const submitJoin = useCallback(async () => {
    if (!pendingNetwork) return;
    if (joinSecurity !== 'Open' && !joinPassword) {
      alert('Password Required', 'Enter the Wi-Fi password to join this network.');
      return;
    }
    setConnecting(true);
    try {
      const mod = await getLauncher();
      if (!mod) return;
      const ok = await mod.joinWifiNetwork(pendingNetwork.ssid, joinPassword, joinSecurity);
      if (ok) {
        alert('Joining', `Connecting to "${pendingNetwork.ssid}"…`);
        setShowPasswordModal(false);
        setJoinSsid('');
        setJoinPassword('');
        setPendingNetwork(null);
      } else {
        alert('Failed', 'Could not add this network. Check the password and try again.');
      }
    } finally {
      setConnecting(false);
    }
  }, [pendingNetwork, joinPassword, joinSecurity, alert]);

  const signalBars = wifi.rssi ? getSignalBars(wifi.rssi) : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Wi-Fi"
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
        refreshControl={
          wifi.enabled ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          ) : undefined
        }
      >
        {/* Wi-Fi Toggle */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Wi-Fi"
              trailing={
                <CupertinoSwitch
                  value={wifi.enabled}
                  onValueChange={() => toggleWifi()}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Current Network Card */}
        {wifi.enabled && wifi.ssid ? (
          <View style={{ paddingHorizontal: spacing.md }}>
            <CupertinoListSection header="Current Network">
              <CupertinoListTile
                title={wifi.ssid}
                subtitle={getRssiLabel(wifi.rssi)}
                leading={{
                  name: 'wifi',
                  color: '#FFFFFF',
                  backgroundColor: colors.accent,
                }}
                trailing={
                  <Text style={[typography.body, { color: colors.systemBlue }]}>
                    {'\u2713'}
                  </Text>
                }
                showChevron={false}
              />
              <CupertinoListTile
                title="Signal Strength"
                trailing={
                  <View style={styles.signalRow}>
                    {[1, 2, 3].map((bar) => (
                      <View
                        key={bar}
                        style={[
                          styles.signalBar,
                          {
                            height: 6 + bar * 4,
                            backgroundColor:
                              bar <= signalBars
                                ? colors.systemBlue
                                : colors.systemGray4,
                          },
                        ]}
                      />
                    ))}
                    <Text
                      style={[
                        typography.body,
                        { color: colors.secondaryLabel, marginLeft: 8 },
                      ]}
                    >
                      {wifi.rssi} dBm
                    </Text>
                  </View>
                }
                showChevron={false}
              />
              {wifi.ip ? (
                <CupertinoListTile
                  title="IP Address"
                  trailing={
                    <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                      {wifi.ip}
                    </Text>
                  }
                  showChevron={false}
                />
              ) : null}
              {wifi.linkSpeed > 0 ? (
                <CupertinoListTile
                  title="Link Speed"
                  trailing={
                    <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                      {wifi.linkSpeed} Mbps
                    </Text>
                  }
                  showChevron={false}
                />
              ) : null}
            </CupertinoListSection>
          </View>
        ) : null}

        {/* Available Networks */}
        {wifi.enabled && (
          <View style={{ paddingHorizontal: spacing.md }}>
            <CupertinoListSection header="Available Networks">
              {scanning && scannedNetworks.length === 0 ? (
                <View style={styles.scanningRow}>
                  <CupertinoActivityIndicator size="small" />
                  <Text
                    style={[
                      typography.body,
                      { color: colors.secondaryLabel, marginLeft: 12 },
                    ]}
                  >
                    Scanning for networks...
                  </Text>
                </View>
              ) : scannedNetworks.length === 0 ? (
                <CupertinoListTile
                  title="No networks found"
                  subtitle="Pull down to scan again"
                  showChevron={false}
                />
              ) : (
                scannedNetworks
                  .filter((net) => net.ssid !== wifi.ssid)
                  .map((net) => {
                    const bars = getSignalBars(net.level);
                    return (
                      <CupertinoListTile
                        key={net.bssid || net.ssid}
                        title={net.ssid}
                        subtitle={getFrequencyBand(net.frequency)}
                        leading={{
                          name: getSignalIconName(bars),
                          color: '#FFFFFF',
                          backgroundColor: colors.systemGray3,
                        }}
                        trailing={
                          <View style={styles.networkTrailing}>
                            {net.isSecure && (
                              <Ionicons
                                name="lock-closed"
                                size={14}
                                color={colors.secondaryLabel}
                                style={{ marginRight: 6 }}
                              />
                            )}
                            {[1, 2, 3].map((bar) => (
                              <View
                                key={bar}
                                style={[
                                  styles.signalBarSmall,
                                  {
                                    height: 4 + bar * 3,
                                    backgroundColor:
                                      bar <= bars
                                        ? colors.systemBlue
                                        : colors.systemGray4,
                                  },
                                ]}
                              />
                            ))}
                          </View>
                        }
                        showChevron
                        onPress={() => handleNetworkTap(net)}
                      />
                    );
                  })
              )}
            </CupertinoListSection>
          </View>
        )}

        {/* Join Other Network */}
        {wifi.enabled && (
          <View style={{ paddingHorizontal: spacing.md }}>
            <CupertinoListSection header="Join Other Network">
              <View style={styles.joinRow}>
                <TextInput
                  style={[
                    typography.body,
                    styles.joinInput,
                    {
                      color: colors.label,
                      backgroundColor: colors.systemGroupedBackground,
                      borderColor: colors.separator,
                    },
                  ]}
                  placeholder="Network name"
                  placeholderTextColor={colors.tertiaryLabel}
                  value={joinSsid}
                  onChangeText={setJoinSsid}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <CupertinoButton
                  title="Join"
                  onPress={handleJoinNetwork}
                  style={styles.joinButton}
                />
              </View>
            </CupertinoListSection>
          </View>
        )}

        {/* Footer note */}
        {wifi.enabled && (
          <Text style={[typography.footnote, styles.footer, { color: colors.secondaryLabel }]}>
            Networks are added as suggestions on Android 10+. Android may ask you to approve the first time.
          </Text>
        )}
      </ScrollView>

      {/* In-app password entry modal (no Android Settings panel) */}
      <Modal
        visible={showPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <View style={styles.pwOverlay}>
          <View style={[styles.pwDialog, { backgroundColor: colors.secondarySystemGroupedBackground }]}>
            <Text style={[typography.headline, { color: colors.label, textAlign: 'center' }]}>
              Enter password for
            </Text>
            <Text style={[typography.subhead, { color: colors.label, textAlign: 'center', fontWeight: '600' }]}>
              {pendingNetwork?.ssid ?? ''}
            </Text>
            <TextInput
              style={[
                typography.body,
                styles.pwInput,
                {
                  color: colors.label,
                  backgroundColor: colors.systemBackground,
                  borderColor: colors.separator,
                },
              ]}
              placeholder="Password"
              placeholderTextColor={colors.tertiaryLabel}
              value={joinPassword}
              onChangeText={setJoinPassword}
              secureTextEntry
              autoFocus
              autoCapitalize="none"
            />
            <View style={styles.pwSecurityRow}>
              {(['WPA2', 'WPA3', 'Open'] as const).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setJoinSecurity(s)}
                  style={[
                    styles.pwSecurityChip,
                    {
                      backgroundColor: joinSecurity === s ? colors.systemBlue : colors.systemGray5,
                    },
                  ]}
                >
                  <Text style={[typography.caption1, { color: joinSecurity === s ? '#fff' : colors.label, fontWeight: '600' }]}>{s}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.pwActions}>
              <CupertinoButton
                title="Cancel"
                onPress={() => { setShowPasswordModal(false); setJoinPassword(''); }}
                variant="tinted"
                style={{ flex: 1 }}
              />
              <CupertinoButton
                title={connecting ? 'Joining…' : 'Join'}
                onPress={submitJoin}
                disabled={connecting}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
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
  pwOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pwDialog: {
    width: '85%',
    borderRadius: 14,
    padding: 20,
    gap: 10,
  },
  pwInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  pwSecurityRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  pwSecurityChip: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  pwActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  signalBar: {
    width: 5,
    borderRadius: 2,
    marginHorizontal: 1,
  },
  signalBarSmall: {
    width: 4,
    borderRadius: 1.5,
    marginHorizontal: 0.5,
  },
  networkTrailing: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  scanningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  joinInput: {
    flex: 1,
    height: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginRight: 10,
  },
  joinButton: {
    minWidth: 60,
  },
});
