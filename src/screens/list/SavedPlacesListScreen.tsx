import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Alert,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { usePlaces } from '../../hooks/usePlaces';
import { useAuth } from '../../hooks/useAuth';
import { PlaceCard } from '../../components/PlaceCard';
import { FilterBar } from '../../components/FilterBar';
import { FilterSheet } from '../../components/FilterSheet';
import { EditNoteModal } from './EditNoteModal';
import { useSpotColors, spotEmerald } from '../../theme/colors';
import { SpotTypography } from '../../theme/typography';
import type { SavedPlaceLocal } from '../../types';

export function SavedPlacesListScreen() {
  const {
    savedPlaces,
    isLoadingPlaces,
    refreshPlaces,
    deletePlaceById,
    updateNote,
    selectedFilter,
    setSelectedFilter,
    syncPlaces,
    isSyncing,
  } = usePlaces();
  const { currentUserId } = useAuth();
  const colors = useSpotColors();

  const [editingPlace, setEditingPlace] = useState<SavedPlaceLocal | null>(null);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [selectedDistance, setSelectedDistance] = useState<number | null>(null);
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (currentUserId) {
      refreshPlaces(currentUserId);
    }
  }, [currentUserId, refreshPlaces]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      }
    })();
  }, []);

  const availableCuisines = useMemo(() => {
    const cuisines = savedPlaces.map((p) => p.cuisine).filter((c): c is string => !!c && c.length > 0);
    return [...new Set(cuisines)].sort();
  }, [savedPlaces]);

  const filteredPlaces = useMemo(() => {
    let result = savedPlaces;

    // Category filter
    if (selectedFilter) {
      result = result.filter((p) => p.category === selectedFilter);
    }

    // Price filter
    if (selectedPrice !== null) {
      result = result.filter((p) => p.price_level === selectedPrice);
    }

    // Distance filter
    if (selectedDistance !== null && userLocation) {
      result = result.filter((p) => {
        if (p.lat == null || p.lng == null) return true;
        const distMiles = getDistanceMiles(userLocation.lat, userLocation.lng, p.lat, p.lng);
        return distMiles <= selectedDistance;
      });
    }

    // Cuisine filter
    if (selectedCuisine) {
      result = result.filter((p) => p.cuisine === selectedCuisine);
    }

    return result;
  }, [savedPlaces, selectedFilter, selectedPrice, selectedDistance, selectedCuisine, userLocation]);

  const hasAdvancedFilters = selectedDistance !== null || selectedPrice !== null || selectedCuisine !== null;

  const handleRefresh = useCallback(async () => {
    if (!currentUserId) return;
    await syncPlaces(currentUserId);
  }, [currentUserId, syncPlaces]);

  const handleDelete = useCallback(
    (place: SavedPlaceLocal) => {
      Alert.alert('Delete spot', `Remove ${place.name ?? 'this spot'}?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deletePlaceById(place.id, place.name ?? ''),
        },
      ]);
    },
    [deletePlaceById],
  );

  const handleEditNote = useCallback((place: SavedPlaceLocal) => {
    setEditingPlace(place);
  }, []);

  const handleSaveNote = useCallback(
    async (note: string) => {
      if (!editingPlace) return;
      await updateNote(editingPlace.id, note, editingPlace.name ?? '');
      setEditingPlace(null);
    },
    [editingPlace, updateNote],
  );

  const renderRightActions = useCallback(
    (place: SavedPlaceLocal) => (
      <View style={styles.swipeActions}>
        <View style={[styles.swipeAction, { backgroundColor: colors.spotEmerald }]}>
          <Ionicons
            name="pencil"
            size={20}
            color="#FFFFFF"
            onPress={() => handleEditNote(place)}
          />
        </View>
        <View style={[styles.swipeAction, { backgroundColor: colors.spotDanger }]}>
          <Ionicons
            name="trash"
            size={20}
            color="#FFFFFF"
            onPress={() => handleDelete(place)}
          />
        </View>
      </View>
    ),
    [colors, handleEditNote, handleDelete],
  );

  const renderItem = useCallback(
    ({ item }: { item: SavedPlaceLocal }) => (
      <Swipeable renderRightActions={() => renderRightActions(item)}>
        <View style={styles.cardContainer}>
          <PlaceCard place={item} />
        </View>
      </Swipeable>
    ),
    [renderRightActions],
  );

  if (savedPlaces.length === 0 && !isLoadingPlaces) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.spotBackground }]}>
        <Text style={[styles.emptyTitle, { color: colors.spotTextPrimary }]}>
          No saved spots yet
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.spotTextSecondary }]}>
          Search & save your first spot
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.spotBackground }]}>
      {/* Header row with filter button and count badge */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => setShowFilterSheet(true)}>
          <Ionicons
            name={hasAdvancedFilters ? 'options' : 'options-outline'}
            size={22}
            color={hasAdvancedFilters ? spotEmerald : colors.spotTextSecondary}
          />
        </TouchableOpacity>
        <View style={[styles.countBadge, { backgroundColor: colors.spotEmerald }]}>
          <Text style={styles.countText}>{filteredPlaces.length}</Text>
        </View>
      </View>

      <FilterBar selectedFilter={selectedFilter} onFilterChange={setSelectedFilter} />

      <FlatList
        data={filteredPlaces}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isSyncing}
            onRefresh={handleRefresh}
            tintColor={colors.spotEmerald}
          />
        }
      />

      <EditNoteModal
        visible={editingPlace !== null}
        placeName={editingPlace?.name ?? ''}
        initialNote={editingPlace?.note_text ?? ''}
        onSave={handleSaveNote}
        onCancel={() => setEditingPlace(null)}
      />

      <FilterSheet
        visible={showFilterSheet}
        selectedDistance={selectedDistance}
        selectedPrice={selectedPrice}
        selectedCuisine={selectedCuisine}
        availableCuisines={availableCuisines}
        onDistanceChange={setSelectedDistance}
        onPriceChange={setSelectedPrice}
        onCuisineChange={setSelectedCuisine}
        onClearAll={() => {
          setSelectedDistance(null);
          setSelectedPrice(null);
          setSelectedCuisine(null);
        }}
        onDone={() => setShowFilterSheet(false)}
      />
    </View>
  );
}

function getDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  emptyTitle: {
    ...SpotTypography.title3,
  },
  emptySubtitle: {
    ...SpotTypography.body,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  countText: {
    ...SpotTypography.footnote,
    color: '#FFFFFF',
  },
  listContent: {
    paddingVertical: 8,
  },
  cardContainer: {
    marginHorizontal: 16,
    marginVertical: 6,
  },
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 64,
    height: '100%',
  },
});
