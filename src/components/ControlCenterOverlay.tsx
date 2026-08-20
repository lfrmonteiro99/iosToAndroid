import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { commitForPanel } from '../utils/gestureMachine';
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

export function ControlCenterOverlay({ zone, onCommit }: Props) {
  return (
    <EdgePanelOverlay
      zone={zone}
      onCommit={onCommit}
      sheetHeightFraction={0.55}
      commitPredicate={commitForPanel}
    >
      <Text style={styles.title}>Control Center</Text>
      <View style={styles.tileRow}>
        <View style={styles.tile} />
        <View style={styles.tile} />
        <View style={styles.tile} />
        <View style={styles.tile} />
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
  tileRow: {
    flexDirection: 'row',
    gap: 12,
  },
  tile: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
});
