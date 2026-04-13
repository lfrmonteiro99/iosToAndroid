import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import { useDevice } from '../../store/DeviceStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
} from '../../components';

const getLauncher = async () => {
  try { return (await import('../../../modules/launcher-module/src')).default; }
  catch { return null; }
};

interface CarrierData {
  carrierName: string;
  networkType: string;
  signalStrength: number;
  isRoaming: boolean;
  phoneNumber: string;
  simOperator: string;
}

interface NetworkData {
  isConnected: boolean;
  isWifi: boolean;
  isCellular: boolean;
  isVpn: boolean;
}

function SignalBars({ level, color }: { level: number; color: string }) {
  const bars = [1, 2, 3, 4];
  return (
    <View style={signalStyles.container}>
      {bars.map((bar) => (
        <View
          key={bar}
          style={[
            signalStyles.bar,
            {
              height: 4 + bar * 4,
              backgroundColor: bar <= level ? color : `${color}33`,
            },
          ]}
        />
      ))}
    </View>
  );
}

const signalStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  bar: {
    width: 4,
    borderRadius: 1,
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CellularScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const { openSystemPanel } = useDevice();

  const [lowDataMode, setLowDataMode] = useState(false);
  const [dataRoaming, setDataRoaming] = useState(false);
  const [carrier, setCarrier] = useState<CarrierData | null>(null);
  const [network, setNetwork] = useState<NetworkData | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    (async () => {
      try {
        const mod = await getLauncher();
        if (!mod) return;
        const [carrierInfo, networkInfo] = await Promise.all([
          mod.getCarrierInfo(),
          mod.getNetworkInfo(),
        ]);
        setCarrier(carrierInfo);
        setNetwork(networkInfo);
      } catch { /* ignore */ }
    })();
  }, []);

  const connectionStatus = network
    ? network.isCellular
      ? 'Cellular'
      : network.isWifi
        ? 'Wi-Fi'
        : network.isConnected
          ? 'Connected'
          : 'No Connection'
    : 'Checking...';

  const carrierName = carrier?.carrierName || 'Unknown';
  const networkType = carrier?.networkType || 'Unknown';
  const signalLevel = carrier?.signalStrength ?? 0;
  const isRoaming = carrier?.isRoaming ?? false;
  const simOperator = carrier?.simOperator || '';

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Cellular"
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
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Cellular Data"
              trailing={
                <CupertinoSwitch
                  value={settings.cellularDataEnabled}
                  onValueChange={(v) => update('cellularDataEnabled', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Carrier & Network Info */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Carrier">
            <CupertinoListTile
              title="Carrier"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {carrierName}
                </Text>
              }
              leading={{
                name: 'cellular-outline',
                color: '#FFFFFF',
                backgroundColor: colors.systemGreen,
              }}
              showChevron={false}
            />
            <CupertinoListTile
              title="Network Type"
              trailing={
                <View style={styles.trailingRow}>
                  <Text style={[typography.body, { color: colors.systemBlue, fontWeight: '600', marginRight: 6 }]}>
                    {networkType}
                  </Text>
                  <SignalBars level={signalLevel} color={colors.systemGreen} />
                </View>
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Connection"
              trailing={
                <View style={styles.trailingRow}>
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor: network?.isConnected
                          ? colors.systemGreen
                          : colors.systemRed,
                      },
                    ]}
                  />
                  <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                    {connectionStatus}
                  </Text>
                </View>
              }
              showChevron={false}
            />
            {simOperator ? (
              <CupertinoListTile
                title="SIM Operator"
                trailing={
                  <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                    {simOperator}
                  </Text>
                }
                showChevron={false}
              />
            ) : null}
          </CupertinoListSection>
        </View>

        {/* Roaming Status */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Roaming">
            <CupertinoListTile
              title="Roaming Status"
              trailing={
                <View style={styles.trailingRow}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: isRoaming ? colors.systemOrange : colors.systemGreen },
                    ]}
                  />
                  <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                    {isRoaming ? 'Roaming' : 'Home Network'}
                  </Text>
                </View>
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Cellular Data Options */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Cellular Data Options">
            <CupertinoListTile
              title="Data Roaming"
              trailing={
                <CupertinoSwitch value={dataRoaming} onValueChange={setDataRoaming} />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Low Data Mode"
              trailing={
                <CupertinoSwitch value={lowDataMode} onValueChange={setLowDataMode} />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* SIM PIN — truly OS-only by security design */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection footer="Changing SIM PIN requires Android system settings by security design.">
            <CupertinoListTile
              title="SIM PIN"
              leading={{
                name: 'lock-closed-outline',
                color: '#FFFFFF',
                backgroundColor: colors.systemGray,
              }}
              showChevron
              onPress={() => openSystemPanel('security')}
            />
          </CupertinoListSection>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  trailingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
});
