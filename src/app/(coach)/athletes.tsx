import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { HeaderLinks } from '@/components/header-links';
import { ThemedText } from '@/components/themed-text';
import { Card, HeroHeader, Icon, StatusPill } from '@/components/ui-kit';
import { Chip, FlagChip } from '@/components/workout-row';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { type Athlete, athletesIn, departmentLabel, session, useStore } from '@/data/store';
import { useTheme } from '@/hooks/use-theme';
import { rfiStatus, type Status, STATUS_LABEL } from '@/lib/fatigue';
import { formatDate } from '@/lib/metrics';
import { hasApi, requestWeeklyDashboard, type WeeklyDashboard } from '@/services/api';

// README §9 Team tab: traffic-light list of athletes with tap-through to their charts.

type Filter = 'all' | 'recent' | 'red' | 'flagged' | 'feedback';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'recent', label: 'Recent' },
  { id: 'red', label: 'Fatigued' },
  { id: 'flagged', label: 'Red flag, mismatch or pain' },
  { id: 'feedback', label: 'Needs feedback' },
];

const lastName = (name: string) => name.replace(/ (Jr\.|III|II)$/, '').split(' ').pop() ?? name;

function latestStatus(a: Athlete): Status | null {
  return a.workouts[0] ? rfiStatus(a.workouts[0].result.overall_rfi) : null;
}

function flags(a: Athlete) {
  const w = a.workouts[0];
  return {
    pain: !!w?.checkIn?.pain,
    mismatch: w?.report && w.report.status !== 'consistent' ? w.report.status : null,
    redFlag: w?.insights?.flag === 'red',
    aiFlag: w?.insights?.flag ?? null,
  };
}

