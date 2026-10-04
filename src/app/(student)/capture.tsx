import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { HeaderLinks } from '@/components/header-links';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, HeroHeader, Icon } from '@/components/ui-kit';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatClock } from '@/lib/metrics';
import { SQUAT_VARIATIONS, type SquatVariation } from '@/lib/squat-types';
import { checkHealth, hasApi } from '@/services/api';

// README §9 Capture tab setup guide.
const SETUP_GUIDE = [
  'Side view: film from the athlete’s side, not the front',
  'Whole body in frame, head to feet, for the entire set',
  'Phone steady (propped up or on a tripod), about 2–3 m away',
  'Fitted clothes so hips and knees are easy to see',
  'One person in frame, bodyweight squats only',
];

type PickedVideo = { uri: string; durationSec?: number; name: string };
type ServerState = 'none' | 'checking' | 'online' | 'offline';

export default function CaptureScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [error, setError] = useState('');
  const [server, setServer] = useState<ServerState>(hasApi ? 'checking' : 'none');
  const [variation, setVariation] = useState<SquatVariation>('standard');

  useEffect(() => {
    if (!hasApi) return;
    let live = true;
    checkHealth().then((ok) => live && setServer(ok ? 'online' : 'offline'));
    return () => {
      live = false;
    };
  }, []);

  const pick = async (source: 'library' | 'camera') => {
    setError('');
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(
        source === 'camera'
          ? 'Camera access is off. Turn it on in Settings to record a set.'
          : 'Photo library access is off. Turn it on in Settings to upload a video.'
      );
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['videos'], quality: 1 };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setVideo({
      uri: asset.uri,
      durationSec: asset.duration ? asset.duration / 1000 : undefined,
      name: asset.fileName ?? 'Squat video',
    });
  };

  const analyze = () => {
    if (!video) return;
    router.push({ pathname: '/processing', params: { mode: 'upload', uri: video.uri, squatVariation: variation } });
    setVideo(null);
  };

  const serverText = {
    none: 'No analysis server set. Start the app with EXPO_PUBLIC_API_URL to analyze your own videos. The demo video works offline.',
    checking: 'Checking the analysis server…',
    online: 'Connected to the analysis server.',
    offline: "Can't reach the analysis server. Check it's running (and the tunnel, if you use one), or use the demo video.",
  }[server];
  const serverColor = { none: theme.textSecondary, checking: theme.textSecondary, online: theme.statusGreen, offline: theme.statusRed }[server];

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <HeroHeader eyebrow="Squat fatigue check" title="Capture a Set" right={<HeaderLinks signOut={false} />} />
        <View style={styles.body}>
          <View style={styles.serverRow}>
            <View style={[styles.serverDot, { backgroundColor: serverColor }]} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              {serverText}
            </ThemedText>
          </View>

          {video ? (
            <Card>
              <View style={styles.pickedRow}>
                <Icon name="check" size={28} color={theme.chartSeries} />
                <View style={styles.flex}>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {video.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {video.durationSec ? `${formatClock(video.durationSec)} long` : 'Ready to analyze'}
                  </ThemedText>
                </View>
                <Pressable onPress={() => setVideo(null)} accessibilityRole="button" hitSlop={10}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    Change
                  </ThemedText>
                </Pressable>
              </View>
              <Button
                title="Analyze my set"
                icon="bolt"
                variant="accent"
                disabled={server !== 'online'}
                onPress={analyze}
              />
            </Card>
          ) : (
            <View style={[styles.drop, { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}>
              <Icon name="camera" size={44} color={theme.text} />
              <ThemedText style={styles.dropTitle}>Record or upload your squats</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                We measure tempo, depth and rep speed on every rep and compare them with your first reps.
              </ThemedText>
              <View style={styles.pickButtons}>
                <View style={styles.flex}>
                  <Button title="Record" icon="camera" onPress={() => pick('camera')} />
                </View>
                <View style={styles.flex}>
                  <Button title="Library" icon="library" variant="ghost" onPress={() => pick('library')} />
                </View>
              </View>
            </View>
          )}

          <Card>
            <ThemedText type="smallBold">Squat variation</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Choose the variation you filmed so your result is labeled correctly.
            </ThemedText>
            <View style={styles.variationRow}>
              {SQUAT_VARIATIONS.map((item) => {
                const selected = item === variation;
                return (
                  <Pressable key={item} onPress={() => setVariation(item)} accessibilityRole="button" accessibilityState={{ selected }}
                    style={[styles.variation, { backgroundColor: selected ? theme.primary : theme.background, borderColor: selected ? theme.primary : theme.border }]}>
                    <ThemedText type="smallBold" style={{ color: selected ? theme.onPrimary : theme.text }}>{item}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {error ? (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {error}
            </ThemedText>
          ) : null}

          <Button
            title="Use demo video"
            icon="play"
            variant="ghost"
            onPress={() => router.push({ pathname: '/processing', params: { mode: 'demo' } })}
          />

          <Card>
            <ThemedText type="smallBold">Setup guide</ThemedText>
            {SETUP_GUIDE.map((tip, i) => (
              <View key={tip} style={styles.tipRow}>
                <ThemedText type="smallBold" style={{ color: theme.chartMarker }}>
                  {i + 1}
                </ThemedText>
                <ThemedText type="small" style={styles.flex}>
                  {tip}
                </ThemedText>
              </View>
            ))}
          </Card>

          <ThemedText type="small" themeColor="textSecondary">
            Videos are processed for this session and not stored by default. BreakPoint flags sets for human review. It does not diagnose.
          </ThemedText>
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
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  serverDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  drop: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 22,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  dropTitle: {
    fontSize: 20,
    fontWeight: 800,
    textAlign: 'center',
  },
  center: {
    textAlign: 'center',
  },
  pickButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignSelf: 'stretch',
    marginTop: Spacing.two,
  },
  variationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  variation: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  pickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  tipRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
