import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function VpnScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const { openSystemPanel } = useDevice();

  const trailing = (text: string) => (
    <Text style={[typography.body, { color: colors.secondaryLabel }]}>{text}</Text>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="VPN"
        largeTitle={false}
        leftButton={
          <Text
            style={[typography.body, { color: colors.systemBlue }]}
            onPress={() => navigation.goBack()}
          >
            General
          </Text>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        {/* VPN toggle */}
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="VPN"
              trailing={
                <CupertinoSwitch
                  value={settings.vpnEnabled}
                  onValueChange={(v) => update('vpnEnabled', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Status section */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Status">
            <CupertinoListTile
              title="Status"
              trailing={
                <Text
                  style={[
                    typography.body,
                    {
                      color: settings.vpnEnabled
                        ? colors.systemGreen
                        : colors.secondaryLabel,
                    },
                  ]}
                >
                  {settings.vpnEnabled ? 'Connected' : 'Not Connected'}
                </Text>
              }
              showChevron={false}
            />
            {settings.vpnEnabled && (
              <>
                <CupertinoListTile
                  title="Server"
                  trailing={trailing('us-east-1.vpn.example.com')}
                  showChevron={false}
                />
                <CupertinoListTile
                  title="Protocol"
                  trailing={trailing('IKEv2')}
                  showChevron={false}
                />
                <CupertinoListTile
                  title="IP Address"
                  trailing={trailing('10.0.0.42')}
                  showChevron={false}
                />
              </>
            )}
          </CupertinoListSection>
        </View>

        {/* VPN Configurations */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="VPN Configurations">
            <CupertinoListTile
              title="Add VPN Configuration..."
              leading={{ name: 'add-circle-outline', color: '#FFFFFF', backgroundColor: colors.systemBlue }}
              onPress={() => {}}
            />
          </CupertinoListSection>
        </View>

        {/* Open System Settings */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Open VPN Settings"
              leading={{ name: 'open-outline', color: '#FFF', backgroundColor: colors.systemBlue }}
              onPress={() => openSystemPanel('vpn')}
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
