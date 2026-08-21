import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CupertinoNavigationBar } from '../components/CupertinoNavigationBar';
import { CupertinoListSection, CupertinoListTile } from '../components/CupertinoListSection';
import { CupertinoButton } from '../components/CupertinoButton';
import { CupertinoSegmentedControl } from '../components/CupertinoSegmentedControl';
import { CupertinoEmptyState } from '../components/CupertinoEmptyState';
import { useTheme } from '../theme/ThemeContext';
import { useDevice } from '../store/DeviceStore';
import { useLocation } from '../store/LocationStore';
import { useContacts } from '../store/ContactsStore';

function formatRelative(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

type FindMyTab = 'devices' | 'people' | 'items';
const TAB_VALUES: FindMyTab[] = ['devices', 'people', 'items'];

export function FindMyScreen() {
  const { theme, typography, borderRadius } = useTheme();
  const { colors } = theme;
  const { bluetooth } = useDevice();
  const { currentLocation, permissionStatus, requestPermission, refreshLocation } = useLocation();
  const { favorites } = useContacts();

  const [selectedTab, setSelectedTab] = useState<FindMyTab>('devices');
  const selectedIndex = TAB_VALUES.indexOf(selectedTab);

  const deviceName = bluetooth.name?.trim() ? bluetooth.name : 'This Device';

  const handleGrant = useCallback(() => {
    void requestPermission();
  }, [requestPermission]);

  // When permission is granted, fetch the device's own location once so the
  // "This Device" row shows live coordinates instead of "No location yet".
  useEffect(() => {
    if (permissionStatus === 'granted') {
      void refreshLocation();
    }
  }, [permissionStatus, refreshLocation]);

  const coordinateLabel = currentLocation
    ? `${currentLocation.latitude.toFixed(4)}, ${currentLocation.longitude.toFixed(4)}`
    : null;
  const updatedLabel = currentLocation ? `Updated ${formatRelative(currentLocation.timestamp)}` : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar title="Find My" largeTitle>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.segmentedContainer}>
            <CupertinoSegmentedControl
              values={['Devices', 'People', 'Items']}
              selectedIndex={selectedIndex}
              onChange={(index: number) => setSelectedTab(TAB_VALUES[index])}
            />
          </View>

          {selectedTab === 'devices' && (
            <>
              {/* Map placeholder — gradient box with a center pin (MapsScreen-style). */}
              <View style={[styles.mapContainer, { borderRadius: borderRadius.large }]}>
                <LinearGradient
                  colors={['#A8D8EA', '#87CEEB', '#6BB3D9', '#4A90D9']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.mapGradient}
                >
                  <View style={styles.mapCenterPin}>
                    <Ionicons name="location" size={36} color={colors.systemRed} />
                  </View>
                  <View style={[styles.mapLocationLabel, { backgroundColor: 'rgba(255,255,255,0.9)' }]}>
                    <Text style={[typography.caption1, { color: colors.label }]}>
                      {currentLocation ? coordinateLabel : 'Location unavailable'}
                    </Text>
                  </View>
                </LinearGradient>
              </View>

              {permissionStatus !== 'granted' ? (
                <View style={styles.grantContainer}>
                  <CupertinoButton
                    title="Grant Location Permission"
                    variant="filled"
                    onPress={handleGrant}
                  />
                </View>
              ) : (
                <View style={styles.sectionContainer}>
                  <CupertinoListSection header="Devices">
                    <CupertinoListTile
                      title={deviceName}
                      subtitle={currentLocation ? `${coordinateLabel} · ${updatedLabel}` : 'No location yet'}
                      leading={{
                        name: 'phone-portrait-outline',
                        color: '#FFFFFF',
                        backgroundColor: colors.systemBlue,
                      }}
                    />
                  </CupertinoListSection>
                </View>
              )}
            </>
          )}

          {selectedTab === 'people' && (
            favorites.length === 0 ? (
              <CupertinoEmptyState
                icon="people-outline"
                iconColor={colors.systemGray}
                title="No One Is Sharing Their Location"
                message="When a contact is marked as a favorite in Contacts, they'll appear here. This app has no backend, so live location can't be fetched — only real contact data is shown."
              />
            ) : (
              <View style={styles.sectionContainer}>
                <CupertinoListSection header="People">
                  {favorites.map((c) => (
                    <CupertinoListTile
                      key={c.id}
                      title={`${c.firstName} ${c.lastName}`}
                      subtitle="Location Sharing Unavailable"
                      leading={{
                        name: 'location-outline',
                        color: '#FFFFFF',
                        backgroundColor: colors.systemGray,
                      }}
                    />
                  ))}
                </CupertinoListSection>
              </View>
            )
          )}

          {selectedTab === 'items' && (
            <CupertinoEmptyState
              icon="cube-outline"
              iconColor={colors.systemGray}
              title="No Items"
              message="Item tracking requires hardware like AirTags, which this app can't detect."
            />
          )}
        </ScrollView>
      </CupertinoNavigationBar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  segmentedContainer: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  mapContainer: {
    margin: 16,
    height: 260,
    overflow: 'hidden',
  },
  mapGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapCenterPin: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapLocationLabel: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  grantContainer: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  sectionContainer: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
});
