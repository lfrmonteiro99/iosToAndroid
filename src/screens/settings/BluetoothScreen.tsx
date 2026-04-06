import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
} from '../../components';

const MY_DEVICES = [
  { name: 'AirPods Pro', connected: true, icon: 'headset' },
  { name: 'MacBook Pro', connected: false, icon: 'laptop-outline' },
  { name: 'HomePod mini', connected: false, icon: 'radio-outline' },
];

const OTHER_DEVICES = [
  { name: 'Living Room TV', icon: 'tv-outline' },
  { name: 'Kitchen Speaker', icon: 'musical-notes-outline' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function BluetoothScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();

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
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Bluetooth"
              trailing={
                <CupertinoSwitch
                  value={settings.bluetoothEnabled}
                  onValueChange={(v) => update('bluetoothEnabled', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {settings.bluetoothEnabled && (
          <>
            <View style={{ paddingHorizontal: spacing.md }}>
              <CupertinoListSection>
                <CupertinoListTile
                  title="Device Name"
                  trailing={
                    <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                      {settings.bluetoothName}
                    </Text>
                  }
                  onPress={() => {}}
                />
              </CupertinoListSection>
            </View>

            <View style={{ paddingHorizontal: spacing.md }}>
              <CupertinoListSection header="My Devices">
                {MY_DEVICES.map((device) => (
                  <CupertinoListTile
                    key={device.name}
                    title={device.name}
                    subtitle={device.connected ? 'Connected' : 'Not Connected'}
                    leading={{
                      name: device.icon as 'headset',
                      color: '#FFFFFF',
                      backgroundColor: device.connected ? colors.systemBlue : colors.systemGray3,
                    }}
                    trailing={
                      device.connected ? (
                        <Text style={[typography.body, { color: colors.systemBlue }]}>✓</Text>
                      ) : undefined
                    }
                    showChevron
                    onPress={() => {}}
                  />
                ))}
              </CupertinoListSection>
            </View>

            <View style={{ paddingHorizontal: spacing.md }}>
              <CupertinoListSection header="Other Devices">
                {OTHER_DEVICES.map((device) => (
                  <CupertinoListTile
                    key={device.name}
                    title={device.name}
                    leading={{
                      name: device.icon as 'tv-outline',
                      color: '#FFFFFF',
                      backgroundColor: colors.systemGray3,
                    }}
                    showChevron
                    onPress={() => {}}
                  />
                ))}
              </CupertinoListSection>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
