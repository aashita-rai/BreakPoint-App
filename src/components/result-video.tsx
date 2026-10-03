import { useVideoPlayer, VideoView } from 'expo-video';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui-kit';

/** Plays the annotated (skeleton overlay) video, or the original clip if there is no overlay. */
export function ResultVideo({ source, annotated }: { source: string | number; annotated: boolean }) {
  const player = useVideoPlayer(source);
  return (
    <Card>
      <ThemedText type="smallBold">{annotated ? 'Skeleton overlay' : 'Your video (no overlay yet)'}</ThemedText>
      <VideoView player={player} nativeControls contentFit="contain" style={styles.video} />
    </Card>
  );
}

const styles = StyleSheet.create({
  video: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 460,
    borderRadius: 12,
    backgroundColor: '#000',
  },
});
