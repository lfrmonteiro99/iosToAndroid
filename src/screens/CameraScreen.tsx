import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useAlert } from '../components';

const getLauncher = async () => {
  try { return (await import('../../modules/launcher-module/src')).default; }
  catch { return null; }
};

// Attempt to import expo-camera; gracefully handle if unavailable
let CameraView: any = null;
let useCameraPermissions: any = null;
try {
  const mod = require('expo-camera');
  CameraView = mod.CameraView;
  useCameraPermissions = mod.useCameraPermissions;
} catch {
  // expo-camera not available
}

type CameraModeType = 'PHOTO' | 'VIDEO' | 'PORTRAIT';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CameraScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<any>(null);
  const [lastPhoto, setLastPhoto] = useState<string | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [mode, setMode] = useState<CameraModeType>('PHOTO');
  const [cameraReady, setCameraReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // Camera permissions via expo-camera hook (only if available)
  const permissionHookResult = useCameraPermissions ? useCameraPermissions() : [null, async () => null, async () => null];
  const [permission, requestPermission] = permissionHookResult;

  // Request permission on mount
  useEffect(() => {
    if (useCameraPermissions && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const onCameraReady = useCallback(() => {
    setCameraReady(true);
  }, []);

  const flipCamera = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  }, []);

  const toggleFlash = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFlashOn((f) => !f);
  }, []);

  const takePhoto = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!cameraRef.current || !cameraReady) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (photo?.uri) {
        setLastPhoto(photo.uri);
      }
    } catch (e) {
      // Fallback: use ImagePicker system camera
      try {
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.9,
          allowsEditing: false,
        });
        if (!result.canceled && result.assets[0]) {
          setLastPhoto(result.assets[0].uri);
        }
      } catch {
        if (Platform.OS === 'android') {
          const mod = await getLauncher();
          if (mod) await mod.launchApp('com.android.camera2');
        }
      }
    }
  }, [cameraReady]);

  const startRecording = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (!cameraRef.current || !cameraReady) return;
    setIsRecording(true);
    try {
      const result = await cameraRef.current.recordAsync({ maxDuration: 60 });
      if (result?.uri) {
        setLastPhoto(result.uri);
      }
    } catch {
      // recording failed or was stopped
    } finally {
      setIsRecording(false);
    }
  }, [cameraReady]);

  const stopRecording = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (cameraRef.current) {
      cameraRef.current.stopRecording();
    }
  }, []);

  const handleShutter = useCallback(() => {
    if (mode === 'VIDEO') {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    } else {
      // PHOTO and PORTRAIT both take a photo
      takePhoto();
    }
  }, [mode, isRecording, takePhoto, startRecording, stopRecording]);

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

  const selectMode = useCallback((newMode: CameraModeType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMode(newMode);
  }, []);

  // Determine camera mode prop for expo-camera
  const cameraMode = mode === 'VIDEO' ? 'video' : 'picture';

  // Fallback: expo-camera not available
  const cameraUnavailable = !CameraView || !useCameraPermissions;

  // Permission not yet determined
  const permissionLoading = !cameraUnavailable && !permission;

  // Permission denied
  const permissionDenied = !cameraUnavailable && permission && !permission.granted;

  const renderViewfinder = () => {
    if (cameraUnavailable) {
      return (
        <View style={styles.placeholderView}>
          <Ionicons name="camera-outline" size={80} color="rgba(255,255,255,0.3)" />
          <Text style={styles.placeholderText}>
            Camera preview unavailable.{'\n'}expo-camera is not installed.
          </Text>
        </View>
      );
    }

    if (permissionLoading) {
      return (
        <View style={styles.placeholderView}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.placeholderText}>Requesting camera permission...</Text>
        </View>
      );
    }

    if (permissionDenied) {
      return (
        <View style={styles.placeholderView}>
          <Ionicons name="lock-closed-outline" size={60} color="rgba(255,255,255,0.4)" />
          <Text style={styles.placeholderText}>
            Camera permission denied.{'\n'}Please enable it in Settings.
          </Text>
          {permission?.canAskAgain && (
            <Pressable
              onPress={requestPermission}
              style={styles.permissionBtn}
            >
              <Text style={styles.permissionBtnText}>Grant Permission</Text>
            </Pressable>
          )}
        </View>
      );
    }

    return (
      <CameraView
        ref={cameraRef}
        style={styles.cameraPreview}
        facing={facing}
        flash={flashOn ? 'on' : 'off'}
        mode={cameraMode}
        onCameraReady={onCameraReady}
        onMountError={() => {
          Alert.alert('Camera Error', 'Could not start camera preview.');
        }}
      />
    );
  };

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
        {renderViewfinder()}
      </View>

      {/* Mode selector */}
      <View style={styles.modeRow}>
        {(['VIDEO', 'PHOTO', 'PORTRAIT'] as CameraModeType[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => selectMode(m)}
            hitSlop={8}
            style={({ pressed }) => [
              styles.modeButton,
              pressed && styles.modeButtonPressed,
            ]}
          >
            <Text style={mode === m ? styles.modeActive : styles.modeInactive}>
              {m}
            </Text>
            {mode === m && <View style={styles.modeIndicator} />}
          </Pressable>
        ))}
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
        <Pressable onPress={handleShutter} style={styles.shutterOuter}>
          {mode === 'VIDEO' && isRecording ? (
            <View style={styles.shutterStop} />
          ) : mode === 'VIDEO' ? (
            <View style={styles.shutterRecord} />
          ) : (
            <View style={styles.shutterInner} />
          )}
        </Pressable>

        {/* Flip camera */}
        <Pressable onPress={flipCamera} style={styles.flipBtn}>
          <Ionicons name="camera-reverse-outline" size={28} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    zIndex: 10,
  },

  viewfinder: { flex: 1, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  cameraPreview: { width: '100%', height: '100%' },
  placeholderView: { alignItems: 'center', gap: 16 },
  placeholderText: { color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center' },

  permissionBtn: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
  },
  permissionBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 10,
  },
  modeButton: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  modeButtonPressed: {
    opacity: 0.6,
  },
  modeActive: { color: '#FFD60A', fontSize: 13, fontWeight: '600' },
  modeInactive: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '500' },
  modeIndicator: {
    marginTop: 4,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FFD60A',
  },

  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingVertical: 20,
  },

  galleryBtn: { width: 44, height: 44, borderRadius: 8, overflow: 'hidden' },
  galleryThumb: { width: 44, height: 44, borderRadius: 8 },
  galleryPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  shutterRecord: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF3B30',
  },
  shutterStop: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },

  flipBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
