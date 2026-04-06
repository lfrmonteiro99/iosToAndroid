import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useDevice } from '../../store/DeviceStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
} from '../../components';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function BluetoothScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { bluetooth, toggleBluetooth } = useDevice();

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
            <View style={{ paddingHorizontal: spacing.md }}>
              <CupertinoListSection>
                <CupertinoListTile
                  title="Device Name"
                  trailing={
                    <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                      {bluetooth.name}
                    </Text>
                  }
                  onPress={() => {}}
                />
              </CupertinoListSection>
            </View>

            {bluetooth.pairedDevices.length > 0 && (
              <View style={{ paddingHorizontal: spacing.md }}>
                <CupertinoListSection header="Paired Devices">
                  {bluetooth.pairedDevices.map((device) => (
                    <CupertinoListTile
                      key={device.address}
                      title={device.name}
                      leading={{
                        name: 'bluetooth' as const,
                        color: '#FFFFFF',
                        backgroundColor: colors.systemBlue,
                      }}
                      showChevron
                      onPress={() => {}}
                    />
                  ))}
                </CupertinoListSection>
              </View>
            )}

            {bluetooth.pairedDevices.length === 0 && (
              <View style={{ paddingHorizontal: spacing.md }}>
                <CupertinoListSection header="Paired Devices">
                  <CupertinoListTile
                    title="No paired devices"
                    trailing={
                      <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                        —
                      </Text>
                    }
                    showChevron={false}
                    onPress={() => {}}
                  />
                </CupertinoListSection>
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
});
