import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useDevice } from '../../store/DeviceStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
} from '../../components';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function VpnScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { openSystemPanel } = useDevice();

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
        {/* VPN info */}
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <CupertinoListSection
            footer="VPN connections are managed by your device. Tap below to configure VPN in Android Settings."
          >
            <CupertinoListTile
              title="Status"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  Not Configured
                </Text>
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* VPN Configurations */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="VPN Configurations">
            <CupertinoListTile
              title="Add VPN Configuration..."
              leading={{ name: 'add-circle-outline', color: '#FFFFFF', backgroundColor: colors.systemBlue }}
              onPress={() => openSystemPanel('vpn')}
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