export default function TeamScreen() {
  const router = useRouter();
  const theme = useTheme();
  const store = useStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [serverWeekly, setServerWeekly] = useState<WeeklyDashboard | null>(null);
  const [weekStart] = useState(() => Date.now() - 7 * 86_400_000);

  useEffect(() => {
    if (!hasApi) return;
    requestWeeklyDashboard().then(setServerWeekly).catch(() => setServerWeekly(null));
  }, []);

  const roster = athletesIn(store, session.departmentId).sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)));
  const needsFeedback = (a: Athlete) => a.workouts[0] != null && !store.feedback.some((f) => f.workoutId === a.workouts[0].id);
  const isFlagged = (a: Athlete) => {
    const f = flags(a);
    return f.pain || !!f.mismatch || f.redFlag;
  };
  const redFlagged = roster.filter((a) => flags(a).redFlag);
  const weeklyWorkouts = roster.flatMap((a) => a.workouts.filter((w) => Date.parse(w.date) >= weekStart));
  const weeklyRfi = weeklyWorkouts.length
    ? Math.round(weeklyWorkouts.reduce((sum, w) => sum + w.result.overall_rfi, 0) / weeklyWorkouts.length)
    : null;
  const weeklyFlags = weeklyWorkouts.filter((w) => w.insights?.flag === 'red' || w.checkIn?.pain || w.report?.status !== 'consistent').length;
  const weeklySets = serverWeekly?.sets ?? weeklyWorkouts.length;
  const weeklyAverageRfi = serverWeekly?.average_rfi ?? weeklyRfi;
  const weeklyFollowUps = serverWeekly?.follow_ups ?? weeklyFlags;

  const q = query.trim().toLowerCase();
  const shown = roster.filter(
    (a) =>
      (!q || a.name.toLowerCase().includes(q) || a.detail.toLowerCase().includes(q)) &&
      (filter === 'all' ||
        (filter === 'recent' && a.workouts[0] != null) ||
        (filter === 'red' && latestStatus(a) === 'red') ||
        (filter === 'flagged' && isFlagged(a)) ||
        (filter === 'feedback' && needsFeedback(a)))
  ).sort((a, b) => {
    if (filter !== 'recent') return lastName(a.name).localeCompare(lastName(b.name));
    return (b.workouts[0]?.date ?? '').localeCompare(a.workouts[0]?.date ?? '');
  });
  const count = (s: Status) => roster.filter((a) => latestStatus(a) === s).length;
  const title = session.role === 'trainer' ? 'AT' : 'Coach';

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <HeroHeader
          eyebrow={departmentLabel(session.departmentId)}
          title={`${title} ${session.name || ''}`.trim()}
          right={<HeaderLinks />}>
          <View style={[styles.summary, { backgroundColor: theme.backgroundElement }]}>
            <Summary status="green" value={count('green')} />
            <Summary status="amber" value={count('amber')} />
            <Summary status="red" value={count('red')} />
            <View style={styles.flex}>
              <ThemedText style={styles.summaryValue}>{roster.filter(isFlagged).length}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                flagged
              </ThemedText>
            </View>
          </View>
        </HeroHeader>

        <View style={styles.body}>
          <Card>
            <ThemedText type="smallBold">This week</ThemedText>
            <View style={styles.weeklyStats}>
              <WeeklyStat label="Sets" value={String(weeklySets)} />
              <WeeklyStat label="Avg RFI" value={weeklyAverageRfi == null ? '–' : String(weeklyAverageRfi)} />
              <WeeklyStat label="Follow-ups" value={String(weeklyFollowUps)} />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {serverWeekly ? 'Persisted by the local FastAPI database for the last 7 days.' : 'Based on workouts currently loaded in this session.'}
            </ThemedText>
          </Card>

          {redFlagged.length > 0 && (
            <Card style={{ borderColor: theme.statusRed, borderWidth: 2 }}>
              <View style={styles.alertTop}>
                <Icon name="warning" size={20} color={theme.statusRed} />
                <ThemedText style={styles.alertTitle}>
                  {redFlagged.length} red flag{redFlagged.length > 1 ? 's' : ''} from the AI analyzer
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                What these athletes said and how they rated their exhaustion doesn&apos;t line up with their movement data, for
                example saying they weren&apos;t tired when the data shows they were.
              </ThemedText>
              {redFlagged.map((a) => (
                <Pressable
                  key={a.id}
                  onPress={() => router.push({ pathname: '/athlete/[id]', params: { id: a.id } })}
                  accessibilityRole="button"
                  style={[styles.alertRow, { borderTopColor: theme.border }]}>
                  <View style={styles.flex}>
                    <ThemedText type="smallBold">{a.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                      {a.workouts[0]?.insights?.flag_reason}
                    </ThemedText>
                  </View>
                  <Icon name="chevron" size={14} color={theme.textSecondary} />
                </Pressable>
              ))}
            </Card>
          )}

          <View style={[styles.search, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Icon name="search" size={18} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search athletes or positions"
              placeholderTextColor={theme.textSecondary}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
          </View>

          <View style={styles.filters}>
            {FILTERS.map((f) => {
              const selected = f.id === filter;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => setFilter(f.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.filter,
                    {
                      backgroundColor: selected ? theme.primary : theme.backgroundElement,
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}>
                  <ThemedText type="smallBold" style={{ color: selected ? theme.onPrimary : theme.text }}>
                    {f.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ThemedText type="small" themeColor="textSecondary">
            {shown.length} of {roster.length} athletes · status is each athlete&apos;s latest set
          </ThemedText>

          {shown.map((a) => (
            <AthleteRow key={a.id} athlete={a} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Summary({ status, value }: { status: Status; value: number }) {
  const theme = useTheme();
  const color = { green: theme.statusGreen, amber: theme.statusAmber, red: theme.statusRed }[status];
  return (
    <View style={styles.flex}>
      <View style={styles.summaryTop}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <ThemedText style={styles.summaryValue}>{value}</ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {STATUS_LABEL[status].toLowerCase()}
      </ThemedText>
    </View>
  );
}

function WeeklyStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.weeklyStat}>
      <ThemedText style={styles.weeklyValue}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
    </View>
  );
}

function AthleteRow({ athlete }: { athlete: Athlete }) {
  const router = useRouter();
  const theme = useTheme();
  const latest = athlete.workouts[0];
  const status = latestStatus(athlete);
  const f = flags(athlete);
  const initials = athlete.name
    .split(' ')
    .filter((w) => /^[A-Z]/.test(w) && !/^(Jr\.|III|II)$/.test(w))
    .map((w) => w[0])
    .slice(0, 2)
    .join('');

  return (
    <Pressable onPress={() => router.push({ pathname: '/athlete/[id]', params: { id: athlete.id } })} accessibilityRole="button">
      {({ pressed }) => (
        <Card style={[styles.row, pressed && { opacity: 0.85 }]}>
          <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
            <ThemedText style={[styles.avatarText, { color: theme.onPrimary }]}>{initials}</ThemedText>
          </View>
          <View style={styles.flex}>
            <ThemedText type="smallBold" style={styles.name} numberOfLines={1}>
              {athlete.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {athlete.detail}
              {latest ? ` · Latest ${formatDate(latest.date)}` : ' · No sets yet'}
            </ThemedText>
            {latest && status && (
              <View style={styles.chips}>
                <StatusPill status={status} label={`${STATUS_LABEL[status]} · RFI ${latest.result.overall_rfi}`} />
                {f.aiFlag && <FlagChip flag={f.aiFlag} />}
                {f.pain && <Chip text="Pain reported" highlight />}
                {f.mismatch && <Chip text={f.mismatch === 'under-reporting' ? 'Under-reported' : 'Over-reported'} highlight />}
                {!latest.checkIn && <Chip text="No check-in" />}
              </View>
            )}
          </View>
          <Icon name="chevron" size={16} color={theme.textSecondary} />
        </Card>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scroll: {
    paddingBottom: Spacing.five,
  },
  alertTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: 800,
    flex: 1,
  },
  weeklyStats: {
    flexDirection: 'row',
    gap: Spacing.four,
    marginVertical: Spacing.two,
  },
  weeklyStat: {
    minWidth: 72,
  },
  weeklyValue: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: 900,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
  summary: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  summaryValue: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: 900,
  },
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.two,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 16,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  filter: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: 800,
  },
  name: {
    fontSize: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: Spacing.one,
  },
});
