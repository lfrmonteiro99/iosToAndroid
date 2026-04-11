import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Image, Pressable, Dimensions, ActivityIndicator, Alert, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../theme/ThemeContext';
import { CupertinoNavigationBar, CupertinoSegmentedControl } from '../components';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_GAP = 2;
const COLS = 3;
const THUMB_SIZE = (SCREEN_WIDTH - GRID_GAP * (COLS + 1)) / COLS;

interface PhotoAsset {
  id: string;
  uri: string;
  width: number;
  height: number;
  creationTime: number;
}

const TABS = ['Library', 'For You', 'Albums'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function PhotosScreen({ navigation }: { navigation: any }) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  const [tabIndex, setTabIndex] = useState(0);
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoAsset | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!cancelled) setHasPermission(status === 'granted');
        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPhotos((prev) => [
        { id: Date.now().toString(), uri: asset.uri, width: asset.width ?? 0, height: asset.height ?? 0, creationTime: Date.now() },
        ...prev,
      ]);
    }
  }, []);

  if (selectedPhoto) {
    return (
      <View style={[styles.fullView, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.fullTopBar}>
          <Pressable onPress={() => setSelectedPhoto(null)}>
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </Pressable>
          <Pressable onPress={() => Alert.alert('Share', 'Share functionality requires expo-sharing.')}>
            <Ionicons name="share-outline" size={24} color="#fff" />
          </Pressable>
        </View>
        <Image source={{ uri: selectedPhoto.uri }} style={styles.fullImage} resizeMode="contain" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.systemBackground }]}>
      <CupertinoNavigationBar
        title="Photos"
        leftButton={
          <Text style={[typography.body, { color: colors.systemBlue }]} onPress={() => navigation.goBack()}>
            Back
          </Text>
        }
        rightButton={
          <Pressable onPress={pickImage}>
            <Ionicons name="add" size={28} color={colors.systemBlue} />
          </Pressable>
        }
      />

      <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
        <CupertinoSegmentedControl
          values={TABS}
          selectedIndex={tabIndex}
          onChange={setTabIndex}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.systemBlue} />
        </View>
      ) : tabIndex === 0 ? (
        <ScrollView contentContainerStyle={[styles.gridContainer, { paddingBottom: insets.bottom + 90 }]}>
          {photos.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="images-outline" size={64} color={colors.systemGray3} />
              <Text style={[typography.headline, { color: colors.label, marginTop: 16 }]}>
                {hasPermission ? 'No Photos Yet' : 'Photo Access Required'}
              </Text>
              <Text style={[typography.body, { color: colors.secondaryLabel, textAlign: 'center', marginTop: 8, marginHorizontal: 32 }]}>
                {hasPermission
                  ? 'Photos you take or import will appear here. Tap + to add photos.'
                  : 'Grant photo library access to browse your photos.'
                }
              </Text>
              {hasPermission && (
                <Pressable style={[styles.browseBtn, { backgroundColor: colors.systemBlue }]} onPress={pickImage}>
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Browse Photos</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.grid}>
              {photos.map((photo) => (
                <Pressable key={photo.id} onPress={() => setSelectedPhoto(photo)}>
                  <Image source={{ uri: photo.uri }} style={styles.thumb} />
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      ) : tabIndex === 1 ? (
        <View style={styles.emptyState}>
          <Ionicons name="heart-outline" size={64} color={colors.systemGray3} />
          <Text style={[typography.headline, { color: colors.label, marginTop: 16 }]}>For You</Text>
          <Text style={[typography.body, { color: colors.secondaryLabel, textAlign: 'center', marginTop: 8 }]}>
            Memories and featured photos will appear here.
          </Text>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="folder-outline" size={64} color={colors.systemGray3} />
          <Text style={[typography.headline, { color: colors.label, marginTop: 16 }]}>Albums</Text>
          <Text style={[typography.body, { color: colors.secondaryLabel, textAlign: 'center', marginTop: 8 }]}>
            Create albums to organize your photos.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  gridContainer: { flexGrow: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, padding: GRID_GAP },
  thumb: { width: THUMB_SIZE, height: THUMB_SIZE },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 60 },
  browseBtn: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },

  fullView: { flex: 1, backgroundColor: '#000' },
  fullTopBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  fullImage: { flex: 1 },
});
