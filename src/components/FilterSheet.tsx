import React from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSpotColors, spotEmerald } from '../theme/colors';
import { SpotTypography } from '../theme/typography';

interface FilterSheetProps {
  visible: boolean;
  selectedDistance: number | null;
  selectedCuisine: string | null;
  availableCuisines: string[];
  onDistanceChange: (d: number | null) => void;
  onCuisineChange: (c: string | null) => void;
  onClearAll: () => void;
  onDone: () => void;
}

const DISTANCE_OPTIONS: { label: string; value: number | null }[] = [
  { label: '1 km', value: 1 },
  { label: '5 km', value: 5 },
  { label: '10 km', value: 10 },
  { label: '25 km', value: 25 },
  { label: 'Any', value: null },
];

export function FilterSheet({
  visible,
  selectedDistance,
  selectedCuisine,
  availableCuisines,
  onDistanceChange,
  onCuisineChange,
  onClearAll,
  onDone,
}: FilterSheetProps) {
  const colors = useSpotColors();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDone}
    >
      <View style={[styles.container, { backgroundColor: colors.spotBackground }]}>
        {/* Drag indicator */}
        <View style={styles.dragIndicatorRow}>
          <View style={[styles.dragIndicator, { backgroundColor: colors.spotDivider }]} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClearAll} style={styles.headerButtonTouchable}>
            <Text style={[styles.headerButtonText, { color: colors.spotTextSecondary }]}>
              Clear All
            </Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.spotTextPrimary }]}>
            Filters
          </Text>
          <TouchableOpacity onPress={onDone} style={styles.headerButtonTouchable}>
            <Text style={[styles.headerButtonText, { color: spotEmerald, fontWeight: '600' }]}>
              Done
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Distance */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.spotTextPrimary }]}>
              Distance
            </Text>
            <View style={styles.chipRow}>
              {DISTANCE_OPTIONS.map((opt) => (
                <Chip
                  key={opt.label}
                  label={opt.label}
                  isSelected={selectedDistance === opt.value}
                  onPress={() => onDistanceChange(opt.value)}
                />
              ))}
            </View>
          </View>

          {/* Cuisine */}
          {availableCuisines.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.spotTextPrimary }]}>
                Cuisine
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {availableCuisines.map((cuisine) => (
                    <Chip
                      key={cuisine}
                      label={cuisine}
                      isSelected={selectedCuisine === cuisine}
                      onPress={() =>
                        onCuisineChange(selectedCuisine === cuisine ? null : cuisine)
                      }
                    />
                  ))}
                </View>
              </ScrollView>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Chip({
  label,
  isSelected,
  onPress,
}: {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  const colors = useSpotColors();

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        isSelected
          ? { backgroundColor: spotEmerald }
          : { borderColor: colors.spotDivider, borderWidth: 1 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
    >
      <Text
        style={[
          styles.chipText,
          { color: isSelected ? '#FFFFFF' : colors.spotTextPrimary },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
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
  headerTitle: {
    ...SpotTypography.headline,
  },
  headerButtonTouchable: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  headerButtonText: {
    ...SpotTypography.body,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 24,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    ...SpotTypography.headline,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  chipText: {
    ...SpotTypography.subheadline,
  },
});
