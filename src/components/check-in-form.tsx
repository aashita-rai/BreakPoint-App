import Slider from '@react-native-community/slider';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DictationField } from '@/components/dictation-field';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { updateWorkout } from '@/data/store';
import { useTheme } from '@/hooks/use-theme';
import { templateReport } from '@/lib/fatigue';
import { ruleInsights } from '@/lib/insights';
import { type CheckIn, PAIN_LOCATIONS, type PainLocation, type Workout } from '@/lib/squat-types';
import { hasApi, requestInsights, requestReport } from '@/services/api';

const EXHAUSTION_HINT = [
  '',
  'Not tired at all',
  'Barely tired',
  'A little tired',
  'A little tired',
  'Moderately tired',
  'Moderately tired',
  'Very tired',
  'Very tired',
  'Extremely tired',
  'Completely exhausted',
];

/**
 * Post-workout check-in: the athlete's own words, exhaustion 1-10 and pain.
 * "Report to coach" saves it, runs the AI analyzer (server, with a rule-based fallback)
 * and builds the athlete/coach/trainer report.
 */
export function CheckInForm({
  workout,
  athleteName,
  onDone,
}: {
  workout: Workout;
  athleteName: string;
  onDone: (workoutId: string) => void;
}) {
  const theme = useTheme();
  const [opinion, setOpinion] = useState(workout.checkIn?.notes ?? '');
  const [exhaustion, setExhaustion] = useState(workout.checkIn?.rpe ?? 5);
  const [pain, setPain] = useState<boolean | null>(workout.checkIn?.pain ?? null);
  const [where, setWhere] = useState<PainLocation[]>(workout.checkIn?.pain_locations ?? []);
  const [sending, setSending] = useState(false);

  const ready = pain != null && (!pain || where.length > 0);

  const submit = async () => {
    if (!ready) return;
    setSending(true);
    const checkIn: CheckIn = {
      rpe: exhaustion,
      pain,
      pain_locations: pain ? where : [],
      notes: opinion.trim(),
      date: new Date().toISOString(),
    };
    // The server may use an LLM, but deterministic templates remain the fallback.
    const useServer = hasApi;
    const [report, insights] = await Promise.all([
      useServer
        ? requestReport(workout.result, checkIn, athleteName).catch(() => templateReport(workout.result, checkIn, athleteName))
        : templateReport(workout.result, checkIn, athleteName),
      useServer
        ? requestInsights(workout.result, checkIn, athleteName).catch(() => ruleInsights(workout.result, checkIn, athleteName))
        : ruleInsights(workout.result, checkIn, athleteName),
    ]);
    updateWorkout(workout.id, { checkIn, report, insights });
    setSending(false);
    onDone(workout.id);
  };

  return (
    <View style={styles.wrap}>
      <Card>
        <ThemedText style={styles.question}>How did your workout go?</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          In your own words. Type, or tap the mic and talk.
        </ThemedText>
        <DictationField
          value={opinion}
          onChangeText={setOpinion}
          placeholder="e.g. “Felt strong, legs got heavy near the end”"
        />
      </Card>

      <Card>
        <ThemedText style={styles.question}>On a scale of 1-10, how exhausted do you feel after the workout?</ThemedText>
        <View style={styles.valueRow}>
          <ThemedText style={styles.value}>{exhaustion}</ThemedText>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {EXHAUSTION_HINT[exhaustion]}
          </ThemedText>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={1}
          maximumValue={10}
          step={1}
          value={exhaustion}
          onValueChange={(v) => setExhaustion(Math.round(v))}
          minimumTrackTintColor={theme.primary}
          maximumTrackTintColor={theme.border}
          thumbTintColor={theme.accent}
          accessibilityLabel="Exhaustion from 1 to 10"
        />
        <View style={styles.ends}>
          <ThemedText type="small" themeColor="textSecondary">
            1 · Not tired
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            10 · Completely exhausted
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Be honest. This helps keep you healthy, not off the field.
        </ThemedText>
      </Card>

      <Card>
        <ThemedText style={styles.question}>Any pain?</ThemedText>
        <View style={styles.row}>
          {[false, true].map((v) => {
            const selected = pain === v;
            return (
              <Pressable
                key={String(v)}
                onPress={() => setPain(v)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[
                  styles.choice,
                  {
                    backgroundColor: selected ? theme.primary : theme.background,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}>
                <ThemedText type="smallBold" style={{ color: selected ? theme.onPrimary : theme.text, fontSize: 16 }}>
                  {v ? 'Yes' : 'No'}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
        {pain && (
          <>
            <ThemedText type="smallBold" themeColor="textSecondary">
              WHERE? (choose all that apply)
            </ThemedText>
            <View style={styles.chips}>
              {PAIN_LOCATIONS.map((loc) => {
                const selected = where.includes(loc);
                return (
                  <Pressable
                    key={loc}
                    onPress={() => setWhere((w) => (selected ? w.filter((x) => x !== loc) : [...w, loc]))}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? theme.accent : theme.background,
                        borderColor: selected ? theme.accent : theme.border,
                      },
                    ]}>
                    <ThemedText type="smallBold" style={{ color: selected ? theme.onAccent : theme.text }}>
                      {loc.charAt(0).toUpperCase() + loc.slice(1)}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </Card>

      <Button
        title={sending ? 'Analyzing your workout…' : 'Report to coach'}
        icon="send"
        variant="accent"
        onPress={submit}
        disabled={!ready || sending}
      />
      {!ready && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          Answer the pain question to continue.
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.three,
  },
  question: {
    fontSize: 17,
    fontWeight: 800,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  value: {
    fontSize: 40,
    lineHeight: 46,
    fontWeight: 900,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  ends: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  choice: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  center: {
    textAlign: 'center',
  },
});
