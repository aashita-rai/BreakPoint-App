import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedbackCard } from '@/components/feedback-card';
import { FeedbackComposer } from '@/components/feedback-composer';
import { ThemedText } from '@/components/themed-text';
import { Card, HeroHeader, Icon } from '@/components/ui-kit';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { athletesIn, departmentLabel, getAthlete, session, useStore } from '@/data/store';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/metrics';

export default function CommentsScreen() {
  const theme = useTheme();
  const store = useStore();
  const roster = athletesIn(store, session.departmentId).sort((a, b) => a.name.localeCompare(b.name));
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');

  const athlete = athleteId ? getAthlete(store, athleteId) : null;
  const rosterIds = new Set(roster.map((a) => a.id));
  const sent = store.feedback
    .filter((f) => rosterIds.has(f.athleteId))
    .sort((a, b) => b.date.localeCompare(a.date));
  const q = query.trim().toLowerCase();

  const choose = (id: string) => {
    setAthleteId(id);
    setWorkoutId(null);
    setPicking(false);
    setQuery('');
  };

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <HeroHeader eyebrow={departmentLabel(session.departmentId)} title="Coach Feedback" />

        <View style={styles.body}>
          <Card>
            <ThemedText style={styles.cardTitle}>Who is this for?</ThemedText>
            <Pressable
              onPress={() => setPicking(true)}
              accessibilityRole="button"
              style={[styles.field, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <ThemedText style={styles.flex} themeColor={athlete ? 'text' : 'textSecondary'}>
                {athlete ? `${athlete.name} · ${athlete.detail}` : 'Choose an athlete'}
              </ThemedText>
              <Icon name="chevron" size={16} color={theme.textSecondary} />
            </Pressable>

            {athlete && athlete.workouts.length > 0 && (
              <>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  ABOUT
                </ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.workoutChips}>
                  {[null, ...athlete.workouts.slice(0, 5)].map((w, i) => {
                    const selected = (w?.id ?? null) === workoutId;
                    return (
                      <Pressable
                        key={w?.id ?? 'general'}
                        onPress={() => setWorkoutId(w?.id ?? null)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={[
                          styles.workoutChip,
                          {
                            backgroundColor: selected ? theme.primary : theme.background,
                            borderColor: selected ? theme.primary : theme.border,
                          },
                        ]}>
                        <ThemedText type="smallBold" style={{ color: selected ? theme.onPrimary : theme.text }}>
                          {w ? `Workout #${i}` : 'General'}
                        </ThemedText>
                        {w && (
                          <ThemedText type="small" style={{ color: selected ? theme.onPrimary : theme.textSecondary }}>
                            {formatDate(w.date)}
                          </ThemedText>
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}
          </Card>

          {athlete && (
            <FeedbackComposer
              athleteId={athlete.id}
              workoutId={workoutId}
              heading={`Feedback for ${athlete.name.split(' ')[0]}`}
            />
          )}

          <ThemedText style={styles.sectionTitle}>Sent to your team</ThemedText>
          {sent.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Nothing sent yet.
            </ThemedText>
          ) : (
            sent.map((f) => <FeedbackCard key={f.id} feedback={f} showAthlete />)
          )}
        </View>
      </ScrollView>

      <Modal visible={picking} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicking(false)}>
        <View style={[styles.flex, { backgroundColor: theme.background }]}>
          <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
            <View style={styles.sheetHeader}>
              <ThemedText style={styles.sheetTitle}>Choose an athlete</ThemedText>
              <Pressable onPress={() => setPicking(false)} accessibilityRole="button" hitSlop={10}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  Close
                </ThemedText>
              </Pressable>
            </View>
            <View style={[styles.search, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <Icon name="search" size={18} color={theme.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Search"
                placeholderTextColor={theme.textSecondary}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
              />
            </View>
            <ScrollView contentContainerStyle={styles.sheetList} keyboardShouldPersistTaps="handled">
              {roster
                .filter((a) => !q || a.name.toLowerCase().includes(q) || a.detail.toLowerCase().includes(q))
                .map((a) => (
                  <Pressable
                    key={a.id}
                    onPress={() => choose(a.id)}
                    accessibilityRole="button"
                    style={[
                      styles.option,
                      {
                        backgroundColor: a.id === athleteId ? theme.accentSoft : theme.backgroundElement,
                        borderColor: theme.border,
                      },
                    ]}>
                    <ThemedText type="smallBold" style={styles.flex}>
                      {a.name}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {a.detail}
                    </ThemedText>
                  </Pressable>
                ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
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
  cardTitle: {
    fontSize: 17,
    fontWeight: 800,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 800,
    marginTop: Spacing.two,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
  },
  workoutChips: {
    gap: Spacing.two,
  },
  workoutChip: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: 800,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
  },
  sheetList: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.two,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: Spacing.three,
  },
});
