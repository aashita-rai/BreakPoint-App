import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { DEPARTMENTS, departmentLabel } from '@/data/store';
import { useTheme } from '@/hooks/use-theme';

export function DepartmentPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Team: ${departmentLabel(value)}. Change`}
        style={[styles.field, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <ThemedText style={styles.flex}>{departmentLabel(value)}</ThemedText>
        <Icon name="chevron" size={16} color={theme.textSecondary} />
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={[styles.flex, { backgroundColor: theme.background }]}>
          <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
            <View style={styles.sheetHeader}>
              <ThemedText style={styles.sheetTitle}>Department of Athletics</ThemedText>
              <Pressable onPress={() => setOpen(false)} accessibilityRole="button" hitSlop={10}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  Close
                </ThemedText>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.list}>
              {DEPARTMENTS.map((d) => {
                const selected = d.id === value;
                return (
                  <Pressable
                    key={d.id}
                    onPress={() => {
                      onChange(d.id);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[
                      styles.option,
                      { backgroundColor: selected ? theme.accentSoft : theme.backgroundElement, borderColor: theme.border },
                    ]}>
                    <View style={styles.flex}>
                      <ThemedText type="smallBold" style={styles.optionTitle}>
                        {d.sport}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {d.gender}
                      </ThemedText>
                    </View>
                    {selected && <Icon name="check" size={22} color={theme.chartSeries} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: 15,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: 800,
  },
  list: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.two,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: Spacing.three,
  },
  optionTitle: {
    fontSize: 16,
  },
});
