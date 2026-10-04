import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Icon, StatusPill } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { isStaff } from '@/data/store';
import { useTheme } from '@/hooks/use-theme';
import { rfiStatus, STATUS_LABEL } from '@/lib/fatigue';
import { formatDate } from '@/lib/metrics';
import type { Insights, Workout } from '@/lib/squat-types';

/** One numbered entry in a "Most Recent Workouts" list. Opens the results screen. */
export function WorkoutRow({ workout, number }: { workout: Workout; number: number }) {
  const router = useRouter();
  const theme = useTheme();
  const { reps, overall_rfi, breakdown_rep } = workout.result;
  const mismatch = workout.report && workout.report.status !== 'consistent';

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/results/[id]', params: { id: workout.id } })}
      accessibilityRole="button">
      {({ pressed }) => (
        <Card style={[styles.row, pressed && { opacity: 0.85 }]}>
          <View style={[styles.badge, { backgroundColor: theme.accent }]}>
            <ThemedText style={[styles.badgeText, { color: theme.onAccent }]}>{number}</ThemedText>
          </View>
          <View style={styles.text}>
            <View style={styles.titleRow}>
              <ThemedText type="smallBold" style={[styles.title, styles.flex]} numberOfLines={1}>
                {workout.title}
              </ThemedText>
              {isStaff() && workout.insights && <FlagChip flag={workout.insights.flag} />}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {formatDate(workout.date)}
            </ThemedText>
            <View style={styles.chips}>
              <StatusPill status={rfiStatus(overall_rfi)} label={`${STATUS_LABEL[rfiStatus(overall_rfi)]} · RFI ${overall_rfi}`} />
              <Chip text={`${reps.length} reps`} />
              <Chip text={breakdown_rep ? `Breakdown @ rep ${breakdown_rep}` : 'No breakdown'} highlight={!!breakdown_rep} />
              {workout.checkIn?.pain && <Chip text="Pain reported" highlight />}
              {mismatch && <Chip text={workout.report?.status === 'under-reporting' ? 'Under-reported' : 'Over-reported'} highlight />}
            </View>
          </View>
          <Icon name="chevron" size={16} color={theme.textSecondary} />
        </Card>
      )}
    </Pressable>
  );
}

/** Coach/AT view: green when the athlete's check-in lines up with the movement data, red when it doesn't. */
export function FlagChip({ flag }: { flag: Insights['flag'] }) {
  const theme = useTheme();
  const red = flag === 'red';
  const color = red ? theme.statusRed : theme.statusGreen;
  return (
    <View
      style={[styles.flagChip, { borderColor: color }]}
      accessibilityLabel={red ? "Red flag: check-in doesn't match the data" : 'Green flag: check-in matches the data'}>
      <Icon name="flag" size={12} color={color} />
      <ThemedText type="smallBold" style={[styles.chipText, { color }]}>
        {red ? 'Mismatch' : 'Lines up'}
      </ThemedText>
    </View>
  );
}

export function Chip({ text, highlight }: { text: string; highlight?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: highlight ? theme.accentSoft : theme.backgroundSelected }]}>
      <ThemedText type="small" style={styles.chipText}>
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 18,
    fontWeight: 900,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  flagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: Spacing.one,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: 12,
    lineHeight: 16,
  },
});
