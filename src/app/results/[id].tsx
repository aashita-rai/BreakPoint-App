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
import type { RepResult } from '@/lib/squat-types';
import { DEPTH_UNIT, formatClock, formatDate, formatDepth, formatSpeed, SPEED_UNIT } from '@/lib/metrics';
import { DEMO_VIDEO } from '@/services/squat-analysis';

/** e.g. "\n+1.6 rest" under the tempo in the rep table; "stall" wins if the rep stalled on the way up. */
function pauseTag(rep: RepResult) {
  const pauses = rep.pauses ?? [];
  if (!pauses.length) return '';
  const total = pauses.reduce((t, p) => t + p.s, 0).toFixed(1);
  const kind = pauses.some((p) => p.at === 'ascent') ? 'stall' : pauses.every((p) => p.at === 'top') ? 'rest' : 'pause';
  return `\n+${total} ${kind}`;
}

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
  // Knee angles only when the camera was side-on and the value fits the measured depth (server-checked).
  const angleReps = r.reps.filter((rep) => rep.knee_angle_ok === true);
  const PAUSE_WHERE = { top: 'resting while standing', bottom: 'at the bottom', descent: 'on the way down', ascent: 'stalled on the way up' } as const;
  const pauseNotes = r.reps.flatMap((rep) =>
    (rep.pauses ?? []).map((p) => {
      const counted = p.at !== 'top' && (rep.fatigue_pause_s ?? 0) > 0;
      return `Rep ${rep.i}: ${p.s.toFixed(1)} s ${PAUSE_WHERE[p.at]} (${counted ? 'counted as possible fatigue' : 'not counted'})`;
    })
  );
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
                {r.quality.usable ? 'Notes about this recording:' : 'Retake this set from the side, with your whole body visible and the phone steady.'}
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
                {breakdown ? `Sustained breakdown at rep ${breakdown.i} · ${formatClock(breakdown.start_t)}` : 'No sustained breakdown'}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.onAccent }}>
                {breakdown
                  ? 'From this rep on, the fatigue index stayed high: reps got slower, shallower or rose more slowly than your first reps.'
                  : 'No two consecutive reps crossed the breakdown threshold. Some fatigue may still be present without a sustained breakdown.'}
              </ThemedText>
            </View>
          </View>

          <View style={styles.tiles}>
            <StatTile label="Reps counted" value={String(r.reps.length)} />
            <StatTile label="Breakdown rep" value={r.breakdown_rep ? `#${r.breakdown_rep}` : 'No sustained breakdown'} />
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
            <ThemedText style={styles.cardTitle}>Rep tempo (moving time)</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Seconds spent moving down and up. Pauses are judged by where they happen: resting while standing never counts;
              stalling on the way up, or pausing at the bottom longer than in your first reps, counts as possible fatigue (bottom
              pauses never count in a pause squat). Your baseline: {r.baseline.tempo_s.toFixed(1)} s.
            </ThemedText>
            {pauseNotes.map((note) => (
              <ThemedText key={note} type="small" themeColor="textSecondary">
                • {note}
              </ThemedText>
            ))}
            <LineChart
              points={point((rep) => rep.tempo_s)}
              formatY={(v) => `${v.toFixed(1)}s`}
              formatX={(v) => `${Math.round(v)}`}
              markerX={r.breakdown_rep}
              xLabel="Rep number"
              yLabel="Moving seconds"
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
              {angleReps.length > 0 && (
                <>
                  <StatTile label="First knee angle" value={`${Math.round(angleReps[0].min_knee_angle)}°`} />
                  <StatTile label="Deepest knee angle" value={`${Math.round(Math.min(...angleReps.map((rep) => rep.min_knee_angle)))}°`} />
                </>
              )}
              <StatTile label="Peak rise speed" value={`${r.reps.length ? Math.max(...r.reps.map((rep) => rep.peak_ascent_speed)).toFixed(2) : '–'} L/s`} />
              <StatTile label="Bottom hip / knee" value={r.reps.length ? r.reps[r.reps.length - 1].hip_below_knee.toFixed(2) : '–'} />
            </View>
            {angleReps.length < r.reps.length && (
              <ThemedText type="small" themeColor="textSecondary">
                {r.view && !r.view.side_view
                  ? 'Knee angles are hidden because the camera wasn\'t side-on. Film from the side to see them.'
                  : angleReps.length === 0
                    ? 'Knee angles are hidden for this set because they didn\'t match the measured depth.'
                    : 'Some knee angles are hidden because they didn\'t match the measured depth.'}
              </ThemedText>
            )}
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
                  {pauseTag(rep)}
                </ThemedText>
                <ThemedText type="small" style={styles.cell}>
                  {formatDepth(rep.depth)}
                </ThemedText>
                <ThemedText type="small" style={styles.cell}>
                  {rep.knee_angle_ok ? `${Math.round(rep.min_knee_angle)}°` : '–'}
                </ThemedText>
                <ThemedText type="small" style={styles.cell}>
                  {formatSpeed(rep.ascent_speed)}
                </ThemedText>
                <View style={styles.statusCell}>
                  {rep.scored === false ? <ThemedText type="small" themeColor="textSecondary">Unscored</ThemedText> : <StatusPill status={rfiStatus(rep.rfi)} />}
                </View>
              </View>
            ))}
            <ThemedText type="small" themeColor="textSecondary">
              Depth in {DEPTH_UNIT}, speed in {SPEED_UNIT}. Status comes from the rep&apos;s fatigue index: Healthy below {STATUS_CUTOFFS.amber}, Caution from {STATUS_CUTOFFS.amber}, Fatigued from {STATUS_CUTOFFS.red}. Tempo is moving time; pauses are listed by where they happened. An angle shows
              &quot;–&quot; when it isn&apos;t reliable.{staff ? ` Model: ${r.model}.` : ''}
            </ThemedText>
          </Card>

          {workout.report ? (
            staff ? (
              <>
                <ThemedText style={styles.sectionTitle}>Athlete check-in</ThemedText>
                <ReportView report={workout.report} checkIn={workout.checkIn} result={workout.result} />
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
