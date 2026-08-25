import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { withAutoLockSuppressed } from '../utils/permissions';
import { useTheme } from '../theme/ThemeContext';
import type { AppNavigationProp } from '../navigation/types';

// Attempt to import expo-camera; gracefully handle if unavailable. Mirrors
// CameraScreen.tsx's optional-native-module pattern so this screen stays
// IN-APP with a placeholder instead of crashing where the native module is
// missing (e.g. in Jest).
let CameraViewComponent: React.ComponentType<any> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any
type PermissionResult = { granted: boolean; canAskAgain: boolean } | null;
let useCameraPermissionsHook: (() => [PermissionResult, () => Promise<PermissionResult>]) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-camera');
  CameraViewComponent = mod.CameraView;
  useCameraPermissionsHook = mod.useCameraPermissions;
} catch (err) {
  // expo-camera not available (e.g. its native module is missing from a build).
  // eslint-disable-next-line no-console
  console.warn('[PassScanScreen] expo-camera unavailable, using placeholder:', err);
}

// Stub hook for when expo-camera is unavailable
function useStubPermissions(): [null, () => Promise<null>] {
  return [null, async () => null];
}

const useCamPerms = useCameraPermissionsHook ?? useStubPermissions;

type BarcodeScanningResult = { type: string; data: string };

export function PassScanScreen({ navigation }: { navigation: AppNavigationProp }) {
  const insets = useSafeAreaInsets();
  const { textScale } = useTheme();
  // Guards against onBarcodeScanned firing repeatedly for the same physical
  // barcode while the camera keeps streaming frames after a successful scan —
  // without it, every subsequent frame would push another PassEdit screen.
  const hasScannedRef = useRef(false);

  const [permission, requestPermission] = useCamPerms();

  // Request permission on mount. Showing the native camera-permission dialog
  // backgrounds the app, so this must go through withAutoLockSuppressed or a
  // slow reader gets auto-locked out mid-prompt.
  useEffect(() => {
    if (useCameraPermissionsHook && permission && !permission.granted && permission.canAskAgain) {
      withAutoLockSuppressed(requestPermission).catch(() => {});
    }
  }, [permission, requestPermission]);

  const handleBarcodeScanned = useCallback((result: BarcodeScanningResult) => {
    if (hasScannedRef.current) return;
    hasScannedRef.current = true;
    navigation.navigate('PassEdit', { prefillCode: result.data });
  }, [navigation]);

  const cameraUnavailable = !CameraViewComponent || !useCameraPermissionsHook;
  const permissionLoading = !cameraUnavailable && !permission;
  const permissionDenied = !cameraUnavailable && permission && !permission.granted;

  const renderViewfinder = () => {
    if (cameraUnavailable) {
      return (
        <View style={styles.placeholderView}>
          <Ionicons name="qr-code-outline" size={80} color="rgba(255,255,255,0.3)" />
          <Text style={[styles.placeholderText, { fontSize: 14 * textScale }]}>
            Camera preview unavailable.{'\n'}expo-camera is not installed.
          </Text>
        </View>
      );
    }

    if (permissionLoading) {
      return (
        <View style={styles.placeholderView}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={[styles.placeholderText, { fontSize: 14 * textScale }]}>Requesting camera permission...</Text>
        </View>
      );
    }

    if (permissionDenied) {
      return (
        <View style={styles.placeholderView}>
          <Ionicons name="lock-closed-outline" size={60} color="rgba(255,255,255,0.4)" />
          <Text style={[styles.placeholderText, { fontSize: 14 * textScale }]}>
            Camera permission denied.{'\n'}Please enable it in Settings.
          </Text>
          {permission?.canAskAgain && (
            <Pressable
              onPress={() => { withAutoLockSuppressed(requestPermission).catch(() => {}); }}
              style={styles.permissionBtn}
              accessibilityLabel="Grant camera permission"
              accessibilityRole="button"
            >
              <Text style={[styles.permissionBtnText, { fontSize: 14 * textScale }]}>Grant Permission</Text>
            </Pressable>
          )}
        </View>
      );
    }

    if (!CameraViewComponent) return null;
    const CameraView = CameraViewComponent;
    return (
      <CameraView
        style={styles.cameraPreview}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'pdf417', 'aztec'] }}
        onBarcodeScanned={handleBarcodeScanned}
        onMountError={(event: { nativeEvent?: { message?: string } }) => {
          // eslint-disable-next-line no-console
          console.warn('[PassScanScreen] camera mount error:', event?.nativeEvent?.message);
        }}
      />
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityLabel="Close scanner"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
        <Text style={[styles.title, { fontSize: 17 * textScale }]}>Scan Pass</Text>
        <View style={styles.spacer} />
      </View>

      <View style={styles.viewfinder}>
        {renderViewfinder()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    zIndex: 10,
  },
  title: { color: '#fff', fontWeight: '600' },
  spacer: { width: 28 },

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
});
