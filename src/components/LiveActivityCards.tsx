import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useLiveActivity } from '../hooks/useLiveActivity';
import { CupertinoCard } from './CupertinoCard';
import { CupertinoProgressBar } from './CupertinoProgressBar';

// #639 — example Live Activity cards that CONSUME the #626 helper
// (useLiveActivity). Each card maps domain data into LiveActivityContent and
// posts it via the hook, so the on-screen card and the ongoing notification
// stay in sync. Covers the four use-cases named in the issue: transport
// (Uber), live sports (match), timers and parcel tracking.

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** part / whole, clamped to 0..1. A zero or negative `whole` yields 0 (no NaN). */
export function fractionOf(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0;
  return clamp01(part / whole);
}

/** mm:ss, always clamped to non-negative. */
export function formatRemainingMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function CardShell({
  title,
  subtitle,
  progress,
  children,
}: {
  title: string;
  subtitle: string;
  progress: number;
  children?: React.ReactNode;
}) {
  const { theme, typography, spacing, shape } = useTheme();
  const { colors } = theme;
  return (
    <CupertinoCard
      style={{
        borderRadius: shape.card.radius,
        marginBottom: spacing.md,
      }}
    >
      <Text style={[typography.headline, { color: colors.label }]}>{title}</Text>
      <Text
        style={[
          typography.subhead,
          { color: colors.secondaryLabel, marginBottom: spacing.sm },
        ]}
      >
        {subtitle}
      </Text>
      <CupertinoProgressBar progress={clamp01(progress)} />
      {children}
    </CupertinoCard>
  );
}

interface RideActivityCardProps {
  id: string;
  active: boolean;
  driverName: string;
  etaText: string;
  destination: string;
  /** 0..1 fraction of the trip already completed. */
  progress: number;
}

/** Transport / ride-share equivalent of an iOS Live Activity (Uber). */
export function RideActivityCard({
  id,
  active,
  driverName,
  etaText,
  destination,
  progress,
}: RideActivityCardProps) {
  const title = 'Uber';
  const text = `${driverName} · ${etaText}`;
  const pct = Math.round(clamp01(progress) * 100);
  useLiveActivity({
    id,
    active,
    content: { title, text, progress: pct, maxProgress: 100 },
  });
  if (!active) return null;
  return (
    <CardShell title={title} subtitle={text} progress={progress}>
      <RideTo destination={destination} />
    </CardShell>
  );
}

function RideTo({ destination }: { destination: string }) {
  const { typography, spacing, theme } = useTheme();
  return (
    <Text
      style={[
        typography.footnote,
        { color: theme.colors.tertiaryLabel, marginTop: spacing.sm },
      ]}
    >
      → {destination}
    </Text>
  );
}

interface MatchActivityCardProps {
  id: string;
  active: boolean;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  /** Match clock, e.g. "67'". */
  clock: string;
  /** 0..1 fraction of the match elapsed. */
  progress: number;
}

/** Live sports score equivalent of an iOS Live Activity. */
export function MatchActivityCard({
  id,
  active,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  clock,
  progress,
}: MatchActivityCardProps) {
  const title = `${homeTeam} vs ${awayTeam}`;
  const text = `${homeScore}–${awayScore} · ${clock}`;
  const pct = Math.round(clamp01(progress) * 100);
  useLiveActivity({
    id,
    active,
    content: { title, text, progress: pct, maxProgress: 100 },
  });
  if (!active) return null;
  return <CardShell title={title} subtitle={text} progress={progress} />;
}

interface TimerActivityCardProps {
  id: string;
  active: boolean;
  label: string;
  /** Milliseconds remaining. */
  remainingMs: number;
  /** Total duration in milliseconds (must be > 0 for a meaningful fraction). */
  totalMs: number;
}

/** Countdown timer equivalent of an iOS Live Activity. */
export function TimerActivityCard({
  id,
  active,
  label,
  remainingMs,
  totalMs,
}: TimerActivityCardProps) {
  const elapsed = Math.max(0, totalMs - remainingMs);
  const fraction = fractionOf(elapsed, totalMs);
  const remaining = formatRemainingMs(remainingMs);
  useLiveActivity({
    id,
    active,
    content: {
      title: label,
      text: remaining,
      progress: Math.round(fraction * 100),
      maxProgress: 100,
    },
  });
  if (!active) return null;
  return <CardShell title={label} subtitle={remaining} progress={fraction} />;
}

interface TrackingActivityCardProps {
  id: string;
  active: boolean;
  carrier: string;
  status: string;
  /** Zero-based index of the current step. */
  stepIndex: number;
  /** Total number of steps in the journey (must be > 0 for a fraction). */
  totalSteps: number;
}

/** Parcel / location tracking equivalent of an iOS Live Activity. */
export function TrackingActivityCard({
  id,
  active,
  carrier,
  status,
  stepIndex,
  totalSteps,
}: TrackingActivityCardProps) {
  const fraction = fractionOf(stepIndex, totalSteps);
  useLiveActivity({
    id,
    active,
    content: {
      title: carrier,
      text: status,
      progress: Math.round(fraction * 100),
      maxProgress: 100,
    },
  });
  if (!active) return null;
  return <CardShell title={carrier} subtitle={status} progress={fraction} />;
}

/**
 * Demo deck wiring all four example cards to the #626 hook. Useful as a
 * reference screen and for integration tests. Each card gets a stable,
 * distinct id so the hook never conflates their ongoing notifications.
 */
export function LiveActivityExampleDeck() {
  return (
    <View style={styles.deck}>
      <RideActivityCard
        id="example-ride"
        active
        driverName="Ana"
        etaText="2 min away"
        destination="Home"
        progress={0.8}
      />
      <MatchActivityCard
        id="example-match"
        active
        homeTeam="Benfica"
        awayTeam="Porto"
        homeScore={2}
        awayScore={1}
        clock="67'"
        progress={0.5}
      />
      <TimerActivityCard
        id="example-timer"
        active
        label="Tea"
        remainingMs={30000}
        totalMs={60000}
      />
      <TrackingActivityCard
        id="example-track"
        active
        carrier="DHL"
        status="Out for delivery"
        stepIndex={2}
        totalSteps={4}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  deck: {
    flex: 1,
  },
});
