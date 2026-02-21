import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Keyboard,
  StyleSheet,
  InteractionManager,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { usePlaces } from '../../hooks/usePlaces';
import { useAuth } from '../../hooks/useAuth';
import { useDebounce } from '../../hooks/useDebounce';
import { useSpotColors } from '../../theme/colors';
import { SpotTypography } from '../../theme/typography';
import { SEARCH_DEBOUNCE_MS } from '../../config/constants';
import { SaveConfirmationModal } from './SaveConfirmationModal';
import type { PlaceCacheDTO, PlaceSearchResult } from '../../types';
import { SpotError } from '../../types';

export function SearchScreen() {
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    search,
    getPlaceDetails,
    savePlace,
  } = usePlaces();
  const { currentUserId } = useAuth();
  const colors = useSpotColors();
  const navigation = useNavigation<any>();

  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [placeToSave, setPlaceToSave] = useState<PlaceCacheDTO | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const isFocused = useIsFocused();

  React.useEffect(() => {
    if (!isFocused) {
      setSearchQuery('');
    }
  }, [isFocused, setSearchQuery]);

  const debouncedQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);

  // Trigger search when debounced query changes
  React.useEffect(() => {
    search(debouncedQuery);
  }, [debouncedQuery, search]);

  const handleResultPress = useCallback(
    async (result: PlaceSearchResult) => {
      setIsLoadingDetails(true);
      const details = await getPlaceDetails(result.id);
      setIsLoadingDetails(false);
      if (details) {
        setPlaceToSave(details);
        setShowConfirmation(true);
      }
    },
    [getPlaceDetails],
  );

  const handleSave = useCallback(
    async (note: string, dateVisited: string | null) => {
      if (!placeToSave || !currentUserId) return;
      try {
        await savePlace(placeToSave, note, currentUserId, dateVisited);
        setShowConfirmation(false);
        setPlaceToSave(null);
        // Wait for modal dismiss animation to finish before switching tabs
        setTimeout(() => navigation.navigate('List'), 500);
      } catch (error: any) {
        setShowConfirmation(false);
        if (error instanceof SpotError && error.code === 'DUPLICATE_PLACE') {
          Alert.alert('Already saved', 'This spot is already in your list.');
        } else {
          console.error('[Save] Error:', error);
          Alert.alert('Save failed', error?.message ?? 'Something went wrong.');
        }
      }
    },
    [placeToSave, currentUserId, savePlace, navigation],
  );

  const handleClear = useCallback(() => {
    setSearchQuery('');
  }, [setSearchQuery]);

  const renderItem = useCallback(
    ({ item }: { item: PlaceSearchResult }) => (
      <TouchableOpacity
        onPress={() => handleResultPress(item)}
        activeOpacity={0.6}
        style={styles.resultItem}
      >
        <Text style={[styles.resultName, { color: colors.spotTextPrimary }]}>
          {item.name}
        </Text>
        <Text style={[styles.resultAddress, { color: colors.spotTextSecondary }]}>
          {item.address}
        </Text>
      </TouchableOpacity>
    ),
    [handleResultPress, colors],
  );

  const showLoading = isSearching || isLoadingDetails;
  const showNoResults = !isSearching && searchQuery.trim().length > 0 && searchResults.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.spotBackground }]} onTouchStart={Keyboard.dismiss}>
      {/* Search bar */}
      <View style={[styles.searchBar, { backgroundColor: colors.spotSearchBar }]}>
        <Ionicons name="search" size={18} color={colors.spotTextSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.spotTextPrimary }]}
          placeholder="Search restaurants, cafes, bars..."
          placeholderTextColor={colors.spotTextSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={handleClear}>
            <Ionicons name="close-circle" size={18} color={colors.spotTextSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Results */}
      {showLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.spotEmerald} />
        </View>
      ) : showNoResults ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: colors.spotTextSecondary }]}>
            No results found
          </Text>
        </View>
      ) : searchQuery.trim().length === 0 ? (
        <View style={styles.centered} />
      ) : (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* Save confirmation modal */}
      <SaveConfirmationModal
        visible={showConfirmation}
        placeDTO={placeToSave}
        onSave={handleSave}
        onCancel={() => {
          setShowConfirmation(false);
          setPlaceToSave(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    ...SpotTypography.body,
    padding: 0,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    ...SpotTypography.body,
  },
  resultItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  resultName: {
    ...SpotTypography.headline,
  },
  resultAddress: {
    ...SpotTypography.footnote,
  },
});
