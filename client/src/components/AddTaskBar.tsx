import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';

type Props = {
  onAdd: (title: string) => void;
};

// The lightest possible capture: one line, one tap. This grows into the
// friction-free brain-dump (BUILD-PLAN step 2); for now it just adds to Today.
export function AddTaskBar({ onAdd }: Props) {
  const [value, setValue] = useState('');

  function submit() {
    if (!value.trim()) return;
    onAdd(value);
    setValue('');
  }

  return (
    <View style={styles.bar}>
      <TextInput
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        placeholder="Add one thing for today"
        placeholderTextColor={colors.inkFaint}
        style={styles.input}
        returnKeyType="done"
        accessibilityLabel="Add a task to today"
      />
      <Pressable
        onPress={submit}
        style={({ pressed }) => [styles.add, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Add"
      >
        <Text style={styles.addText}>Add</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.three },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.four,
    paddingVertical: spacing.four,
    fontSize: 16,
    color: colors.ink,
  },
  add: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.five,
    paddingVertical: spacing.four,
  },
  pressed: { opacity: 0.8 },
  addText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
