import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, HeroHeader, Icon } from '@/components/ui-kit';
import { MaxContentWidth, PastelOrange, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// README §9 Resources screen. General wording only.
// TODO before the demo: check every line against the CDC and NATA pages linked below.

const SECTIONS: { title: string; tone: 'calm' | 'tell' | 'urgent'; items: string[] }[] = [
  {
    title: 'When to ease off or rest',
    tone: 'calm',
    items: [
      'You feel much more tired than usual, or BreakPoint shows your form breaking down early in a set.',
      'You slept badly, are sick, or haven’t eaten or had enough to drink.',
      'Soreness is changing how you move.',
    ],
  },
  {
    title: 'When to tell your athletic trainer or coach',
    tone: 'tell',
    items: [
      'Any pain during or after training, especially sharp pain or pain in a joint.',
      'Pain that doesn’t ease with rest, lasts more than a day or two, or keeps coming back.',
      'Swelling, or a joint that feels unstable, gives way or locks.',
      'You’ve felt run down for several days in a row.',
      'Any hit to the head, even if you feel okay afterwards.',
    ],
  },
  {
    title: 'Get urgent care or call 911',
    tone: 'urgent',
    items: [
      'Chest pain, fainting, or trouble breathing.',
      'Signs of heat illness: confusion, very hot skin, collapse.',
      'After a head injury: a headache that gets worse, repeated vomiting, confusion, slurred speech or a seizure.',
      'You can’t put weight on a leg, a limb looks deformed, or you have numbness or weakness.',
      'Severe muscle pain and weakness with dark, tea-coloured urine after hard exercise.',
    ],
  },
];

const SOURCES = [
  { label: 'CDC HEADS UP: concussion in sports', url: 'https://www.cdc.gov/heads-up/' },
  { label: 'CDC: heat and health', url: 'https://www.cdc.gov/heat-health/' },
  { label: 'National Athletic Trainers’ Association (NATA)', url: 'https://www.nata.org/' },
];

export default function ResourcesScreen() {
  const router = useRouter();
  const theme = useTheme();
  const toneColor = { calm: theme.statusGreen, tell: theme.statusAmber, urgent: theme.statusRed };

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <HeroHeader
          eyebrow="Health & safety"
          title="Resources"
          right={
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={10}>
              <Icon name="back" size={22} color={PastelOrange} />
            </Pressable>
          }
        />
        <View style={styles.body}>
          <View style={[styles.draft, { backgroundColor: theme.accentSoft }]}>
            <ThemedText type="small">
              <ThemedText type="smallBold">Draft: </ThemedText>
              general guidance, not yet checked against the CDC and NATA sources below. It is not medical advice. If you&apos;re
              unsure, talk to your athletic trainer or a doctor.
            </ThemedText>
          </View>

          {SECTIONS.map((s) => (
            <Card key={s.title}>
              <View style={styles.titleRow}>
                <View style={[styles.bar, { backgroundColor: toneColor[s.tone] }]} />
                <ThemedText style={styles.sectionTitle}>{s.title}</ThemedText>
              </View>
              {s.items.map((item) => (
                <View key={item} style={styles.item}>
                  <ThemedText type="smallBold">•</ThemedText>
                  <ThemedText style={styles.itemText}>{item}</ThemedText>
                </View>
              ))}
            </Card>
          ))}

          <Card>
            <ThemedText style={styles.sectionTitle}>Sources</ThemedText>
            {SOURCES.map((src) => (
              <Pressable
                key={src.url}
                onPress={() => WebBrowser.openBrowserAsync(src.url)}
                accessibilityRole="link"
                style={styles.link}>
                <ThemedText style={[styles.flex, { color: theme.chartSeries }]}>{src.label}</ThemedText>
                <Icon name="chevron" size={14} color={theme.textSecondary} />
              </Pressable>
            ))}
          </Card>
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
    paddingBottom: Spacing.six,
  },
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.three,
  },
  draft: {
    borderRadius: 12,
    padding: Spacing.three,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  bar: {
    width: 6,
    height: 22,
    borderRadius: 3,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: 800,
    flex: 1,
  },
  item: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  itemText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
});
