import { useRouter } from 'expo-router';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { LineChart } from '@/components/charts';
import { ThemedText } from '@/components/themed-text';
import { Card, Icon } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AnalysisResult, CheckIn, Report } from '@/lib/squat-types';

// Status labels only; the explanation under them is written by Gemini (report.summary).
// The check compares the rating with the late set (last 3 reps), so the labels say so.
const BANNER_TITLE: Record<Report['status'], string> = {
  'under-reporting': 'Possible late-set under-reporting',
  'over-reporting': 'Possible late-set over-reporting',
  consistent: 'Consistent',
};

/** Mismatch banner, pain escalation, and Gemini's Athlete / Coach / Trainer messages. */
export function ReportView({ report, checkIn, result }: { report: Report; checkIn?: CheckIn; result?: AnalysisResult }) {
  const router = useRouter();
  const theme = useTheme();
  const flagged = report.status !== 'consistent';

  return (
    <View style={styles.wrap}>
      <View style={[styles.banner, { backgroundColor: flagged ? theme.accent : theme.backgroundSelected }]}>
        <Icon name={flagged ? 'warning' : 'check'} size={26} color={flagged ? theme.onAccent : theme.statusGreen} />
        <View style={styles.flex}>
          <ThemedText style={[styles.bannerTitle, flagged && { color: theme.onAccent }]}>{BANNER_TITLE[report.status]}</ThemedText>
          <ThemedText type="small" style={flagged ? { color: theme.onAccent } : undefined}>
            {report.summary ? `${report.summary} ` : ''}Reported {report.reported_rpe}/10, expected about {report.expected_rpe}.
          </ThemedText>
        </View>
      </View>

      {result && <MeasuredVsReported result={result} report={report} />}

      {report.escalation && (
        <View style={[styles.escalation, { borderColor: theme.statusRed }]}>
          <Icon name="info" size={20} color={theme.statusRed} />
          <ThemedText type="small" style={styles.flex}>
            <ThemedText type="smallBold">Pain reported{checkIn?.pain_locations.length ? ` (${checkIn.pain_locations.join(', ')})` : ''}. </ThemedText>
            {report.escalation}
          </ThemedText>
        </View>
      )}

      {report.messages ? (
        <>
          <MessageCard who="Athlete" text={report.messages.athlete} />
          <MessageCard who="Coach" text={report.messages.coach} />
          <MessageCard who="Athletic Trainer" text={report.messages.trainer} />
        </>
      ) : (
        <Card>
          <ThemedText type="smallBold">Gemini explanation unavailable</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {report.unavailable_reason ?? 'Gemini could not be reached.'} The measured result and any pain referral above
            still apply.
          </ThemedText>
        </Card>
      )}

      <Pressable
        onPress={() => router.push('/resources')}
        accessibilityRole="button"
        style={[styles.resources, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Icon name="info" size={20} color={theme.text} />
        <ThemedText type="smallBold" style={styles.flex}>
          When to rest, tell a trainer, or get urgent care
        </ThemedText>
        <Icon name="chevron" size={14} color={theme.textSecondary} />
      </Pressable>

      <ThemedText type="small" themeColor="textSecondary">
        {report.source === 'gemini'
          ? 'Messages written by Gemini from your measured movement and check-in.'
          : report.source === 'sample'
            ? 'Sample data for the demo roster, not a real check-in.'
            : ''}{' '}
        This is a screening aid that flags for human review. It is not a diagnosis.
      </ThemedText>
    </View>
  );
}

/** Measured fatigue per rep against the athlete's own rating, on the same 0-100 scale. */
function MeasuredVsReported({ result, report }: { result: AnalysisResult; report: Report }) {
  const scored = result.reps.filter((r) => r.scored !== false);
  if (scored.length < 2) return null;
  const late = scored.slice(-3);
  return (
    <Card>
      <ThemedText type="smallBold">Measured vs. reported</ThemedText>
      <LineChart
        points={scored.map((r) => ({ x: r.i, y: r.rfi, label: `Rep ${r.i} · measured fatigue ${Math.round(r.rfi)}` }))}
        formatY={(v) => `${Math.round(v)}`}
        formatX={(v) => `${Math.round(v)}`}
        yDomain={[0, 100]}
        referenceY={{ y: report.reported_rpe * 10, label: `You reported ${report.reported_rpe}/10` }}
        markerX={late[0].i}
        markerLabel="Late set"
        xLabel="Rep number"
        yLabel="Fatigue (0-100)"
        height={190}
      />
      <ThemedText type="small" themeColor="textSecondary">
        Line: measured fatigue for each rep. Dashed line: your exhaustion rating, scaled to the same 0-100 range. The check
        compares your rating with the shaded late-set reps (expected about {report.expected_rpe}/10).
      </ThemedText>
    </Card>
  );
}

function MessageCard({ who, text }: { who: string; text: string }) {
  const theme = useTheme();
  return (
    <Card>
      <View style={styles.cardTop}>
        <ThemedText type="smallBold" style={styles.flex}>
          For the {who.toLowerCase()}
        </ThemedText>
        <Pressable
          onPress={() => Share.share({ message: text })}
          accessibilityRole="button"
          accessibilityLabel={`Copy or share the ${who.toLowerCase()} message`}
          hitSlop={10}
          style={styles.share}>
          <Icon name="share" size={16} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            Copy / share
          </ThemedText>
        </Pressable>
      </View>
      <ThemedText style={styles.message}>{text}</ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.three,
  },
  flex: {
    flex: 1,
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
  escalation: {
    flexDirection: 'row',
    gap: Spacing.two,
    borderWidth: 2,
    borderRadius: 14,
    padding: Spacing.three,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  share: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
  },
  resources: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 14,
    padding: Spacing.three,
  },
});
