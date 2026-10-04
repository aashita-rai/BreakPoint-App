import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { dictationMode, useDictation } from '@/hooks/use-dictation';
import { useTheme } from '@/hooks/use-theme';

/** Multiline text box with a mic button: type, or tap the mic, speak, and tap again. */
export function DictationField({
  value,
  onChangeText,
  placeholder,
  onVoiceUsed,
  voiceEnabled = true,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  onVoiceUsed?: () => void;
  voiceEnabled?: boolean;
}) {
  const theme = useTheme();
  const [hint, setHint] = useState('');
  // Text typed before the current voice session, so dictation appends instead of replacing.
  const before = useRef('');

  const dictation = useDictation((heard) => {
    onChangeText(before.current ? `${before.current} ${heard}` : heard);
  });

  const toggleMic = () => {
    if (dictationMode === 'none') {
      setHint('Voice input needs the BreakPoint server. Start the app with EXPO_PUBLIC_API_URL set, then try again.');
      return;
    }
    if (dictation.listening) {
      dictation.stop();
    } else {
      before.current = value.trim();
      setHint('');
      onVoiceUsed?.();
      dictation.start();
    }
  };

  const busy = dictation.transcribing;

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.box,
          { backgroundColor: theme.background, borderColor: dictation.listening ? theme.chartMarker : theme.border },
        ]}>
        <TextInput
          style={[styles.input, { color: theme.text }]}
          placeholder={dictation.listening ? 'Listening…' : busy ? 'Turning your voice into text…' : placeholder}
          placeholderTextColor={theme.textSecondary}
          multiline
          value={value}
          editable={!dictation.listening && !busy}
          onChangeText={onChangeText}
        />
        {voiceEnabled && (
          <Pressable
            onPress={toggleMic}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={dictation.listening ? 'Stop recording' : 'Speak instead of typing'}
            style={[styles.mic, { backgroundColor: dictation.listening ? theme.chartMarker : theme.accent }]}>
            {busy ? <ActivityIndicator color={theme.onAccent} /> : <Icon name={dictation.listening ? 'stop' : 'mic'} size={20} color={theme.onAccent} />}
          </Pressable>
        )}
      </View>
      {dictation.listening && (
        <ThemedText type="small" style={{ color: theme.chartMarker }}>
          Recording… tap the stop button when you&apos;re done.
        </ThemedText>
      )}
      {busy && (
        <ThemedText type="small" themeColor="textSecondary">
          Turning your voice into text…
        </ThemedText>
      )}
      {dictation.error || hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {dictation.error || hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    minHeight: 80,
    maxHeight: 200,
    fontSize: 16,
    textAlignVertical: 'top',
    paddingHorizontal: Spacing.one,
  },
  mic: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
