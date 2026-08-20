import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { commitForNC } from '../utils/gestureMachine';
import { EdgePanelOverlay } from './EdgePanelOverlay';

interface Zone {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface Props {
  zone: Zone;
  onCommit: () => void;
}

export function NotificationCenterOverlay({ zone, onCommit }: Props) {
  return (
    <EdgePanelOverlay
      zone={zone}
      onCommit={onCommit}
      sheetHeightFraction={0.65}
      commitPredicate={commitForNC}
    >
      <Text style={styles.title}>Notification Center</Text>
      <View style={styles.notifRow}>
        <View style={styles.notifBar} />
        <View style={[styles.notifBar, { opacity: 0.6 }]} />
        <View style={[styles.notifBar, { opacity: 0.4 }]} />
      </View>
    </EdgePanelOverlay>
  );
}

const styles = StyleSheet.create({
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 24,
  },
  notifRow: {
    width: '85%',
    gap: 10,
  },
  notifBar: {
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
});
