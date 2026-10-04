import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BarChart, LineChart } from '@/components/charts';
import { FeedbackComposer } from '@/components/feedback-composer';
import { InsightsView } from '@/components/insights-view';
import { ReportView } from '@/components/report-view';
import { ResultVideo } from '@/components/result-video';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, HeroHeader, Icon, StatTile, StatusPill } from '@/components/ui-kit';
import { MaxContentWidth, PastelOrange, Spacing } from '@/constants/theme';
import { findWorkout, isStaff, useStore } from '@/data/store';
import { useTheme } from '@/hooks/use-theme';
import { STATUS_CUTOFFS } from '@/lib/config';
import { rfiStatus } from '@/lib/fatigue';
import { DEPTH_UNIT, formatClock, formatDate, formatDepth, formatSpeed, SPEED_UNIT } from '@/lib/metrics';
import { DEMO_VIDEO } from '@/services/squat-analysis';

export default function ResultsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const found = findWorkout(store, id);
  const staff = isStaff();

  const goBack = () => (router.canGoBack() ? router.back() : router.replace(staff ? '/athletes' : '/workouts'));
  const backButton = (
    <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}>
      <Icon name="back" size={22} color={PastelOrange} />
    </Pressable>
  );

  if (!found) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.background }]}>
        <HeroHeader title="Workout not found" right={backButton} />
      </View>
    );
  }

  const { workout, athlete, number } = found;
  const r = workout.result;
  const breakdown = r.breakdown_rep ? r.reps.find((x) => x.i === r.breakdown_rep) : undefined;
  const isDemo = workout.title.startsWith('Demo');
  const videoSource = r.annotated_video_url ?? (isDemo ? DEMO_VIDEO : null) ?? workout.videoUri ?? null;
  const point = (y: (rep: (typeof r.reps)[number]) => number) =>
    r.reps.map((rep) => ({ x: rep.i, y: y(rep), label: `Rep ${rep.i} · ${formatClock(rep.start_t)}` }));

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <HeroHeader
          eyebrow={`${staff ? `${athlete.name} · ` : ''}Workout #${number} · ${formatDate(workout.date)}`}
          title={workout.title}
          right={backButton}
        />

        <View style={styles.body}>
          {videoSource != null && (
            <ResultVideo source={videoSource} annotated={!!r.annotated_video_url || isDemo} />
          )}

          {r.quality && (!r.quality.usable || r.quality.warnings.length > 0) && (
            <Card style={{ borderColor: theme.statusAmber, borderWidth: 1 }}>
              <ThemedText type="smallBold">Video quality note</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {r.quality.usable ? 'The result is usable, but some tracking was uncertain.' : 'Retake this set with your whole body visible and the phone steady.'}
              </ThemedText>
              {r.quality.warnings.map((warning) => (
                <ThemedText key={warning} type="small" themeColor="textSecondary">
                  • {warning}
                </ThemedText>
              ))}
            </Card>
          )}

          <View style={[styles.banner, { backgroundColor: theme.accent }]}>
            <Icon name="flame" size={26} color={theme.onAccent} />
            <View style={styles.flex}>
              <ThemedText style={[styles.bannerTitle, { color: theme.onAccent }]}>
                {breakdown ? `Breakdown at rep ${breakdown.i} · ${formatClock(breakdown.start_t)}` : 'No breakdown rep'}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.onAccent }}>
                {breakdown
                  ? 'From this rep on, the fatigue index stayed high: reps got slower, shallower or rose more slowly than your first reps.'
                  : 'Tempo, depth and rep speed stayed close to your first reps for the whole set.'}
              </ThemedText>
            </View>
          </View>

          <View style={styles.tiles}>
            <StatTile label="Reps counted" value={String(r.reps.length)} />
            <StatTile label="Breakdown rep" value={r.breakdown_rep ? `#${r.breakdown_rep}` : 'None'} />
            <View style={[styles.rfiTile, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <ThemedText type="small" themeColor="textSecondary">
                Overall fatigue index
              </ThemedText>
              <ThemedText style={styles.rfiValue}>
                {r.overall_rfi}
                <ThemedText type="small" themeColor="textSecondary">
                  {' '}
                  / 100
                </ThemedText>
              </ThemedText>
              <StatusPill status={rfiStatus(r.overall_rfi)} />
            </View>
          </View>

          {workout.insights && <InsightsView insights={workout.insights} audience={staff ? 'staff' : 'athlete'} />}

          <Card>
            <ThemedText style={styles.cardTitle}>Rep tempo</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Seconds per rep. Rising means you&apos;re slowing down. Your baseline: {r.baseline.tempo_s.toFixed(1)} s.
            </ThemedText>
            <LineChart
              points={point((rep) => rep.tempo_s)}
              formatY={(v) => `${v.toFixed(1)}s`}
              formatX={(v) => `${Math.round(v)}`}
              markerX={r.breakdown_rep}
              xLabel="Rep number"
              yLabel="Seconds per rep"
            />
          </Card>

          <Card>
            <ThemedText style={styles.cardTitle}>Squat depth</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              How far your hips dropped, as a fraction of your leg length. Shorter bars are shallower squats. Baseline:{' '}
              {formatDepth(r.baseline.depth)}.
            </ThemedText>
            <BarChart
              points={point((rep) => rep.depth)}
              formatY={(v) => formatDepth(v)}
              formatX={(v) => `${v}`}
              markerX={r.breakdown_rep}
              xLabel="Rep number"
              yLabel="Depth (× leg length)"
            />
          </Card>

          <Card>
            <ThemedText style={styles.cardTitle}>Ascent speed</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              How fast your hips rise, in leg lengths per second. Falling means you&apos;re slowing down. Baseline:{' '}
              {formatSpeed(r.baseline.ascent_speed)} {SPEED_UNIT}.
            </ThemedText>
            <LineChart
              points={point((rep) => rep.ascent_speed)}
              formatY={(v) => formatSpeed(v)}
              formatX={(v) => `${Math.round(v)}`}
              markerX={r.breakdown_rep}
              xLabel="Rep number"
              yLabel="Ascent speed (L/s)"
            />
          </Card>

          <Card>
            <ThemedText style={styles.cardTitle}>Form details</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Secondary measurements from the pose track. They add context to depth and speed; they are not clinical measurements.
            </ThemedText>
            <View style={styles.detailGrid}>
              <StatTile label="Baseline knee angle" value={`${r.reps.length ? Math.round(r.reps[0].min_knee_angle) : '–'}°`} />
              <StatTile label="Deepest knee angle" value={`${r.reps.length ? Math.round(Math.min(...r.reps.map((rep) => rep.min_knee_angle))) : '–'}°`} />
              <StatTile label="Peak rise speed" value={`${r.reps.length ? Math.max(...r.reps.map((rep) => rep.peak_ascent_speed)).toFixed(2) : '–'} L/s`} />
              <StatTile label="Bottom hip / knee" value={r.reps.length ? r.reps[r.reps.length - 1].hip_below_knee.toFixed(2) : '–'} />
            </View>
          </Card>

          <Card>
            <ThemedText style={styles.cardTitle}>Rep table</ThemedText>
            <View style={[styles.tableRow, { borderBottomColor: theme.border }]}>
              {['Rep', 'Tempo', 'Depth', 'Angle', 'Speed', 'Status'].map((h) => (
                <ThemedText key={h} type="smallBold" themeColor="textSecondary" style={h === 'Status' ? styles.statusCell : styles.cell}>
                  {h}
                </ThemedText>
              ))}
            </View>
            {r.reps.map((rep) => (
              <View key={rep.i} style={[styles.tableRow, { borderBottomColor: theme.border }]}>
                <ThemedText type="smallBold" style={styles.cell}>
                  {rep.i}
                </ThemedText>
                <ThemedText type="small" style={styles.cell}>
                  {rep.tempo_s.toFixed(1)}s
                </ThemedText>
                <ThemedText type="small" style={styles.cell}>
                  {formatDepth(rep.depth)}
                </ThemedText>
                <ThemedText type="small" style={styles.cell}>
                  {Math.round(rep.min_knee_angle)}°
                </ThemedText>
                <ThemedText type="small" style={styles.cell}>
                  {formatSpeed(rep.ascent_speed)}
                </ThemedText>
                <View style={styles.statusCell}>
                  <StatusPill status={rfiStatus(rep.rfi)} />
                </View>
              </View>
            ))}
            <ThemedText type="small" themeColor="textSecondary">
              Depth in {DEPTH_UNIT}, speed in {SPEED_UNIT}. Status comes from the rep&apos;s fatigue index: Healthy below {STATUS_CUTOFFS.amber}, Caution from {STATUS_CUTOFFS.amber}, Fatigued from {STATUS_CUTOFFS.red}. Model: {r.model}.
            </ThemedText>
          </Card>

          {workout.report ? (
            staff ? (
              <>
                <ThemedText style={styles.sectionTitle}>Athlete check-in</ThemedText>
                <ReportView report={workout.report} checkIn={workout.checkIn} />
              </>
            ) : (
              <Button
                title="See my report"
                icon="report"
                onPress={() => router.navigate({ pathname: '/report', params: { workoutId: workout.id } })}
              />
            )
          ) : staff ? (
            <ThemedText type="small" themeColor="textSecondary">
              {athlete.name.split(' ')[0]} hasn&apos;t checked in on this set yet.
            </ThemedText>
          ) : (
            <Button
              title="Check in on this set"
              icon="checkin"
              variant="accent"
              onPress={() => router.push({ pathname: '/reflect', params: { id: workout.id, from: 'results' } })}
            />
          )}

          {staff && (
            <FeedbackComposer athleteId={athlete.id} workoutId={workout.id} heading={`Feedback on workout #${number}`} />
          )}

          <ThemedText type="small" themeColor="textSecondary">
            Fatigue is judged from tempo, depth and speed against your own first reps. It is a screening aid for human review, not a medical
            measurement or diagnosis.
          </ThemedText>
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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 18,
    padding: Spacing.three,
  },
  bannerTitle: {
    fontSize: 17,
    fontWeight: 800,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  rfiTile: {
    flexGrow: 1,
    flexBasis: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.three,
    gap: 4,
  },
  rfiValue: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: 900,
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
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  cell: {
    flex: 1,
  },
  statusCell: {
    flex: 1.3,
  },
});
