import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { SpotButton } from '../../components/SpotButton';
import { useSpotColors, spotEmerald, spotEmeraldLight } from '../../theme/colors';
import { SpotTypography } from '../../theme/typography';
import { useTheme } from '../../context/ThemeContext';
import type { PlaceCacheDTO } from '../../types';

interface SaveConfirmationModalProps {
  visible: boolean;
  placeDTO: PlaceCacheDTO | null;
  onSave: (note: string, dateVisited: string | null) => void;
  onCancel: () => void;
  loading?: boolean;
}

export function SaveConfirmationModal({
  visible,
  placeDTO,
  onSave,
  onCancel,
  loading = false,
}: SaveConfirmationModalProps) {
  const [noteText, setNoteText] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateVisited, setDateVisited] = useState<Date | null>(null);
  const colors = useSpotColors();
  const { resolvedScheme } = useTheme();

  if (!placeDTO) return null;

  const handleSave = () => {
    onSave(noteText, dateVisited ? dateVisited.toISOString() : null);
    setNoteText('');
    setDateVisited(null);
    setShowDatePicker(false);
  };

  const handleCancel = () => {
    setNoteText('');
    setDateVisited(null);
    setShowDatePicker(false);
    onCancel();
  };

  const accessibilityParts = [placeDTO.name];
  if (placeDTO.cuisine) accessibilityParts.push(placeDTO.cuisine);
  if (placeDTO.rating > 0) accessibilityParts.push(`${placeDTO.rating.toFixed(1)} stars`);
  if (placeDTO.category) accessibilityParts.push(placeDTO.category);
  if (placeDTO.address) accessibilityParts.push(placeDTO.address);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCancel}
    >
      <View
        style={[styles.container, { backgroundColor: colors.spotBackground }]}
      >
        {/* Header */}
        <Text style={[styles.header, { color: colors.spotTextPrimary }]}>
          Save this spot?
        </Text>

        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Place details card */}
          <View
            style={[styles.detailsCard, { backgroundColor: colors.spotCardBackground }]}
            accessibilityLabel={accessibilityParts.join(', ')}
          >
            <Text style={[styles.placeName, { color: colors.spotTextPrimary }]}>
              {placeDTO.name}
            </Text>

            {placeDTO.cuisine ? (
              <Text style={[styles.cuisine, { color: colors.spotTextSecondary }]}>
                {placeDTO.cuisine}
              </Text>
            ) : null}

            <View style={styles.metaRow}>
              {placeDTO.rating > 0 && (
                <View style={styles.ratingContainer}>
                  <Ionicons name="star" size={12} color="#F59E0B" />
                  <Text style={[styles.metaText, { color: colors.spotTextSecondary }]}>
                    {placeDTO.rating.toFixed(1)}
                  </Text>
                </View>
              )}
              {placeDTO.category ? (
                <>
                  <Text style={[styles.dot, { color: colors.spotTextSecondary }]}>&middot;</Text>
                  <Text style={[styles.metaText, { color: colors.spotTextSecondary }]}>
                    {placeDTO.category}
                  </Text>
                </>
              ) : null}
            </View>

            {placeDTO.address ? (
              <Text style={[styles.address, { color: colors.spotTextSecondary }]}>
                {placeDTO.address}
              </Text>
            ) : null}
          </View>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.spotDivider }]} />

          {/* Note field */}
          <View style={styles.noteSection}>
            <Text style={[styles.noteLabel, { color: colors.spotTextSecondary }]}>
              Add a note
            </Text>
            <TextInput
              style={[
                styles.noteInput,
                {
                  color: colors.spotTextPrimary,
                  borderColor: colors.spotDivider,
                },
              ]}
              placeholder="e.g. Must try the spicy ramen"
              placeholderTextColor={colors.spotTextSecondary}
              value={noteText}
              onChangeText={setNoteText}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Date visited */}
          <View style={styles.dateSection}>
            <View style={styles.dateToggleRow}>
              <Text style={[styles.noteLabel, { color: colors.spotTextSecondary }]}>
                Date visited
              </Text>
              <Switch
                value={showDatePicker}
                onValueChange={(value) => {
                  setShowDatePicker(value);
                  setDateVisited(value ? new Date() : null);
                }}
                trackColor={{ true: spotEmerald }}
              />
            </View>
            {showDatePicker && (
              <DateTimePicker
                value={dateVisited ?? new Date()}
                mode="date"
                display="inline"
                maximumDate={new Date()}
                onChange={(_, selectedDate) => {
                  if (selectedDate) setDateVisited(selectedDate);
                }}
                accentColor={resolvedScheme === 'dark' ? spotEmeraldLight : spotEmerald}
                themeVariant={resolvedScheme}
              />
            )}
          </View>
        </ScrollView>

        {/* Buttons */}
        <View style={styles.buttonRow}>
          <SpotButton title="Cancel" variant="outline" onPress={handleCancel} disabled={loading} style={{ flex: 1 }} />
          <SpotButton title="Save" variant="primary" onPress={handleSave} loading={loading} style={{ flex: 1 }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    ...SpotTypography.headline,
    textAlign: 'center',
    paddingVertical: 16,
  },
  scroll: {
    flex: 1,
  },
  detailsCard: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  placeName: {
    ...SpotTypography.title3,
  },
  cuisine: {
    ...SpotTypography.subheadline,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  metaText: {
    ...SpotTypography.subheadline,
  },
  dot: {
    ...SpotTypography.subheadline,
    marginHorizontal: 4,
  },
  address: {
    ...SpotTypography.footnote,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 16,
    marginHorizontal: 16,
  },
  noteSection: {
    paddingHorizontal: 16,
    gap: 8,
  },
  noteLabel: {
    ...SpotTypography.subheadline,
  },
  noteInput: {
    ...SpotTypography.body,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    maxHeight: 160,
  },
  dateSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  dateToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 16,
    gap: 12,
  },
});
