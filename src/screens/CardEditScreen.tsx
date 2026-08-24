import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useCard, CardBrand } from '../store/CardStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoTextField,
} from '../components';
import type { AppNavigationProp } from '../navigation/types';

export const BRAND_LABELS: Record<CardBrand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  other: 'Card',
};

/**
 * Pure brand sniffer, not a payment-network integration — recognises the
 * public IIN ranges for Visa/Mastercard/Amex from the leading digits only.
 */
export function detectCardBrand(cardNumber: string): CardBrand {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length === 0) return 'other';
  if (/^4/.test(digits)) return 'visa';
  if (/^3[47]/.test(digits)) return 'amex';
  const prefix2 = parseInt(digits.slice(0, 2), 10);
  const prefix4 = parseInt(digits.slice(0, 4), 10);
  if ((prefix2 >= 51 && prefix2 <= 55) || (prefix4 >= 2221 && prefix4 <= 2720)) {
    return 'mastercard';
  }
  return 'other';
}

function formatExpiryInput(text: string): string {
  const raw = text.replace(/\D/g, '').slice(0, 4);
  if (raw.length <= 2) return raw;
  return `${raw.slice(0, 2)}/${raw.slice(2)}`;
}

export function CardEditScreen() {
  const navigation = useNavigation<AppNavigationProp>();
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const { addCard } = useCard();
  const insets = useSafeAreaInsets();

  const [label, setLabel] = useState('');
  // Full number and CVV live ONLY in this component's local state, for the
  // duration of the form. They are read here to derive brand/last4/validity
  // and nowhere else — never assigned to store state, props, or navigation
  // params, and never passed to SecureStore (issue #285 hard constraint).
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');

  const digits = useMemo(() => cardNumber.replace(/\D/g, ''), [cardNumber]);
  const brand = useMemo(() => detectCardBrand(digits), [digits]);
  const last4 = digits.length >= 4 ? digits.slice(-4) : '';
  const numberValid = digits.length >= 13 && digits.length <= 19;

  const expiryDigits = expiry.replace(/\D/g, '');
  const expiryMonth = expiryDigits.length >= 2 ? parseInt(expiryDigits.slice(0, 2), 10) : NaN;
  const expiryYearDigits = expiryDigits.slice(2, 4);
  const expiryValid = expiryDigits.length === 4 && expiryMonth >= 1 && expiryMonth <= 12;

  const cvvDigits = cvv.replace(/\D/g, '');
  const cvvValid = cvvDigits.length >= 3 && cvvDigits.length <= 4;

  const canSave = numberValid && expiryValid && cvvValid;

  function handleDone() {
    if (!canSave) return;
    const expiryYear = 2000 + parseInt(expiryYearDigits, 10);
    const trimmedLabel = label.trim();
    addCard({
      label: trimmedLabel || `${BRAND_LABELS[brand]} •••• ${last4}`,
      brand,
      last4,
      expiryMonth,
      expiryYear,
    });
    navigation.goBack();
  }

  const iconColor = colors.systemGray;

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Add Card"
        largeTitle={false}
        leftButton={
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Cancel" accessibilityRole="button">
            <Text style={[typography.body, { color: colors.systemBlue }]}>Cancel</Text>
          </Pressable>
        }
        rightButton={
          <Pressable onPress={handleDone} disabled={!canSave} hitSlop={8} accessibilityLabel="Done" accessibilityRole="button">
            <Text
              style={[
                typography.headline,
                { color: canSave ? colors.systemBlue : colors.secondaryLabel },
              ]}
            >
              Done
            </Text>
          </Pressable>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: spacing.lg,
          paddingBottom: insets.bottom + 90,
          paddingHorizontal: 16,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <CupertinoListSection>
          <CupertinoTextField
            value={label}
            onChangeText={setLabel}
            placeholder="Label (e.g. Personal Visa)"
            autoCapitalize="words"
            prefix={<Ionicons name="pricetag-outline" size={18} color={iconColor} />}
            returnKeyType="next"
            containerStyle={styles.fieldContainer}
          />
        </CupertinoListSection>

        <CupertinoListSection>
          <CupertinoTextField
            value={cardNumber}
            onChangeText={setCardNumber}
            placeholder="Card Number"
            keyboardType="number-pad"
            maxLength={19}
            prefix={<Ionicons name="card-outline" size={18} color={iconColor} />}
            returnKeyType="next"
            containerStyle={styles.fieldContainer}
          />
        </CupertinoListSection>
        {digits.length > 0 && (
          <Text style={[typography.caption1, styles.hint, { color: colors.secondaryLabel }]}>
            {`${brand !== 'other' ? BRAND_LABELS[brand] : 'Card'}${last4 ? ` •••• ${last4}` : ''}`}
          </Text>
        )}

        <CupertinoListSection>
          <CupertinoTextField
            value={expiry}
            onChangeText={(text) => setExpiry(formatExpiryInput(text))}
            placeholder="MM/YY"
            keyboardType="number-pad"
            maxLength={5}
            prefix={<Ionicons name="calendar-outline" size={18} color={iconColor} />}
            returnKeyType="next"
            containerStyle={styles.fieldContainer}
          />
          <CupertinoTextField
            value={cvv}
            onChangeText={(text) => setCvv(text.replace(/\D/g, '').slice(0, 4))}
            placeholder="CVV"
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
            prefix={<Ionicons name="lock-closed-outline" size={18} color={iconColor} />}
            returnKeyType="done"
            containerStyle={styles.fieldContainer}
          />
        </CupertinoListSection>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  fieldContainer: {
    marginBottom: 1,
  },
  hint: {
    marginTop: 4,
    marginBottom: 4,
    marginHorizontal: 4,
  },
});
