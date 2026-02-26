import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSpotColors } from '../theme/colors';
import { SpotTypography } from '../theme/typography';
import { ALL_CATEGORIES, PlaceCategory } from '../types';

interface FilterBarProps {
  selectedFilter: PlaceCategory | null;
  onFilterChange: (filter: PlaceCategory | null) => void;
}

export function FilterBar({ selectedFilter, onFilterChange }: FilterBarProps) {
  const colors = useSpotColors();

  const renderChip = (label: string, isSelected: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={label}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`${label} filter`}
      style={[
        styles.chip,
        {
          backgroundColor: isSelected ? colors.spotEmerald : 'transparent',
          borderColor: isSelected ? colors.spotEmerald : colors.spotDivider,
        },
      ]}
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

  return (
    <View style={{ flex: 1 }} accessibilityLabel="Category filters">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.container}
      >
        {renderChip('All', selectedFilter === null, () => onFilterChange(null))}
        {ALL_CATEGORIES.map((cat) =>
          renderChip(cat, selectedFilter === cat, () => onFilterChange(cat)),
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    ...SpotTypography.subheadline,
  },
});
