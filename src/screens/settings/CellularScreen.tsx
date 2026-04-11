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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CellularScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const { openSystemPanel } = useDevice();

  const [dataRoaming, setDataRoaming] = useState(false);
  const [lowDataMode, setLowDataMode] = useState(false);
  const [networkType, setNetworkType] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    (async () => {
      try {
        const mod = await getLauncher();
        if (!mod) return;
        const info = await mod.getNetworkInfo();
        setNetworkType(info.isCellular ? 'Cellular' : info.isWifi ? 'Wi-Fi' : 'None');
      } catch { /* ignore */ }
    })();
  }, []);

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

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Carrier"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {networkType || 'Unknown'}
                </Text>
              }
              leading={{
                name: 'cellular-outline',
                color: '#FFFFFF',
                backgroundColor: colors.systemGreen,
              }}
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Current Period">
            <CupertinoListTile
              title="Current Period"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  Not Available
                </Text>
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Current Period Roaming"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  Not Available
                </Text>
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

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

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
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

        {/* Open System Settings */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Open Cellular Settings"
              leading={{ name: 'open-outline', color: '#FFF', backgroundColor: colors.systemBlue }}
              onPress={() => openSystemPanel('data_roaming')}
            />
          </CupertinoListSection>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
