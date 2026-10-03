import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui-kit';
import { PastelOrange, Spacing } from '@/constants/theme';

/** Resources (+ optional Sign out), shown at the top right of the hero header. */
export function HeaderLinks({ signOut = true }: { signOut?: boolean }) {
  const router = useRouter();
  return (
    <View style={styles.links}>
      <Pressable
        onPress={() => router.push('/resources')}
        accessibilityRole="button"
        accessibilityLabel="Health and safety resources"
        hitSlop={10}>
        <Icon name="info" size={22} color={PastelOrange} />
      </Pressable>
      {signOut && (
        <Pressable onPress={() => router.replace('/')} accessibilityRole="button" hitSlop={10}>
          <ThemedText type="smallBold" style={{ color: PastelOrange }}>
            Sign out
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
});
