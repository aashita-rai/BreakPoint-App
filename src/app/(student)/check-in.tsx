import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CheckInForm } from '@/components/check-in-form';
import { HeaderLinks } from '@/components/header-links';
import { ThemedText } from '@/components/themed-text';
import { Card, HeroHeader } from '@/components/ui-kit';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { getAthlete, session, useStore } from '@/data/store';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/metrics';

export default function CheckInScreen() {
  const router = useRouter();
  const theme = useTheme();
  const store = useStore();
  const { workoutId } = useLocalSearchParams<{ workoutId?: string }>();
  const athlete = getAthlete(store, session.athleteId);
  const workouts = athlete?.workouts ?? [];
  const target = workouts.find((w) => w.id === workoutId) ?? workouts.find((w) => !w.checkIn) ?? workouts[0];

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <HeroHeader eyebrow="How do you feel?" title="Check-In" right={<HeaderLinks signOut={false} />} />
        <View style={styles.body}>
          {target && athlete ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                For: <ThemedText type="smallBold">{target.title}</ThemedText> · {formatDate(target.date)}
                {target.checkIn ? ' (updating your earlier check-in)' : ''}
              </ThemedText>
              <CheckInForm
                key={target.id}
                workout={target}
                athleteName={athlete.name}
                onDone={(id) => router.push({ pathname: '/results/[id]', params: { id } })}
              />
            </>
          ) : (
            <Card>
              <ThemedText type="smallBold">Nothing to check in on yet</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Capture a squat set first. Then come back and tell us how it felt.
              </ThemedText>
            </Card>
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
