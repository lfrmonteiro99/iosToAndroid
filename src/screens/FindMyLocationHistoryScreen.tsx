import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { CupertinoNavigationBar } from '../components/CupertinoNavigationBar';
import { CupertinoListSection, CupertinoListTile } from '../components/CupertinoListSection';
import { CupertinoEmptyState } from '../components/CupertinoEmptyState';
import { CupertinoButton } from '../components/CupertinoButton';
import { useAlert } from '../components/AlertProvider';
import { useTheme } from '../theme/ThemeContext';
import { useLocation } from '../store/LocationStore';
import type { AppNavigationProp } from '../navigation/types';
import type { LocationPoint } from '../store/LocationStore';

// Relative-date formatter, deliberately kept identical to
// `formatRecentDate` in MapsScreen.tsx (lines 59-73) — the issue requires
// reusing the same format, not inventing a new one. Duplicated rather than
// extracted to a shared util to keep this change self-contained.
function formatRecentDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'long' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatCoordinate(latitude: number, longitude: number): string {
  // Fixed to 4 decimals, matching DeviceStore.loadWeather's toFixed(4)
  // convention (src/store/DeviceStore.tsx:251).
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

interface FindMyLocationHistoryScreenProps {
  navigation: AppNavigationProp;
}

export function FindMyLocationHistoryScreen({
  navigation: _navigation,
}: FindMyLocationHistoryScreenProps) {
  const { theme } = useTheme();
  const { colors } = theme;
  const { history, clearHistory } = useLocation();
  const alert = useAlert();

  const handleClearPress = useCallback(() => {
    alert('Clear Location History', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => clearHistory(),
      },
    ]);
  }, [alert, clearHistory]);

  const clearButton = (
    <CupertinoButton title="Clear" variant="plain" onPress={handleClearPress} />
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar title="Location History" largeTitle rightButton={clearButton}>
        {history.length === 0 ? (
          <CupertinoEmptyState
            icon="time-outline"
            title="No Location History"
            message="Locations you view will appear here."
          />
        ) : (
          <View style={styles.sectionContainer}>
            <CupertinoListSection header="History">
              {history.map((point: LocationPoint, index: number) => (
                <CupertinoListTile
                  key={`${point.timestamp}-${index}`}
                  title={formatCoordinate(point.latitude, point.longitude)}
                  subtitle={formatRecentDate(point.timestamp)}
                  leading={{
                    name: 'location-outline',
                    color: '#FFFFFF',
                    backgroundColor: colors.systemBlue,
                  }}
                />
              ))}
            </CupertinoListSection>
          </View>
        )}
      </CupertinoNavigationBar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionContainer: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
});
