import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DictationField } from '@/components/dictation-field';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Icon } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { addFeedback, session } from '@/data/store';
import { useTheme } from '@/hooks/use-theme';

/** Type or speak feedback for an athlete, optionally tied to one workout. */
export function FeedbackComposer({
  athleteId,
  workoutId,
  heading,
}: {
  athleteId: string;
  workoutId: string | null;
  heading?: string;
}) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [usedVoice, setUsedVoice] = useState(false);
  const [sent, setSent] = useState(false);

  const send = () => {
    const message = text.trim();
    if (!message) return;
    const title = session.role === 'trainer' ? 'AT' : 'Coach';
    addFeedback({
      athleteId,
      workoutId,
      coach: session.name ? `${title} ${session.name}` : title,
      message,
      source: usedVoice ? 'voice' : 'typed',
    });
    setText('');
    setUsedVoice(false);
    setSent(true);
  };

  return (
    <Card>
      <ThemedText style={styles.heading}>{heading ?? 'Leave feedback'}</ThemedText>
      <DictationField
        value={text}
        onChangeText={(t) => {
          setText(t);
          setSent(false);
        }}
        placeholder="Type or tap the mic to speak"
        onVoiceUsed={() => setUsedVoice(true)}
      />
      <Button title="Send feedback" icon="send" onPress={send} disabled={!text.trim()} />
      {sent && (
        <View style={styles.sent}>
          <Icon name="check" size={16} color={theme.chartSeries} />
          <ThemedText type="small">Sent. The athlete will see it in their Coach Feedback tab.</ThemedText>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 17,
    fontWeight: 800,
  },
  sent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
