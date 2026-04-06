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

const NETWORKS = [
  { name: 'Home', signal: 'wifi' },
  { name: 'Neighbors_5G', signal: 'wifi' },
  { name: 'CoffeeShop_Free', signal: 'wifi' },
  { name: 'Office-Guest', signal: 'wifi' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function WifiScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();

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
                  value={settings.wifiEnabled}
                  onValueChange={(v) => update('wifiEnabled', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {settings.wifiEnabled && (
          <View style={{ paddingHorizontal: spacing.md }}>
            <CupertinoListSection header="My Networks">
              {NETWORKS.map((net) => {
                const connected = net.name === settings.wifiNetwork;
                return (
                  <CupertinoListTile
                    key={net.name}
                    title={net.name}
                    leading={{
                      name: 'wifi',
                      color: '#FFFFFF',
                      backgroundColor: connected ? '#007AFF' : colors.systemGray3,
                    }}
                    trailing={
                      connected ? (
                        <Text style={[typography.body, { color: colors.systemBlue }]}>✓</Text>
                      ) : undefined
                    }
                    showChevron={connected}
                    onPress={() => update('wifiNetwork', net.name)}
                  />
                );
              })}
            </CupertinoListSection>
          </View>
        )}

        {settings.wifiEnabled && (
          <View style={{ paddingHorizontal: spacing.md }}>
            <CupertinoListSection>
              <CupertinoListTile
                title="Ask to Join Networks"
                trailing={
                  <Text style={[typography.body, { color: colors.secondaryLabel }]}>Ask</Text>
                }
                onPress={() => {}}
              />
              <CupertinoListTile
                title="Auto-Join Hotspot"
                trailing={
                  <Text style={[typography.body, { color: colors.secondaryLabel }]}>Never</Text>
                }
                onPress={() => {}}
              />
            </CupertinoListSection>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
