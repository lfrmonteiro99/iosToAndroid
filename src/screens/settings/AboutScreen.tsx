import React from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  useAlert,
} from '../../components';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function AboutScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const alert = useAlert();

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="About"
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
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Name"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  iosToAndroid
                </Text>
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Software Version"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>1.0.0</Text>
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Model Name"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {Platform.OS === 'android' ? 'Android' : 'iPhone'}
                </Text>
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Platform"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {Platform.OS} {Platform.Version}
                </Text>
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="React Native"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>0.81.5</Text>
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Expo SDK"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>54</Text>
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection footer="This app demonstrates iOS Cupertino-style UI components running natively on Android using React Native and Expo.">
            <CupertinoListTile
              title="Legal & Regulatory"
              onPress={() => alert('Legal', 'iOS Theme Launcher v1.0\n\nThis app is not affiliated with Apple Inc.')}
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
