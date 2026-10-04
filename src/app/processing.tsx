import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BarChart } from '@/components/charts';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Icon, StatTile } from '@/components/ui-kit';
import { MaxContentWidth, PastelOrange, Spacing, UFBlue } from '@/constants/theme';
import { addWorkout, session } from '@/data/store';
import { useTheme } from '@/hooks/use-theme';
import { formatDepth } from '@/lib/metrics';
import type { RepResult } from '@/lib/squat-types';
import { ANALYSIS_STAGES, analyzeSquatVideo, isAbort, NoServerError } from '@/services/squat-analysis';

export default function ProcessingScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { mode, uri, squatVariation } = useLocalSearchParams<{ mode: 'upload' | 'demo'; uri?: string; squatVariation?: string }>();
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string>(ANALYSIS_STAGES[0]);
  const [reps, setReps] = useState<RepResult[]>([]);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [pulse] = useState(() => new Animated.Value(0));
  const isDemo = mode === 'demo';

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    analyzeSquatVideo(isDemo || !uri ? { kind: 'demo' } : { kind: 'upload', uri }, {
      squatVariation: (squatVariation as 'standard' | 'pause' | 'tempo' | 'narrow' | 'sumo') ?? 'standard',
      signal: controller.signal,
      onProgress: (p, s) => {
        setProgress(p);
        setStage(s);
      },
      onRep: (r) => setReps((prev) => [...prev, r]),
    })
      .then((result) => {
        const id = `${session.athleteId}-${Date.now()}`;
        addWorkout(session.athleteId, {
          id,
          title: isDemo ? 'Demo: squats.mp4' : `${squatVariation ?? 'standard'} squat set`,
          date: new Date().toISOString(),
          videoUri: isDemo ? undefined : uri,
          result,
        });
        router.replace({ pathname: '/reflect', params: { id } });
      })
      .catch((e: unknown) => {
        if (isAbort(e)) return;
        setError(
          e instanceof NoServerError
            ? 'No analysis server is set up. Use the demo video, or start the app with EXPO_PUBLIC_API_URL.'
            : e instanceof Error
              ? e.message
              : 'Something went wrong.'
        );
      });
    return () => controller.abort();
  }, [isDemo, uri, router, squatVariation]);

  const cancel = () => {
    abortRef.current?.abort();
    router.back();
  };

  const stageIndex = ANALYSIS_STAGES.indexOf(stage as (typeof ANALYSIS_STAGES)[number]);
  const latest = reps[reps.length - 1];
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] });

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <SafeAreaView edges={['top']} style={styles.heroInner}>
            <View style={styles.pulseWrap}>
              {!error && (
                <Animated.View style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
              )}
              <View style={styles.core}>
                {error ? (
                  <Icon name="warning" size={36} color={UFBlue} />
                ) : (
                  <ThemedText style={styles.coreText}>{Math.round(progress * 100)}%</ThemedText>
                )}
              </View>
            </View>
            <ThemedText style={styles.heroTitle}>{error ? 'Analysis failed' : 'Processing video'}</ThemedText>
            <ThemedText style={styles.heroStage}>{error || `${stage}…`}</ThemedText>
            {!error && (
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${progress * 100}%` }]} />
              </View>
            )}
          </SafeAreaView>
        </View>

        <View style={styles.body}>
          {error ? (
            <>
              <Button
                title="Use demo video instead"
                icon="play"
                variant="accent"
                onPress={() => router.replace({ pathname: '/processing', params: { mode: 'demo' } })}
              />
              <Button title="Go back" variant="ghost" onPress={cancel} />
            </>
          ) : (
            <>
              <ThemedText style={styles.sectionTitle}>Live analysis</ThemedText>
              <View style={styles.tiles}>
                <StatTile label="Reps counted" value={String(reps.length)} />
                <StatTile label="Rep tempo" value={latest ? latest.tempo_s.toFixed(1) : '–'} unit="s" />
                <StatTile label="Depth" value={latest ? formatDepth(latest.depth) : '–'} unit="× leg" />
                <StatTile label="Fatigue index" value={latest ? String(latest.rfi) : '–'} unit="RFI" />
              </View>

              {reps.length > 0 && (
                <Card>
                  <ThemedText type="smallBold">Rep Fatigue Index by rep</ThemedText>
                  <BarChart
                    points={reps.map((r) => ({ x: r.i, y: r.rfi, label: `Rep ${r.i}` }))}
                    formatY={(v) => `${Math.round(v)}`}
                    formatX={(v) => `${v}`}
                    xLabel="Rep number"
                    yLabel="Fatigue (RFI)"
                    height={170}
                    interactive={false}
                  />
                </Card>
              )}

              <Card>
                {ANALYSIS_STAGES.map((s, i) => {
                  const done = i < stageIndex || progress >= 1;
                  const active = i === stageIndex && progress < 1;
                  return (
                    <View key={s} style={styles.stageRow}>
                      {done ? (
                        <Icon name="check" size={20} color={theme.chartSeries} />
                      ) : (
                        <View
                          style={[
                            styles.dot,
                            { borderColor: active ? theme.chartMarker : theme.border },
                            active && { backgroundColor: theme.accent },
                          ]}
                        />
                      )}
                      <ThemedText type={active ? 'smallBold' : 'small'} themeColor={done || active ? 'text' : 'textSecondary'}>
                        {s}
                      </ThemedText>
                    </View>
                  );
                })}
              </Card>

              <Button title="Cancel" variant="ghost" onPress={cancel} />
            </>
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
  hero: {
    backgroundColor: UFBlue,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroInner: {
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  pulseWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  ring: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: PastelOrange,
  },
  core: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: PastelOrange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coreText: {
    color: UFBlue,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: 900,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    lineHeight: 32,
    fontWeight: 900,
  },
  heroStage: {
    color: PastelOrange,
    fontWeight: 600,
    textAlign: 'center',
  },
  track: {
    alignSelf: 'stretch',
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
    marginTop: Spacing.two,
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: PastelOrange,
  },
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.three,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 800,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: 2,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
});
