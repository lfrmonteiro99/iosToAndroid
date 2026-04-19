import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeContext';
import { useDevice } from '../../store/DeviceStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
} from '../../components';
import type { AppNavigationProp } from '../../navigation/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function VpnScreen({ navigation }: { navigation: AppNavigationProp }) {
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
        {/* Disclaimer banner */}
        <View style={{ backgroundColor: '#FFF3CD', borderRadius: 10, marginHorizontal: 16, marginTop: 16, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Ionicons name="warning-outline" size={20} color="#856404" />
          <Text style={[typography.footnote, { color: '#856404', flex: 1 }]}>
            This screen provides a shortcut to Android VPN settings. No VPN traffic is routed through this app.
          </Text>
        </View>

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
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openSystemPanel('vpn'); }}
            />
          </CupertinoListSection>
        </View>

        {/* Open System Settings */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Open VPN Settings"
              leading={{ name: 'open-outline', color: '#FFF', backgroundColor: colors.systemBlue }}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openSystemPanel('vpn'); }}
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
