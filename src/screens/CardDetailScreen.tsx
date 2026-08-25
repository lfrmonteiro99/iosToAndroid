import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../theme/ThemeContext';
import { useWallet } from '../store/WalletStore';
import { PASS_TYPE_LABELS } from './WalletScreen';
import { playStoreUrl } from './AppStoreScreen';
import { CupertinoNavigationBar } from '../components';
import type { AppNavigationProp, AppRouteProp } from '../navigation/types';
import { logger } from '../utils/logger';

// This screen was speced (#286) against a `CardStore`/`WalletCard` model
// (id, label, brand, last4, expiryMonth, expiryYear) that does not exist in
// this codebase — the actual #125 foundation (fix/280, WalletStore.tsx) is a
// generic pass model (`WalletPass`: boarding/ticket/loyalty/other) that
// deliberately carries no payment-card fields at all. There is no `brand`,
// `last4` or expiry anywhere in the store. This screen renders the closest
// equivalent from the real data: `title` as the label, the pass type label
// as the brand-equivalent, and a masked `code` as the last4-equivalent — the
// same "recognisable but not fully exposed" intent as a masked card number.

// Google Pay's Android package name, used only for the Play Store fallback
// when the app isn't installed — no card data is ever attached to this URL.
const GOOGLE_PAY_PACKAGE = 'com.google.android.apps.walletnfcrel';
// Best-effort deep link into the Google Pay app. There is no publicly
// documented custom scheme for it; this is guarded by canOpenURL below so an
// unregistered scheme just falls through to the Play Store listing.
const GOOGLE_PAY_DEEP_LINK = 'gpay://';

const PULSE_DURATION_MS = 400;
const SIMULATION_DURATION_MS = 1200;

export function maskCode(code: string): string {
  if (code.length <= 4) return code;
  return `•••• ${code.slice(-4)}`;
}

type PayState = 'idle' | 'processing' | 'success';

interface CardDetailScreenProps {
  navigation: AppNavigationProp;
  route: AppRouteProp<'CardDetail'>;
}

export function CardDetailScreen({ navigation, route }: CardDetailScreenProps) {
  const { passId } = route.params;
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { getPass } = useWallet();
  const pass = getPass(passId);

  const [payState, setPayState] = useState<PayState>('idle');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      loopRef.current?.stop();
    };
  }, []);

  const handleSimulatedPay = useCallback(() => {
    // Local animation state only — no store writes, no network calls, no
    // Linking. This is a VISUAL simulation only (#286): tapping "Pay" must
    // never leave this component or read/transmit card-identifying data.
    if (payState !== 'idle') return;
    setPayState('processing');
    loopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: PULSE_DURATION_MS, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: PULSE_DURATION_MS, useNativeDriver: true }),
      ]),
    );
    loopRef.current.start();
    timeoutRef.current = setTimeout(() => {
      loopRef.current?.stop();
      pulseAnim.setValue(1);
      setPayState('success');
    }, SIMULATION_DURATION_MS);
  }, [payState, pulseAnim]);

  const handleGooglePay = useCallback(async () => {
    try {
      const canOpen = await Linking.canOpenURL(GOOGLE_PAY_DEEP_LINK);
      if (canOpen) {
        await Linking.openURL(GOOGLE_PAY_DEEP_LINK);
      } else {
        await Linking.openURL(playStoreUrl(GOOGLE_PAY_PACKAGE));
      }
    } catch (err) {
      logger.warn('CardDetailScreen', 'could not open Google Pay', err);
    }
  }, []);

  const backButton = (
    <Pressable
      onPress={() => navigation.goBack()}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={styles.backBtn}
    >
      <Ionicons name="chevron-back" size={22} color={colors.systemBlue} />
      <Text style={[typography.body, { color: colors.systemBlue }]}>Back</Text>
    </Pressable>
  );

  if (!pass) {
    return (
      <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
        <CupertinoNavigationBar title="Card" largeTitle={false} leftButton={backButton} />
        <View style={styles.notFound}>
          <Text style={[typography.body, { color: colors.secondaryLabel }]}>Card not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <CupertinoNavigationBar title={pass.title} largeTitle={false} leftButton={backButton} />

      <View style={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.card, { backgroundColor: pass.color }]}>
          <Text style={[typography.title3, styles.cardLabel]} numberOfLines={1}>
            {pass.title}
          </Text>
          <Text style={[typography.footnote, styles.cardBrand]}>
            {PASS_TYPE_LABELS[pass.type]}
          </Text>
          <Text style={[typography.body, styles.cardCode]}>{maskCode(pass.code)}</Text>
        </View>

        <Pressable
          onPress={handleSimulatedPay}
          disabled={payState !== 'idle'}
          accessibilityRole="button"
          accessibilityLabel="Pay"
          style={[styles.payButton, { backgroundColor: colors.systemBlue }]}
        >
          <Animated.View
            style={{ transform: [{ scale: payState === 'processing' ? pulseAnim : 1 }] }}
          >
            <Ionicons
              name={payState === 'success' ? 'checkmark-circle' : 'wifi-outline'}
              size={22}
              color="#FFFFFF"
            />
          </Animated.View>
          <Text style={[typography.body, styles.payLabel]}>
            {payState === 'success' ? 'Paid' : 'Pay'}
          </Text>
        </Pressable>
        <Text style={[typography.caption1, styles.disclaimer, { color: colors.secondaryLabel }]}>
          Simulated — no charge is made.
        </Text>

        <Pressable
          onPress={handleGooglePay}
          accessibilityRole="button"
          accessibilityLabel="Pay with Google Pay"
          style={[styles.googlePayButton, { borderColor: colors.systemGray3 }]}
        >
          <Text style={[typography.body, { color: colors.label }]}>Pay with Google Pay</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 24 },
  card: {
    borderRadius: 16,
    padding: 20,
    minHeight: 140,
    justifyContent: 'space-between',
  },
  cardLabel: { color: '#FFFFFF' },
  cardBrand: { color: 'rgba(255,255,255,0.8)' },
  cardCode: { color: '#FFFFFF', marginTop: 8, letterSpacing: 1 },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    borderRadius: 12,
    marginTop: 24,
  },
  payLabel: { color: '#FFFFFF', marginLeft: 8, fontWeight: '600' },
  disclaimer: { textAlign: 'center', marginTop: 8 },
  googlePayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
  },
});
