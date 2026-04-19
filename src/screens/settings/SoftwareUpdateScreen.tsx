import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoButton,
  CupertinoSwitch,
} from '../../components';
import appJson from '../../../app.json';
import type { AppNavigationProp } from '../../navigation/types';

const APP_VERSION = appJson.expo.version;
const GITHUB_RELEASES_API = 'https://api.github.com/repos/lfrmonteiro99/iostoandroid/releases/latest';

type CheckState = 'idle' | 'checking' | 'upToDate' | 'updateAvailable' | 'error';

function semverGt(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return true;
    if (na < nb) return false;
  }
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function SoftwareUpdateScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();

  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const handleCheckNow = useCallback(async () => {
    setCheckState('checking');
    try {
      const res = await fetch(GITHUB_RELEASES_API, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const tag: string = data.tag_name ?? '';
      setLatestVersion(tag);
      setCheckedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setCheckState(semverGt(tag, APP_VERSION) ? 'updateAvailable' : 'upToDate');
    } catch {
      setCheckState('error');
    }
  }, []);

  const statusCard = () => {
    if (checkState === 'checking') {
      return (
        <View style={[styles.updateCard, { backgroundColor: colors.secondarySystemGroupedBackground }]}>
          <ActivityIndicator color={colors.systemBlue} />
          <Text style={[typography.footnote, { color: colors.secondaryLabel, marginTop: 8 }]}>
            Checking for updates…
          </Text>
        </View>
      );
    }
    if (checkState === 'updateAvailable') {
      return (
        <View style={[styles.updateCard, { backgroundColor: colors.secondarySystemGroupedBackground }]}>
          <Text style={[typography.headline, { color: colors.systemBlue }]}>
            Update available: {latestVersion}
          </Text>
          <Text style={[typography.footnote, { color: colors.secondaryLabel, marginTop: spacing.sm, lineHeight: 18 }]}>
            A new version is available on GitHub. Download from the repository to update.
          </Text>
        </View>
      );
    }
    if (checkState === 'error') {
      return (
        <View style={[styles.updateCard, { backgroundColor: colors.secondarySystemGroupedBackground }]}>
          <Text style={[typography.headline, { color: colors.systemRed }]}>
            Could not check for updates
          </Text>
          <Text style={[typography.footnote, { color: colors.secondaryLabel, marginTop: spacing.sm, lineHeight: 18 }]}>
            Check your internet connection and try again.
          </Text>
        </View>
      );
    }
    return (
      <View style={[styles.updateCard, { backgroundColor: colors.secondarySystemGroupedBackground }]}>
        <Text style={[typography.headline, { color: colors.label }]}>
          {checkState === 'upToDate' ? 'Your software is up to date.' : 'Tap "Check Now" to look for updates.'}
        </Text>
        <Text style={[typography.footnote, { color: colors.secondaryLabel, marginTop: spacing.sm, lineHeight: 18 }]}>
          {checkState === 'upToDate'
            ? `iosToAndroid ${APP_VERSION} is the latest version.`
            : `Current version: ${APP_VERSION}`}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Software Update"
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
        {/* Current version */}
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Current Version"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>{APP_VERSION}</Text>
              }
              showChevron={false}
              isLast={latestVersion !== null}
            />
            {latestVersion !== null && (
              <CupertinoListTile
                title="Latest Version"
                trailing={
                  <Text style={[typography.body, { color: checkState === 'updateAvailable' ? colors.systemBlue : colors.secondaryLabel }]}>
                    {latestVersion}
                  </Text>
                }
                showChevron={false}
                isLast
              />
            )}
          </CupertinoListSection>
        </View>

        {/* Status card */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            {statusCard()}
          </CupertinoListSection>
        </View>

        {/* Check now button */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoButton
            title={checkState === 'checking' ? 'Checking…' : 'Check Now'}
            variant="tinted"
            onPress={handleCheckNow}
          />
        </View>

        {/* Automatic updates */}
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <CupertinoListSection
            footer={checkedAt ? `Last checked: Today at ${checkedAt}` : 'Not checked yet this session'}
          >
            <CupertinoListTile
              title="Automatic Updates"
              trailing={
                <CupertinoSwitch value={settings.automaticUpdates} onValueChange={(v) => update('automaticUpdates', v)} />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  updateCard: {
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
});
