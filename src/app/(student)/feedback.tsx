import { ScrollView, StyleSheet, View } from 'react-native';

import { FeedbackCard } from '@/components/feedback-card';
import { ThemedText } from '@/components/themed-text';
import { Card, HeroHeader } from '@/components/ui-kit';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { feedbackFor, session, useStore } from '@/data/store';
import { useTheme } from '@/hooks/use-theme';

export default function FeedbackScreen() {
  const theme = useTheme();
  const store = useStore();
  const items = feedbackFor(store, session.athleteId);

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <HeroHeader eyebrow="From your coaches" title="Coach Feedback" />
        <View style={styles.body}>
          {items.length === 0 ? (
            <Card>
              <ThemedText type="smallBold">No feedback yet</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                When a coach reviews your sets, their comments will appear here.
              </ThemedText>
            </Card>
          ) : (
            items.map((f) => <FeedbackCard key={f.id} feedback={f} />)
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
});
