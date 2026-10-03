import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Icon } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { type Feedback, findWorkout, getAthlete, useStore } from '@/data/store';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/metrics';

/** A coach comment. showAthlete adds the athlete's name (for the coach's sent list). */
export function FeedbackCard({ feedback: f, showAthlete }: { feedback: Feedback; showAthlete?: boolean }) {
  const router = useRouter();
  const theme = useTheme();
  const store = useStore();
  const found = f.workoutId ? findWorkout(store, f.workoutId) : null;
  const athlete = showAthlete ? getAthlete(store, f.athleteId) : null;

  return (
    <Card>
      <View style={styles.top}>
        <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
          <ThemedText style={[styles.avatarText, { color: theme.onPrimary }]}>
            {(athlete?.name ?? f.coach.split(' ').pop() ?? 'C').charAt(0)}
          </ThemedText>
        </View>
        <View style={styles.flex}>
          <ThemedText type="smallBold">{athlete ? `To ${athlete.name}` : f.coach}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDate(f.date)}
            {f.source === 'voice' ? ' · voice note' : ''}
            {athlete ? ` · ${f.coach}` : ''}
          </ThemedText>
        </View>
      </View>
      <ThemedText style={styles.message}>{f.message}</ThemedText>
      {found && (
        <Pressable
          onPress={() => router.push({ pathname: '/results/[id]', params: { id: found.workout.id } })}
          accessibilityRole="button"
          style={[styles.link, { backgroundColor: theme.accentSoft }]}>
          <ThemedText type="small" style={styles.flex} numberOfLines={1}>
            <ThemedText type="smallBold">Workout #{found.number}</ThemedText> · {found.workout.title}
          </ThemedText>
          <Icon name="chevron" size={14} color={theme.text} />
        </Pressable>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: 800,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
