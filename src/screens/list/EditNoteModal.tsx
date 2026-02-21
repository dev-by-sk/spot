import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSpotColors } from '../../theme/colors';
import { SpotTypography } from '../../theme/typography';

interface EditNoteModalProps {
  visible: boolean;
  placeName: string;
  initialNote: string;
  onSave: (note: string) => void;
  onCancel: () => void;
}

export function EditNoteModal({
  visible,
  placeName,
  initialNote,
  onSave,
  onCancel,
}: EditNoteModalProps) {
  const [noteText, setNoteText] = useState(initialNote);
  const colors = useSpotColors();

  useEffect(() => {
    if (visible) setNoteText(initialNote);
  }, [visible, initialNote]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.spotBackground }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel}>
            <Text style={[styles.cancelText, { color: colors.spotTextSecondary }]}>
              Cancel
            </Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.spotTextPrimary }]}>
            Edit note
          </Text>
          <TouchableOpacity
            onPress={() => onSave(noteText)}
          >
            <Text style={[styles.saveText, { color: colors.spotEmerald }]}>Save</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={[styles.placeName, { color: colors.spotTextPrimary }]}>
            {placeName}
          </Text>
          <TextInput
            style={[
              styles.noteInput,
              {
                color: colors.spotTextPrimary,
                borderColor: colors.spotDivider,
              },
            ]}
            placeholder="Add a note"
            placeholderTextColor={colors.spotTextSecondary}
            value={noteText}
            onChangeText={setNoteText}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            autoFocus
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    ...SpotTypography.headline,
  },
  cancelText: {
    ...SpotTypography.body,
  },
  saveText: {
    ...SpotTypography.headline,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  placeName: {
    ...SpotTypography.title3,
  },
  noteInput: {
    ...SpotTypography.body,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    maxHeight: 160,
  },
});
