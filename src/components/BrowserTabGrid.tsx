import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import type { CupertinoColors } from '../theme/CupertinoTheme';
import { Typography } from '../theme/CupertinoTheme';

const ACCENT = '#007AFF';
const TITLE_MAX_LENGTH = 40;
const URL_MAX_LENGTH = 40;

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
}

interface BrowserTabGridProps {
  tabs: BrowserTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onNewTab: () => void;
  onCloseTab: (id: string) => void;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

export function BrowserTabGrid({ tabs, activeTabId, onSelectTab, onNewTab, onCloseTab }: BrowserTabGridProps) {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container} testID="browser-tab-grid">
      <View style={styles.grid}>
        {tabs.map((tab) => {
          const label = tab.title.trim() || tab.url;
          const isActive = tab.id === activeTabId;
          return (
            <Pressable
              key={tab.id}
              onPress={() => onSelectTab(tab.id)}
              accessibilityRole="button"
              accessibilityLabel={`Tab: ${label}`}
              style={[styles.card, isActive && { borderColor: ACCENT, borderWidth: 2 }]}
            >
              <Pressable
                onPress={() => onCloseTab(tab.id)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Close tab: ${label}`}
                style={styles.closeButton}
              >
                <Ionicons name="close-circle" size={18} color={colors.secondaryLabel} />
              </Pressable>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {truncate(tab.title.trim() || 'New Tab', TITLE_MAX_LENGTH)}
              </Text>
              <Text style={styles.cardUrl} numberOfLines={1}>
                {truncate(tab.url, URL_MAX_LENGTH)}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={onNewTab}
          accessibilityRole="button"
          accessibilityLabel="New Tab"
          style={styles.newTabCard}
        >
          <Ionicons name="add" size={28} color={ACCENT} />
          <Text style={styles.newTabText}>New Tab</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: CupertinoColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.systemBackground },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      padding: 12,
    },
    card: {
      width: 150,
      height: 110,
      borderRadius: 12,
      padding: 10,
      backgroundColor: colors.secondarySystemBackground,
      borderColor: 'transparent',
      borderWidth: 2,
    },
    closeButton: { alignSelf: 'flex-end' },
    cardTitle: { ...Typography.footnote, color: colors.label, fontWeight: '600', marginTop: 4 },
    cardUrl: { ...Typography.caption1, color: colors.secondaryLabel, marginTop: 2 },
    newTabCard: {
      width: 150,
      height: 110,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.tertiarySystemBackground,
    },
    newTabText: { ...Typography.footnote, color: ACCENT, marginTop: 4 },
  });
}
