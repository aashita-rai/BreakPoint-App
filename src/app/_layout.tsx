import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(student)" />
        {/* No swipe-back while the video is being analyzed. */}
        <Stack.Screen name="processing" options={{ gestureEnabled: false }} />
        {/* Pops up after processing, before the results. */}
        <Stack.Screen name="reflect" options={{ presentation: 'modal', gestureEnabled: false }} />
        <Stack.Screen name="results/[id]" />
        <Stack.Screen name="(coach)" />
        <Stack.Screen name="athlete/[id]" />
        <Stack.Screen name="resources" />
      </Stack>
    </ThemeProvider>
  );
}
