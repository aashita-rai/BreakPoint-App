import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { HeaderLinks } from '@/components/header-links';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, HeroHeader, Icon } from '@/components/ui-kit';
import { WorkoutRow } from '@/components/workout-row';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { departmentLabel, getAthlete, session, useStore } from '@/data/store';
import { useTheme } from '@/hooks/use-theme';
import { STATUS_LABEL, rfiStatus } from '@/lib/fatigue';
import { formatDate } from '@/lib/metrics';

export default function WorkoutsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const store = useStore();
  const athlete = getAthlete(store, session.athleteId);
  const workouts = athlete?.workouts ?? [];
  const latest = workouts[0];

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <HeroHeader
          eyebrow={departmentLabel(session.departmentId)}
          title={athlete?.name || 'Athlete'}
          right={<HeaderLinks />}>
          {latest && (
            <Pressable
              onPress={() => router.push({ pathname: '/results/[id]', params: { id: latest.id } })}
              accessibilityRole="button"
              style={[styles.latest, { backgroundColor: theme.accent }]}>
              <View style={styles.latestTop}>
                <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
                  LATEST SET · {formatDate(latest.date)}
                </ThemedText>
                <Icon name="chevron" size={16} color={theme.onAccent} />
              </View>
              <ThemedText style={[styles.latestTitle, { color: theme.onAccent }]} numberOfLines={1}>
                {latest.title}
              </ThemedText>
              <View style={styles.latestStats}>
                <LatestStat value={String(latest.result.reps.length)} label="reps" />
                <LatestStat value={String(latest.result.overall_rfi)} label={`RFI · ${STATUS_LABEL[rfiStatus(latest.result.overall_rfi)]}`} />
                <LatestStat
                  value={latest.result.breakdown_rep ? `#${latest.result.breakdown_rep}` : 'None'}
                  label="breakdown rep"
                />
              </View>
            </Pressable>
          )}
        </HeroHeader>

        <View style={styles.body}>
          {latest && !latest.checkIn && (
            <Card style={{ backgroundColor: theme.accentSoft }}>
              <ThemedText type="smallBold">How did your last set feel?</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                A 30-second check-in lets your coach and athletic trainer compare how you felt with what the video showed.
              </ThemedText>
              <Button
                title="Check in"
                icon="checkin"
                onPress={() => router.push({ pathname: '/reflect', params: { id: latest.id } })}
              />
            </Card>
          )}

          <ThemedText style={styles.sectionTitle}>Most Recent Workouts</ThemedText>
          {workouts.length === 0 ? (
            <Card>
              <ThemedText type="smallBold">No sets yet</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Record a side-view squat video, or try the demo video, and your tempo, depth, speed and fatigue index will show up here.
              </ThemedText>
              <Button title="Go to Capture" icon="camera" variant="accent" onPress={() => router.navigate('/capture')} />
            </Card>
          ) : (
            workouts.map((w, i) => <WorkoutRow key={w.id} workout={w} number={i + 1} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function LatestStat({ value, label }: { value: string; label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.latestStat}>
      <ThemedText style={[styles.latestValue, { color: theme.onAccent }]}>{value}</ThemedText>
      <ThemedText type="small" style={{ color: theme.onAccent, opacity: 0.75 }}>
        {label}
      </ThemedText>
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
  latest: {
    borderRadius: 20,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  latestTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  latestTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: 800,
  },
  latestStats: {
    flexDirection: 'row',
    marginTop: Spacing.two,
  },
  latestStat: {
    flex: 1,
  },
  latestValue: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 900,
  },
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 800,
    marginVertical: Spacing.two,
  },
});
