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
export function WifiScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { wifi, toggleWifi, openSystemPanel } = useDevice();

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
      >
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

        {wifi.enabled && (
          <View style={{ paddingHorizontal: spacing.md }}>
            <CupertinoListSection header="Networks">
              {wifi.networks.map((net) => {
                const connected = net.ssid === wifi.ssid;
                return (
                  <CupertinoListTile
                    key={net.ssid}
                    title={net.ssid}
                    leading={{
                      name: 'wifi',
                      color: '#FFFFFF',
                      backgroundColor: connected ? colors.accent : colors.systemGray3,
                    }}
                    trailing={
                      connected ? (
                        <Text style={[typography.body, { color: colors.systemBlue }]}>✓</Text>
                      ) : undefined
                    }
                    showChevron={connected}
                    onPress={() => openSystemPanel('wifi')}
                  />
                );
              })}
            </CupertinoListSection>
          </View>
        )}

        {wifi.enabled && (
          <View style={{ paddingHorizontal: spacing.md }}>
            <CupertinoListSection>
              <CupertinoListTile
                title="Ask to Join Networks"
                trailing={
                  <Text style={[typography.body, { color: colors.secondaryLabel }]}>Ask</Text>
                }
                onPress={() => openSystemPanel('wifi')}
              />
              <CupertinoListTile
                title="Auto-Join Hotspot"
                trailing={
                  <Text style={[typography.body, { color: colors.secondaryLabel }]}>Never</Text>
                }
                onPress={() => openSystemPanel('wifi')}
              />
            </CupertinoListSection>
          </View>
        )}

        {wifi.enabled && wifi.ip ? (
          <Text style={[typography.footnote, styles.footer, { color: colors.secondaryLabel }]}>
            IP Address: {wifi.ip}
          </Text>
        ) : null}
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
