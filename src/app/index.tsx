import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DepartmentPicker } from '@/components/department-picker';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui-kit';
import { MaxContentWidth, PastelOrange, Spacing, UFBlue } from '@/constants/theme';
import { type Role, session, signInAthlete } from '@/data/store';
import { useTheme } from '@/hooks/use-theme';

const ROLE_LABEL: Record<Role, string> = { student: 'Athlete', coach: 'Coach', trainer: 'Trainer' };

// "jadan.baugh@ufl.edu" → "Jadan Baugh"
function nameFromEmail(email: string) {
  const local = email.split('@')[0] ?? '';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function SignInScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [role, setRole] = useState<Role>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [departmentId, setDepartmentId] = useState(session.departmentId);

  // No real authentication yet: any email + password is accepted.
  const signIn = () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setError('');
    const name = nameFromEmail(email.trim());
    session.role = role;
    // Staff are shown as "Coach Smith" / "AT Smith".
    session.name = role === 'student' ? name : (name.split(' ').pop() ?? name);
    session.departmentId = departmentId;
    if (role === 'student') {
      session.athleteId = signInAthlete(name, departmentId);
      router.replace('/workouts');
    } else {
      router.replace('/athletes');
    }
  };

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.border },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.hero}>
        <SafeAreaView edges={['top']} style={styles.heroInner}>
          <Image
            source={require('@/assets/images/breakpoint-logo.png')}
            style={styles.logo}
            contentFit="contain"
            accessibilityLabel="BreakPoint logo"
          />
          <ThemedText style={styles.brand}>BreakPoint</ThemedText>
          <ThemedText style={styles.tagline}>Find your breaking point. Train past it.</ThemedText>
        </SafeAreaView>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <ThemedText type="smallBold" themeColor="textSecondary">
            I AM A
          </ThemedText>
          <View style={[styles.segment, { backgroundColor: theme.backgroundSelected }]}>
            {(['student', 'coach', 'trainer'] as const).map((r) => {
              const selected = role === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => setRole(r)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.segmentItem, selected && { backgroundColor: theme.accent }]}>
                  <ThemedText
                    type="smallBold"
                    style={{ color: selected ? theme.onAccent : theme.textSecondary, fontSize: 15 }}>
                    {ROLE_LABEL[r]}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary">
            DEPARTMENT OF ATHLETICS
          </ThemedText>
          <DepartmentPicker value={departmentId} onChange={setDepartmentId} />

          <TextInput
            style={inputStyle}
            placeholder="Email"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={inputStyle}
            placeholder="Password"
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={signIn}
          />

          {error ? (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {error}
            </ThemedText>
          ) : null}

          <Button title={`Sign in as ${role === 'trainer' ? 'Athletic Trainer' : ROLE_LABEL[role]}`} onPress={signIn} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  hero: {
    backgroundColor: UFBlue,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  heroInner: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.five,
    gap: Spacing.two,
  },
  logo: {
    width: 112,
    height: 112,
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 44,
    lineHeight: 50,
    fontWeight: 900,
    letterSpacing: -1,
  },
  tagline: {
    color: PastelOrange,
    fontSize: 17,
    fontWeight: 600,
  },
  form: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: Spacing.one,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 11,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: 15,
    fontSize: 16,
  },
});
