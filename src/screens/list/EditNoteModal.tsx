import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useSpotColors } from '../../theme/colors';
import { SpotTypography } from '../../theme/typography';

interface EditNoteModalProps {
  visible: boolean;
  placeName: string;
  initialNote: string;
  initialDateVisited: string | null;
  onSave: (note: string, dateVisited?: string | null) => void;
  onCancel: () => void;
}

export function EditNoteModal({
  visible,
  placeName,
  initialNote,
  initialDateVisited,
  onSave,
  onCancel,
}: EditNoteModalProps) {
  const [noteText, setNoteText] = useState(initialNote);
  const [dateVisited, setDateVisited] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const colors = useSpotColors();

  useEffect(() => {
    if (visible) {
      setNoteText(initialNote);
      setDateVisited(initialDateVisited ? new Date(initialDateVisited) : null);
      setShowDatePicker(false);
    }
  }, [visible, initialNote, initialDateVisited]);

  const handleSave = () => {
    const dateStr = dateVisited ? dateVisited.toISOString().split('T')[0] : null;
    onSave(noteText, dateStr);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          style={[styles.container, { backgroundColor: colors.spotBackground }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Drag indicator */}
          <View style={styles.dragIndicatorRow}>
            <View style={[styles.dragIndicator, { backgroundColor: colors.spotDivider }]} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onCancel} style={styles.headerButton}>
              <Text style={[styles.cancelText, { color: colors.spotTextSecondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={styles.headerButton}>
              <Text style={[styles.saveText, { color: colors.spotEmerald }]}>Save</Text>
            </TouchableOpacity>
          </View>

          {/* Place name */}
          <Text style={[styles.placeName, { color: colors.spotTextPrimary }]}>
            {placeName}
          </Text>

          {/* Note input */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.spotTextSecondary }]}>
              Note
            </Text>
            <TextInput
              style={[
                styles.noteInput,
                {
                  color: colors.spotTextPrimary,
                  backgroundColor: colors.spotCardBackground,
                },
              ]}
              placeholder="What made this spot special?"
              placeholderTextColor={colors.spotTextSecondary}
              value={noteText}
              onChangeText={setNoteText}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              autoFocus
            />
          </View>

          {/* Date visited */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.spotTextSecondary }]}>
              Date visited
            </Text>
            <TouchableOpacity
              onPress={() => {
                Keyboard.dismiss();
                if (!dateVisited) setDateVisited(new Date());
                setShowDatePicker(!showDatePicker);
              }}
              activeOpacity={0.7}
              style={[
                styles.dateButton,
                { backgroundColor: colors.spotCardBackground },
              ]}
            >
              <Ionicons
                name="calendar-outline"
                size={18}
                color={dateVisited ? colors.spotEmerald : colors.spotTextSecondary}
              />
              <Text
                style={[
                  styles.dateText,
                  { color: dateVisited ? colors.spotTextPrimary : colors.spotTextSecondary },
                ]}
              >
                {dateVisited ? formatDate(dateVisited) : 'Add a date'}
              </Text>
              {dateVisited && (
                <TouchableOpacity
                  onPress={() => {
                    setDateVisited(null);
                    setShowDatePicker(false);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={18} color={colors.spotTextSecondary} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={dateVisited ?? new Date()}
                mode="date"
                display="inline"
                maximumDate={new Date()}
                onChange={(_event, selectedDate) => {
                  if (selectedDate) setDateVisited(selectedDate);
                }}
                accentColor={colors.spotEmerald}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  dragIndicatorRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  cancelText: {
    ...SpotTypography.body,
  },
  saveText: {
    ...SpotTypography.headline,
  },
  placeName: {
    ...SpotTypography.title2,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 8,
  },
  sectionLabel: {
    ...SpotTypography.subheadline,
    fontWeight: '500',
  },
  noteInput: {
    ...SpotTypography.body,
    borderRadius: 12,
    padding: 14,
    minHeight: 100,
    maxHeight: 180,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
  },
  dateText: {
    ...SpotTypography.body,
    flex: 1,
  },
});
