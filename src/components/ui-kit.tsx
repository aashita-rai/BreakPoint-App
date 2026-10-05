import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { type ColorValue, Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { PastelOrange, Spacing, UFBlue } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type Status, STATUS_LABEL } from '@/lib/fatigue';

// SF Symbols on iOS, Material Symbols on Android/web.
const ICONS = {
  workouts: { ios: 'figure.strengthtraining.traditional', android: 'fitness_center', web: 'fitness_center' },
  upload: { ios: 'arrow.up.circle.fill', android: 'upload', web: 'upload' },
  feedback: { ios: 'bubble.left.and.bubble.right.fill', android: 'forum', web: 'forum' },
  library: { ios: 'photo.on.rectangle', android: 'photo_library', web: 'photo_library' },
  camera: { ios: 'video.fill', android: 'videocam', web: 'videocam' },
  check: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  bolt: { ios: 'bolt.fill', android: 'bolt', web: 'bolt' },
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  back: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' },
  flame: { ios: 'flame.fill', android: 'local_fire_department', web: 'local_fire_department' },
  mic: { ios: 'mic.fill', android: 'mic', web: 'mic' },
  stop: { ios: 'stop.fill', android: 'stop', web: 'stop' },
  send: { ios: 'paperplane.fill', android: 'send', web: 'send' },
  team: { ios: 'person.3.fill', android: 'groups', web: 'groups' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  checkin: { ios: 'heart.text.square.fill', android: 'monitor_heart', web: 'monitor_heart' },
  report: { ios: 'doc.text.fill', android: 'description', web: 'description' },
  info: { ios: 'cross.case.fill', android: 'medical_services', web: 'medical_services' },
  share: { ios: 'square.and.arrow.up', android: 'share', web: 'share' },
  warning: { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' },
  flag: { ios: 'flag.fill', android: 'flag', web: 'flag' },
  play: { ios: 'play.rectangle.fill', android: 'smart_display', web: 'smart_display' },
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: ColorValue }) {
  return <SymbolView name={ICONS[name]} size={size} tintColor={color} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, style]}>
      {children}
    </View>
  );
}

export function StatTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText style={styles.tileValue}>
        {value}
        {unit ? (
          <ThemedText type="small" themeColor="textSecondary">
            {' '}
            {unit}
          </ThemedText>
        ) : null}
      </ThemedText>
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'accent' | 'ghost';
  icon?: IconName;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const bg = variant === 'primary' ? theme.primary : variant === 'accent' ? theme.accent : 'transparent';
  const fg = variant === 'primary' ? theme.onPrimary : variant === 'accent' ? theme.onAccent : theme.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        variant === 'ghost' && { borderColor: theme.border, borderWidth: 1 },
      ]}>
      {icon && <Icon name={icon} size={18} color={fg} />}
      <ThemedText type="smallBold" style={{ color: fg, fontSize: 16 }}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

/** Traffic light: coloured dot + text label (colour is never the only signal). */
export function StatusPill({ status, label }: { status: Status; label?: string }) {
  const theme = useTheme();
  const color = { green: theme.statusGreen, amber: theme.statusAmber, red: theme.statusRed }[status];
  return (
    <View style={[styles.pill, { backgroundColor: theme.backgroundSelected }]}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <ThemedText type="small" style={styles.pillText}>
        {label ?? STATUS_LABEL[status]}
      </ThemedText>
    </View>
  );
}

/** UF-blue header band used at the top of every athlete screen. */
export function HeroHeader({
  eyebrow,
  title,
  right,
  children,
}: {
  eyebrow?: string;
  title: string;
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <View style={styles.hero}>
      <SafeAreaView edges={['top']} style={styles.heroInner}>
        <View style={styles.heroRow}>
          <View style={styles.heroText}>
            {eyebrow ? <ThemedText style={styles.heroEyebrow}>{eyebrow}</ThemedText> : null}
            <ThemedText style={styles.heroTitle} numberOfLines={2}>
              {title}
            </ThemedText>
          </View>
          {right}
        </View>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pillDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  pillText: {
    fontSize: 12,
    lineHeight: 16,
  },
  hero: {
    backgroundColor: UFBlue,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroInner: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  heroText: {
    flex: 1,
  },
  heroEyebrow: {
    color: PastelOrange,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: 900,
    letterSpacing: -0.5,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.three,
    gap: 2,
  },
  tileValue: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: 800,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: Spacing.four,
  },
});
