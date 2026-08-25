import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useWallet } from '../store/WalletStore';
import {
  CupertinoNavigationBar,
  CupertinoButton,
  CupertinoAlertDialog,
  PassCodeVisual,
} from '../components';
import type { AppNavigationProp, AppRouteProp } from '../navigation/types';

interface PassDetailScreenProps {
  navigation: AppNavigationProp;
  route: AppRouteProp<'PassDetail'>;
}

export function PassDetailScreen({ navigation, route }: PassDetailScreenProps) {
  const { passId } = route.params;
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { getPass, deletePass } = useWallet();
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);

  const pass = getPass(passId);

  if (!pass) {
    return (
      <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
        <CupertinoNavigationBar
          title="Pass"
          largeTitle={false}
          leftButton={
            <Pressable
              onPress={() => navigation.goBack()}
              style={styles.navButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={22} color={colors.systemBlue} />
              <Text style={[typography.body, { color: colors.systemBlue }]}>Wallet</Text>
            </Pressable>
          }
        />
        <View style={styles.notFound}>
          <Text style={[typography.body, { color: colors.secondaryLabel }]}>Pass not found.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title=""
        largeTitle={false}
        leftButton={
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.navButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.systemBlue} />
            <Text style={[typography.body, { color: colors.systemBlue }]}>Wallet</Text>
          </Pressable>
        }
        rightButton={
          <Pressable
            onPress={() => navigation.navigate('PassEdit', { passId: pass.id })}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Edit pass"
          >
            <Text style={[typography.body, { color: colors.systemBlue }]}>Edit</Text>
          </Pressable>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: pass.color }]}>
          <Text style={[typography.title1, styles.cardTitle]}>{pass.title}</Text>
          {pass.subtitle ? (
            <Text style={[typography.subhead, styles.cardSubtitle]}>{pass.subtitle}</Text>
          ) : null}
          <View style={styles.cardCodeArea}>
            <PassCodeVisual code={pass.code} />
          </View>
        </View>

        <View style={[styles.payContainer, { marginTop: spacing.lg }]}>
          <CupertinoButton
            title="Pay"
            variant="filled"
            onPress={() => navigation.navigate('CardDetail', { passId: pass.id })}
          />
        </View>

        <View style={styles.deleteContainer}>
          <CupertinoButton
            title="Delete Pass"
            variant="plain"
            destructive
            onPress={() => setShowDeleteAlert(true)}
          />
        </View>
      </ScrollView>

      <CupertinoAlertDialog
        visible={showDeleteAlert}
        onClose={() => setShowDeleteAlert(false)}
        title="Delete Pass"
        message={`Are you sure you want to delete ${pass.title}? This action cannot be undone.`}
        actions={[
          {
            label: 'Cancel',
            style: 'cancel',
            onPress: () => setShowDeleteAlert(false),
          },
          {
            label: 'Delete',
            style: 'destructive',
            onPress: () => {
              deletePass(pass.id);
              navigation.goBack();
            },
          },
        ]}
      />
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
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  card: {
    minHeight: 220,
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  cardSubtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 4,
  },
  cardCodeArea: {
    marginTop: 24,
  },
  payContainer: {
    paddingHorizontal: 20,
  },
  deleteContainer: {
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 8,
  },
});
