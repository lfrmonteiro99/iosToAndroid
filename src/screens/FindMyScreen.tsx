import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CupertinoNavigationBar } from '../components/CupertinoNavigationBar';
import { CupertinoListSection, CupertinoListTile } from '../components/CupertinoListSection';
import { CupertinoButton } from '../components/CupertinoButton';
import { CupertinoSegmentedControl } from '../components/CupertinoSegmentedControl';
import { CupertinoEmptyState } from '../components/CupertinoEmptyState';
import { CupertinoSwitch } from '../components/CupertinoSwitch';
import { CupertinoTextField } from '../components/CupertinoTextField';
import { hapticSelection } from '../utils/haptics';
import { useTheme } from '../theme/ThemeContext';
import { useDevice } from '../store/DeviceStore';
import { useLocation } from '../store/LocationStore';
import { useContacts } from '../store/ContactsStore';

const LOST_MODE_KEY = '@iostoandroid/findmy_lost_mode';

interface LostModeState {
  active: boolean;
  message: string; // shown on the overlay, e.g. a contact phone number
}

const DEFAULT_LOST_MODE: LostModeState = { active: false, message: '' };

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

  // ── Lost mode (issue #267) ──────────────────────────────────────────────
  // In-app-only simulation: an unprivileged launcher cannot lock the device,
  // so "Mark as Lost" is confined to this screen. The flag is persisted and
  // hydrated on mount so it survives navigation away and back (and restart).
  const [lostMode, setLostMode] = useState<LostModeState>(DEFAULT_LOST_MODE);
  const [showMessagePrompt, setShowMessagePrompt] = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');

  const persistLostMode = useCallback(async (next: LostModeState) => {
    try {
      await AsyncStorage.setItem(LOST_MODE_KEY, JSON.stringify(next));
    } catch {
      // silently fail — storage is best-effort for a cosmetic overlay
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(LOST_MODE_KEY).then((raw) => {
      if (cancelled) return;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<LostModeState>;
          setLostMode({
            active: parsed.active === true,
            message: typeof parsed.message === 'string' ? parsed.message : '',
          });
        } catch {
          /* ignore corrupt storage */
        }
      }
    }).catch(() => {
      /* ignore */
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleLostMode = useCallback(
    (value: boolean) => {
      hapticSelection().catch(() => {});
      if (value) {
        // Toggling on opens a prompt to capture an optional contact message
        // before activating.
        setPendingMessage(lostMode.message);
        setShowMessagePrompt(true);
      } else {
        // Toggling off directly disables and persists.
        const next: LostModeState = { active: false, message: '' };
        setLostMode(next);
        void persistLostMode(next);
      }
    },
    [lostMode.message, persistLostMode],
  );

  const confirmMessagePrompt = useCallback(() => {
    const next: LostModeState = { active: true, message: pendingMessage };
    setLostMode(next);
    void persistLostMode(next);
    setShowMessagePrompt(false);
  }, [pendingMessage, persistLostMode]);

  const cancelMessagePrompt = useCallback(() => {
    // User dismissed the prompt without activating — leave the switch off.
    setShowMessagePrompt(false);
    setLostMode((prev) => ({ ...prev, active: false }));
  }, []);

  const turnOffLostMode = useCallback(() => {
    const next: LostModeState = { active: false, message: '' };
    setLostMode(next);
    void persistLostMode(next);
  }, [persistLostMode]);

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
                    <CupertinoListTile
                      title="Mark as Lost"
                      subtitle={
                        lostMode.active && lostMode.message
                          ? lostMode.message
                          : undefined
                      }
                      leading={{
                        name: 'alert-circle',
                        color: '#FFFFFF',
                        backgroundColor: colors.systemRed,
                      }}
                      trailing={
                        <CupertinoSwitch
                          value={lostMode.active}
                          onValueChange={handleToggleLostMode}
                        />
                      }
                      showChevron={false}
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

      {/* Message prompt — inline Modal capturing the optional contact note. */}
      <Modal
        visible={showMessagePrompt}
        transparent
        animationType="fade"
        onRequestClose={cancelMessagePrompt}
      >
        <View style={styles.promptBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.promptSheet}
          >
            <View
              style={[
                styles.promptContent,
                { backgroundColor: colors.secondarySystemGroupedBackground },
              ]}
            >
              <Text style={[typography.title3, { color: colors.label, fontWeight: '700' }]}>
                Lost Mode
              </Text>
              <Text
                style={[
                  typography.footnote,
                  { color: colors.secondaryLabel, marginTop: 6, marginBottom: 12 },
                ]}
              >
                Add an optional contact message so someone who finds this device knows how to
                reach you.
              </Text>
              <CupertinoTextField
                value={pendingMessage}
                onChangeText={setPendingMessage}
                placeholder="Contact message (optional)"
              />
              <View style={styles.promptActions}>
                <CupertinoButton
                  title="Cancel"
                  variant="plain"
                  onPress={cancelMessagePrompt}
                />
                <CupertinoButton
                  title="Save"
                  variant="filled"
                  onPress={confirmMessagePrompt}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Full-screen lost-mode overlay — only rendered while FindMyScreen is
          mounted and lostMode.active is true. It never blocks navigation away
          and never shows on any other screen. */}
      <Modal
        visible={lostMode.active}
        animationType="fade"
        onRequestClose={turnOffLostMode}
      >
        <View style={[styles.overlay, { backgroundColor: colors.systemBackground }]}>
          <Ionicons name="alert-circle" size={64} color={colors.systemRed} style={styles.overlayIcon} />
          <Text style={[typography.largeTitle, { color: colors.label, textAlign: 'center' }]}>
            This Device Is Marked as Lost
          </Text>
          {lostMode.message ? (
            <Text style={[typography.title3, { color: colors.secondaryLabel, textAlign: 'center', marginTop: 12 }]}>
              {`Reach me: ${lostMode.message}`}
            </Text>
          ) : null}
          <Text style={[typography.footnote, { color: colors.tertiaryLabel, textAlign: 'center', marginTop: 20 }]}>
            This does not lock your device
          </Text>
          <View style={styles.overlayButton}>
            <CupertinoButton
              title="Turn Off Lost Mode"
              variant="filled"
              onPress={turnOffLostMode}
            />
          </View>
        </View>
      </Modal>
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
  // Message prompt sheet
  promptBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  promptSheet: {
    width: '100%',
  },
  promptContent: {
    borderRadius: 14,
    padding: 20,
  },
  promptActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 16,
  },
  // Lost-mode overlay
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  overlayIcon: {
    marginBottom: 20,
  },
  overlayButton: {
    marginTop: 32,
    width: '100%',
  },
});
