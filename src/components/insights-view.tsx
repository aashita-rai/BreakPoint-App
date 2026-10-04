import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Icon } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Insights } from '@/lib/squat-types';

/** AI analyzer output. Staff see the red-flag wording and coach note; athletes see a gentler version. */
export function InsightsView({ insights, audience }: { insights: Insights; audience: 'athlete' | 'staff' }) {
  const theme = useTheme();
  const red = insights.flag === 'red';

  return (
    <Card style={red ? { borderColor: theme.statusRed, borderWidth: 2 } : undefined}>
      <View style={styles.top}>
        <View style={[styles.badge, { backgroundColor: red ? theme.statusRed : theme.primary }]}>
          <Icon name={red ? 'warning' : 'bolt'} size={18} color="#FFFFFF" />
        </View>
        <View style={styles.flex}>
          <ThemedText type="small" themeColor="textSecondary">
            {insights.source === 'ai' ? 'GEMINI EXPLANATION' : 'PLAIN-LANGUAGE SUMMARY'}
          </ThemedText>
          <ThemedText style={styles.headline}>
            {red && audience === 'staff' ? `Red flag: ${insights.headline.toLowerCase()}` : insights.headline}
          </ThemedText>
        </View>
      </View>

      {red && audience === 'staff' && insights.flag_reason && (
        <View style={[styles.reason, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText type="small">{insights.flag_reason}</ThemedText>
        </View>
      )}

      <ThemedText style={styles.note}>{audience === 'staff' ? insights.coach_note : insights.athlete_note}</ThemedText>

      {insights.insights.length > 0 && (
        <>
          <ThemedText type="smallBold" themeColor="textSecondary">
            WHERE THE SET GOT HARD
          </ThemedText>
          {insights.insights.map((line) => (
            <View key={line} style={styles.item}>
              <ThemedText type="smallBold">•</ThemedText>
              <ThemedText type="small" style={styles.flex}>
                {line}
              </ThemedText>
            </View>
          ))}
        </>
      )}

      <ThemedText type="small" themeColor="textSecondary">
        {insights.source === 'ai' ? 'Written by AI from your movement data and check-in. ' : ''}A screening aid for human review, not a
        diagnosis.
      </ThemedText>
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
    gap: Spacing.three,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    fontSize: 17,
    fontWeight: 800,
  },
  reason: {
    borderRadius: 10,
    padding: Spacing.three,
  },
  note: {
    fontSize: 15,
    lineHeight: 22,
  },
  item: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
