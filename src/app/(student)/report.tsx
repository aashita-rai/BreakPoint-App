import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

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
  const athlete = getAthlete(store, session.athleteId);
  const workouts = athlete?.workouts ?? [];
  const reportWorkouts = workouts.filter((w) => w.report);
  const [selectedId, setSelectedId] = useState(workoutId ?? reportWorkouts[0]?.id ?? '');
  const workout = reportWorkouts.find((w) => w.id === selectedId) ?? reportWorkouts[0];
  const plainLanguage = workout?.insights;

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <HeroHeader eyebrow="Measured vs. reported" title="Report" right={<HeaderLinks signOut={false} />} />
        <View style={styles.body}>
          {workout?.report ? (
            <>
              {reportWorkouts.length > 1 && (
                <Card>
                  <ThemedText type="smallBold">Choose a report</ThemedText>
                  <View style={styles.reportChoices}>
                    {reportWorkouts.map((item) => {
                      const selected = item.id === workout.id;
                      return (
                        <Pressable key={item.id} onPress={() => setSelectedId(item.id)} accessibilityRole="button" accessibilityState={{ selected }}
                          style={[styles.reportChoice, { backgroundColor: selected ? theme.primary : theme.background, borderColor: selected ? theme.primary : theme.border }]}>
                          <ThemedText type="smallBold" style={{ color: selected ? theme.onPrimary : theme.text }}>{item.title}</ThemedText>
                          <ThemedText type="small" style={{ color: selected ? theme.onPrimary : theme.textSecondary }}>{formatDate(item.date)}</ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </Card>
              )}
              <ThemedText type="small" themeColor="textSecondary">
                For: <ThemedText type="smallBold">{workout.title}</ThemedText> · {formatDate(workout.date)} · RFI{' '}
                {workout.result.overall_rfi}
              </ThemedText>
              {plainLanguage && <InsightsView insights={plainLanguage} audience="athlete" />}
              <ReportView report={workout.report} checkIn={workout.checkIn} result={workout.result} />
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
  reportChoices: {
    gap: Spacing.one,
  },
  reportChoice: {
    borderWidth: 1,
    borderRadius: 10,
    padding: Spacing.two,
  },
});
