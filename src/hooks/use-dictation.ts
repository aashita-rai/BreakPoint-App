import { requireOptionalNativeModule } from 'expo';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';

import { hasApi, transcribeAudio } from '@/services/api';

// Voice → text, in order of preference:
//  1. 'native': on-device speech recognition (expo-speech-recognition). Only in a
//     development/TestFlight build; its native code isn't in Expo Go.
//  2. 'server': record with expo-audio (works in Expo Go), then send the clip to the
//     BreakPoint server's /transcribe route (Whisper). Needs EXPO_PUBLIC_API_URL.
//  3. 'none': no way to transcribe; the UI explains how to turn voice on.

type ResultEvent = { results: { transcript: string }[]; isFinal: boolean };
type ErrorEvent = { error: string; message: string };

type SpeechModule = {
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  start(options: { lang: string; interimResults: boolean; continuous: boolean }): void;
  stop(): void;
  addListener(event: 'result', cb: (e: ResultEvent) => void): { remove(): void };
  addListener(event: 'end', cb: () => void): { remove(): void };
  addListener(event: 'error', cb: (e: ErrorEvent) => void): { remove(): void };
};

const speech = requireOptionalNativeModule<SpeechModule>('ExpoSpeechRecognition');

export const dictationMode: 'native' | 'server' | 'none' = speech ? 'native' : hasApi ? 'server' : 'none';

/** onTranscript receives the full text heard in the current voice session. */
export function useDictation(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState('');
  const callback = useRef(onTranscript);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    callback.current = onTranscript;
  });

  useEffect(() => {
    if (!speech) return;
    const subs = [
      speech.addListener('result', (e) => callback.current(e.results[0]?.transcript ?? '')),
      speech.addListener('end', () => setListening(false)),
      speech.addListener('error', (e) => {
        setListening(false);
        // "no-speech" and "aborted" just mean the user stopped or stayed quiet.
        if (e.error !== 'no-speech' && e.error !== 'aborted') setError(e.message || 'Voice input stopped.');
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  const start = async () => {
    setError('');
    if (dictationMode === 'native' && speech) {
      const { granted } = await speech.requestPermissionsAsync();
      if (!granted) return setError('Microphone access is off. Turn it on in Settings to use voice input.');
      speech.start({ lang: 'en-US', interimResults: true, continuous: true });
      setListening(true);
      return;
    }
    if (dictationMode === 'server') {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) return setError('Microphone access is off. Turn it on in Settings to use voice input.');
      try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setListening(true);
      } catch {
        setError('Could not start recording.');
      }
    }
  };

  const stop = async () => {
    if (!listening) return;
    setListening(false);
    if (dictationMode === 'native') {
      speech?.stop();
      return;
    }
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri;
      if (!uri) throw new Error('No recording was saved.');
      setTranscribing(true);
      const text = await transcribeAudio(uri);
      if (text) callback.current(text);
      else setError("Didn't catch that. Try again a little closer to the phone.");
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not transcribe your voice.');
    } finally {
      setTranscribing(false);
    }
  };

  return { listening, transcribing, error, start, stop };
}
