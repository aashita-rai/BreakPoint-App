/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// University of Florida palette: UF blue (#0021A5) with a pastel take on UF orange (#FA4616).
// chartSeries / chartMarker were checked with the dataviz palette validator against each mode's card color.
export const UFBlue = '#0021A5';
export const PastelOrange = '#FFB27D';

export const Colors = {
  light: {
    text: '#0B1533',
    background: '#F4F6FB',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E3E8F7',
    textSecondary: '#5A6482',
    primary: UFBlue,
    onPrimary: '#FFFFFF',
    accent: PastelOrange,
    onAccent: '#0B1533',
    accentSoft: '#FFE9DA',
    border: '#E3E7F0',
    tabActive: UFBlue,
    chartSeries: '#1F45D1',
    chartMarker: '#CC6A2C',
    danger: '#C93838',
    // Traffic lights. Always shown with a text label, never colour alone.
    statusGreen: '#1E8E4E',
    statusAmber: '#C98A00',
    statusRed: '#D03A3A',
  },
  dark: {
    text: '#F3F5FF',
    background: '#070D24',
    backgroundElement: '#111A3D',
    backgroundSelected: '#1C2752',
    textSecondary: '#A4AECB',
    primary: '#2F52E0',
    onPrimary: '#FFFFFF',
    accent: PastelOrange,
    onAccent: '#0B1533',
    accentSoft: '#3A2A22',
    border: '#222C55',
    tabActive: PastelOrange,
    chartSeries: '#6683FA',
    chartMarker: '#D27A3E',
    danger: '#FF7A7A',
    statusGreen: '#4CC27A',
    statusAmber: '#F2B233',
    statusRed: '#FF6B6B',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
