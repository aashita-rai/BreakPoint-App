import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { HeaderLinks } from '@/components/header-links';
import { InsightsView } from '@/components/insights-view';
import { ReportView } from '@/components/report-view';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, HeroHeader } from '@/components/ui-kit';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { getAthlete, session, useStore } from '@/data/store';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/metrics';

export default function ReportScreen() {
  const router = useRouter();
  const theme = useTheme();
  const store = useStore();
  const { workoutId } = useLocalSearchParams<{ workoutId?: string }>();
  const workouts = getAthlete(store, session.athleteId)?.workouts ?? [];
  const workout = workouts.find((w) => w.id === workoutId && w.report) ?? workouts.find((w) => w.report);

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <HeroHeader eyebrow="Measured vs. reported" title="Report" right={<HeaderLinks signOut={false} />} />
        <View style={styles.body}>
          {workout?.report ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                For: <ThemedText type="smallBold">{workout.title}</ThemedText> · {formatDate(workout.date)} · RFI{' '}
                {workout.result.overall_rfi}
              </ThemedText>
              {workout.insights && <InsightsView insights={workout.insights} audience="athlete" />}
              <ReportView report={workout.report} checkIn={workout.checkIn} />
              <Button
                title="View this set's results"
                variant="ghost"
                onPress={() => router.push({ pathname: '/results/[id]', params: { id: workout.id } })}
              />
            </>
          ) : (
            <Card>
              <ThemedText type="smallBold">No report yet</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                After you check in on a set, you&apos;ll see how your reported effort compares with what the video showed, plus
                messages for you, your coach and your athletic trainer.
              </ThemedText>
              <Button title="View your workouts" icon="workouts" onPress={() => router.navigate('/workouts')} />
            </Card>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scroll: {
    paddingBottom: Spacing.five,
  },
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.three,
  },
});
