import { useRouter } from 'expo-router';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Icon } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CheckIn, Report } from '@/lib/squat-types';

const BANNER: Record<Report['status'], { title: string; body: string }> = {
  'under-reporting': {
    title: 'Possible under-reporting',
    body: 'Your movement showed more fatigue than the effort you reported.',
  },
  'over-reporting': {
    title: 'Possible over-reporting',
    body: 'You reported more effort than your movement showed.',
  },
  consistent: {
    title: 'Consistent',
    body: 'Reported effort matches the measured fatigue.',
  },
};

/** README §9 Report: mismatch banner, escalation line, Athlete / Coach / Trainer messages. */
export function ReportView({ report, checkIn }: { report: Report; checkIn?: CheckIn }) {
  const router = useRouter();
  const theme = useTheme();
  const banner = BANNER[report.status];
  const flagged = report.status !== 'consistent';

  return (
    <View style={styles.wrap}>
      <View style={[styles.banner, { backgroundColor: flagged ? theme.accent : theme.backgroundSelected }]}>
        <Icon name={flagged ? 'warning' : 'check'} size={26} color={flagged ? theme.onAccent : theme.statusGreen} />
        <View style={styles.flex}>
          <ThemedText style={[styles.bannerTitle, flagged && { color: theme.onAccent }]}>{banner.title}</ThemedText>
          <ThemedText type="small" style={flagged ? { color: theme.onAccent } : undefined}>
            {banner.body} Reported {report.reported_rpe}/10, expected about {report.expected_rpe}.
          </ThemedText>
        </View>
      </View>

      {report.escalation && (
        <View style={[styles.escalation, { borderColor: theme.statusRed }]}>
          <Icon name="info" size={20} color={theme.statusRed} />
          <ThemedText type="small" style={styles.flex}>
            <ThemedText type="smallBold">Pain reported{checkIn?.pain_locations.length ? ` (${checkIn.pain_locations.join(', ')})` : ''}. </ThemedText>
            {report.escalation}
          </ThemedText>
        </View>
      )}

      <MessageCard who="Athlete" text={report.messages.athlete} />
      <MessageCard who="Coach" text={report.messages.coach} />
      <MessageCard who="Athletic Trainer" text={report.messages.trainer} />

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
        {report.source === 'api' ? 'Messages written by the BreakPoint server.' : 'Messages from the built-in templates (server not used).'}{' '}
        This is a screening aid that flags for human review. It is not a diagnosis.
      </ThemedText>
    </View>
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
