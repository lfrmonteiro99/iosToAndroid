import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Alert, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

const getLauncher = async () => {
  try { return (await import('../../modules/launcher-module/src')).default; }
  catch { return null; }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CameraScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const [lastPhoto, setLastPhoto] = useState<string | null>(null);
  const [flashOn, setFlashOn] = useState(false);

  const takePhoto = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera access is needed to take photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets[0]) {
        setLastPhoto(result.assets[0].uri);
      }
    } catch (e) {
      // Fallback: launch native camera app
      if (Platform.OS === 'android') {
        const mod = await getLauncher();
        if (mod) await mod.launchApp('com.android.camera2');
      }
    }
  }, []);

  const pickFromGallery = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      setLastPhoto(result.assets[0].uri);
    }
  }, []);

  const toggleFlash = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFlashOn((f) => !f);
    if (Platform.OS === 'android') {
      const mod = await getLauncher();
      if (mod) await mod.setFlashlight(!flashOn);
    }
  }, [flashOn]);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Top controls */}
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
        <Pressable onPress={toggleFlash} hitSlop={12}>
          <Ionicons name={flashOn ? 'flash' : 'flash-off'} size={24} color="#fff" />
        </Pressable>
      </View>

      {/* Viewfinder area */}
      <View style={styles.viewfinder}>
        {lastPhoto ? (
          <Image source={{ uri: lastPhoto }} style={styles.preview} resizeMode="contain" />
        ) : (
          <View style={styles.placeholderView}>
            <Ionicons name="camera-outline" size={80} color="rgba(255,255,255,0.3)" />
            <Text style={styles.placeholderText}>Tap the shutter button to take a photo</Text>
          </View>
        )}
      </View>

      {/* Mode selector */}
      <View style={styles.modeRow}>
        <Text style={styles.modeInactive}>VIDEO</Text>
        <Text style={styles.modeActive}>PHOTO</Text>
        <Text style={styles.modeInactive}>PORTRAIT</Text>
      </View>

      {/* Bottom controls */}
      <View style={styles.bottomBar}>
        {/* Gallery thumbnail */}
        <Pressable onPress={pickFromGallery} style={styles.galleryBtn}>
          {lastPhoto ? (
            <Image source={{ uri: lastPhoto }} style={styles.galleryThumb} />
          ) : (
            <View style={styles.galleryPlaceholder}>
              <Ionicons name="images-outline" size={20} color="#fff" />
            </View>
          )}
        </Pressable>

        {/* Shutter button */}
        <Pressable onPress={takePhoto} style={styles.shutterOuter}>
          <View style={styles.shutterInner} />
        </Pressable>

        {/* Flip camera */}
        <Pressable
          onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          style={styles.flipBtn}
        >
          <Ionicons name="camera-reverse-outline" size={28} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },

  viewfinder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  preview: { width: '100%', height: '100%' },
  placeholderView: { alignItems: 'center', gap: 16 },
  placeholderText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },

  modeRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, paddingVertical: 10 },
  modeActive: { color: '#FFD60A', fontSize: 13, fontWeight: '600' },
  modeInactive: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '500' },

  bottomBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 30, paddingVertical: 20 },

  galleryBtn: { width: 44, height: 44, borderRadius: 8, overflow: 'hidden' },
  galleryThumb: { width: 44, height: 44, borderRadius: 8 },
  galleryPlaceholder: { width: 44, height: 44, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },

  shutterOuter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },

  flipBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
