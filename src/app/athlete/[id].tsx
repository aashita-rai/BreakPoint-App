import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BarChart } from '@/components/charts';
import { FeedbackCard } from '@/components/feedback-card';
import { FeedbackComposer } from '@/components/feedback-composer';
import { InsightsView } from '@/components/insights-view';
import { ReportView } from '@/components/report-view';
import { ThemedText } from '@/components/themed-text';
import { Card, HeroHeader, Icon, StatTile, StatusPill } from '@/components/ui-kit';
import { WorkoutRow } from '@/components/workout-row';
import { MaxContentWidth, PastelOrange, Spacing } from '@/constants/theme';
import { departmentLabel, feedbackFor, getAthlete, useStore } from '@/data/store';
import { useTheme } from '@/hooks/use-theme';
import { rfiStatus } from '@/lib/fatigue';
import { formatDate, mean } from '@/lib/metrics';

/** Staff view of one athlete: the same data the athlete sees, plus their latest check-in report. */
export default function AthleteDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const athlete = getAthlete(store, id);

  const backButton = (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/athletes'))}
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={10}>
      <Icon name="back" size={22} color={PastelOrange} />
    </Pressable>
  );

  if (!athlete) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.background }]}>
        <HeroHeader title="Athlete not found" right={backButton} />
      </View>
    );
  }

  const first = athlete.name.split(' ')[0];
  const latest = athlete.workouts[0];
  const breakdowns = athlete.workouts.flatMap((w) => (w.result.breakdown_rep ? [w.result.breakdown_rep] : []));
  const latestReported = athlete.workouts.find((w) => w.report);
  const feedback = feedbackFor(store, athlete.id);
  // Oldest → newest, so the chart reads left to right in time.
  const chronological = athlete.workouts.map((w, i) => ({ w, number: i + 1 })).reverse();

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <HeroHeader
          eyebrow={`${athlete.detail} · ${departmentLabel(athlete.departmentId)}`}
          title={athlete.name}
          right={backButton}
        />

        <View style={styles.body}>
          {!latest ? (
            <Card>
              <ThemedText type="smallBold">No sets uploaded yet</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Once {first} captures a squat set, their stats will appear here.
              </ThemedText>
            </Card>
          ) : (
            <>
              <View style={styles.tiles}>
                <View style={[styles.rfiTile, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Latest fatigue index
                  </ThemedText>
                  <ThemedText style={styles.rfiValue}>{latest.result.overall_rfi}</ThemedText>
                  <StatusPill status={rfiStatus(latest.result.overall_rfi)} />
                </View>
                <StatTile label="Sets analyzed" value={String(athlete.workouts.length)} />
                <StatTile label="Avg breakdown rep" value={breakdowns.length ? `#${Math.round(mean(breakdowns))}` : 'None'} />
                <StatTile label="Latest effort" value={latestReported?.checkIn ? `${latestReported.checkIn.rpe}/10` : '–'} />
              </View>

              <Card>
                <ThemedText style={styles.cardTitle}>Fatigue index by session</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Overall RFI per session. Session 1 is the oldest. Higher means more fatigue by the end of the set.
                </ThemedText>
                <BarChart
                  points={chronological.map(({ w, number }, i) => ({
                    x: i + 1,
                    y: w.result.overall_rfi,
                    label: `Session ${i + 1} · ${formatDate(w.date)} · Workout #${number} in the list`,
                  }))}
                  formatY={(v) => `${Math.round(v)}`}
                  formatX={(v) => `${v}`}
                  xLabel="Session number (oldest → newest)"
                  yLabel="Fatigue (RFI)"
                />
              </Card>

              {latestReported?.insights && (
                <>
                  <ThemedText style={styles.sectionTitle}>AI analyzer · {formatDate(latestReported.date)}</ThemedText>
                  <InsightsView insights={latestReported.insights} audience="staff" />
                </>
              )}

              {latestReported?.report && (
                <>
                  <ThemedText style={styles.sectionTitle}>
                    Latest check-in · {formatDate(latestReported.date)}
                  </ThemedText>
                  <ReportView report={latestReported.report} checkIn={latestReported.checkIn} result={latestReported.result} />
                </>
              )}

              <ThemedText style={styles.sectionTitle}>Most Recent Workouts</ThemedText>
              {athlete.workouts.map((w, i) => (
                <WorkoutRow key={w.id} workout={w} number={i + 1} />
              ))}
            </>
          )}

          <FeedbackComposer athleteId={athlete.id} workoutId={null} heading={`Feedback for ${first}`} />

          {feedback.length > 0 && (
            <>
              <ThemedText style={styles.sectionTitle}>Feedback history</ThemedText>
              {feedback.map((f) => (
                <FeedbackCard key={f.id} feedback={f} />
              ))}
            </>
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
    paddingBottom: Spacing.six,
  },
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.three,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  rfiTile: {
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.three,
    gap: 4,
  },
  rfiValue: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: 800,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: 800,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 800,
    marginTop: Spacing.two,
  },
});
