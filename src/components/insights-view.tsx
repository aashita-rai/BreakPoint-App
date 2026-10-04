import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Icon } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Insights } from '@/lib/squat-types';

/** Gemini headline + "where the set got hard" bullets. Staff also see the green/red flag and its reason. */
export function InsightsView({ insights, audience }: { insights: Insights; audience: 'athlete' | 'staff' }) {
  const theme = useTheme();
  const red = insights.flag === 'red';
  const staff = audience === 'staff';
  const flagColor = red ? theme.statusRed : theme.statusGreen;

  return (
    <Card style={staff || red ? { borderColor: flagColor, borderWidth: 2 } : undefined}>
      <View style={styles.top}>
        <View style={[styles.badge, { backgroundColor: staff || red ? flagColor : theme.primary }]}>
          <Icon name={staff ? 'flag' : red ? 'warning' : 'bolt'} size={18} color="#FFFFFF" />
        </View>
        <View style={styles.flex}>
          <ThemedText type="small" themeColor="textSecondary">
            {insights.source === 'sample' ? 'SAMPLE DATA' : 'GEMINI EXPLANATION'}
          </ThemedText>
          <ThemedText style={styles.headline}>
            {staff ? `${red ? 'Red' : 'Green'} flag: ${insights.headline.toLowerCase()}` : insights.headline}
          </ThemedText>
        </View>
      </View>

      {staff && insights.flag_reason && (
        <View style={[styles.reason, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText type="small">{insights.flag_reason}</ThemedText>
        </View>
      )}

      {/* The athlete/coach note is shown once, in the report's "For the athlete / coach" cards. */}

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
  item: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
