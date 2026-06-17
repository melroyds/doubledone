import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';

type Props = {
  onCapture: (text: string) => void;
};

// The friction-free relief valve: empty your head, one line per thing, and the
// lines become tasks. One line or twenty, same gesture. Later this is what AI
// triage reads; for now every line just lands in Today.
export function BrainDump({ onCapture }: Props) {
  const [value, setValue] = useState('');

  function submit() {
    if (!value.trim()) return;
    onCapture(value);
    setValue('');
  }

  return (
    <View style={styles.wrap}>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="Empty your head. One line per thing."
        placeholderTextColor={colors.inkFaint}
        style={styles.input}
        multiline
        textAlignVertical="top"
        accessibilityLabel="Brain-dump. Add one or more things to today, one per line"
      />
      <Pressable
        onPress={submit}
        style={({ pressed }) => [styles.add, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Add to today"
      >
        <Text style={styles.addText}>Add to today</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.three },
  input: {
    minHeight: 64,
    maxHeight: 160,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.four,
    paddingVertical: spacing.three,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  add: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.five,
    paddingVertical: spacing.three,
  },
  pressed: { opacity: 0.8 },
  addText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
