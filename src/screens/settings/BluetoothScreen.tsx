import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useDevice } from '../../store/DeviceStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
} from '../../components';

function getDeviceIcon(type: number): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 1: // Computer
      return 'laptop-outline';
    case 2: // Phone
      return 'phone-portrait-outline';
    case 7: // Audio (headphones / speaker)
      return 'headset-outline';
    default:
      return 'bluetooth';
  }
}

function getDeviceIconBackground(type: number, accentColor: string, grayColor: string): string {
  switch (type) {
    case 7: // Audio
      return '#FF9500'; // orange for audio devices
    case 1: // Computer
      return '#5856D6'; // purple for computers
    case 2: // Phone
      return '#34C759'; // green for phones
    default:
      return accentColor;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function BluetoothScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { bluetooth, toggleBluetooth, openSystemPanel } = useDevice();

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
                {'address' in bluetooth && (bluetooth as { address?: string }).address ? (
                  <CupertinoListTile
                    title="Address"
                    trailing={
                      <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                        {(bluetooth as { address: string }).address}
                      </Text>
                    }
                    showChevron={false}
                  />
                ) : null}
              </CupertinoListSection>
            </View>

            {/* Paired Devices */}
            <View style={{ paddingHorizontal: spacing.md }}>
              <CupertinoListSection header="Paired Devices">
                {bluetooth.pairedDevices.length > 0 ? (
                  bluetooth.pairedDevices.map((device) => {
                    const deviceType = (device as { type?: number }).type ?? 0;
                    return (
                      <CupertinoListTile
                        key={device.address}
                        title={device.name || 'Unknown Device'}
                        subtitle="Not Connected"
                        leading={{
                          name: getDeviceIcon(deviceType),
                          color: '#FFFFFF',
                          backgroundColor: getDeviceIconBackground(
                            deviceType,
                            colors.systemBlue,
                            colors.systemGray3,
                          ),
                        }}
                        trailing={
                          <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>
                            Connect
                          </Text>
                        }
                        showChevron
                        onPress={() => openSystemPanel('bluetooth')}
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

            {/* Info footer */}
            <Text style={[typography.footnote, styles.footer, { color: colors.secondaryLabel }]}>
              Pairing new devices requires Android Bluetooth settings
            </Text>
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
});
