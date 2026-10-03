import { useLocalSearchParams, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CheckInForm } from '@/components/check-in-form';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, PastelOrange, Spacing, UFBlue } from '@/constants/theme';
import { findWorkout, useStore } from '@/data/store';
import { useTheme } from '@/hooks/use-theme';

/** Pops up after a video is processed, before the results: the athlete's own take on the set. */
export default function ReflectScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { id, from } = useLocalSearchParams<{ id: string; from?: 'results' }>();
  const store = useStore();
  const found = findWorkout(store, id);

  // Opened from a results screen: just close. Otherwise (after processing) go on to the results.
  const toResults = (workoutId: string) =>
    from === 'results' && router.canGoBack()
      ? router.back()
      : router.replace({ pathname: '/results/[id]', params: { id: workoutId } });

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <SafeAreaView edges={['top']} style={styles.headerInner}>
          <View style={styles.headerRow}>
            <ThemedText style={styles.eyebrow}>BEFORE YOUR RESULTS</ThemedText>
            {found && (
              <Pressable onPress={() => toResults(found.workout.id)} accessibilityRole="button" hitSlop={10}>
                <ThemedText type="smallBold" style={{ color: PastelOrange }}>
                  Skip for now
                </ThemedText>
              </Pressable>
            )}
          </View>
          <ThemedText style={styles.title}>How did it go?</ThemedText>
          <ThemedText style={styles.subtitle}>
            Tell us how the set felt before you see the numbers. Your coach gets your check-in plus what the video showed.
          </ThemedText>
        </SafeAreaView>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {found ? (
            <CheckInForm workout={found.workout} athleteName={found.athlete.name} onDone={toResults} />
          ) : (
            <ThemedText>Workout not found.</ThemedText>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    backgroundColor: UFBlue,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerInner: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: {
    color: PastelOrange,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: 900,
  },
  subtitle: {
    color: '#FFFFFF',
    opacity: 0.85,
    fontSize: 15,
    lineHeight: 21,
  },
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    paddingBottom: Spacing.six,
  },
});
