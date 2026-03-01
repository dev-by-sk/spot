import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  RefreshControl,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  LayoutAnimation,
  UIManager,
  Platform,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Swipeable } from "react-native-gesture-handler";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type {
  ListStackParamList,
  MainTabParamList,
} from "../../navigation/types";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { usePlaces } from "../../hooks/usePlaces";
import { useAuth } from "../../hooks/useAuth";
import { PlaceCard } from "../../components/PlaceCard";
import { FilterBar } from "../../components/FilterBar";
import { FilterSheet } from "../../components/FilterSheet";
import { EditNoteModal } from "./EditNoteModal";
import { useSpotColors, spotEmerald } from "../../theme/colors";
import { SpotTypography } from "../../theme/typography";
import type { SavedPlaceLocal } from "../../types";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function SavedPlacesListScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<ListStackParamList>>();
  const tabNavigation =
    useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const {
    savedPlaces,
    isLoadingPlaces,
    refreshPlaces,
    deletePlaceById,
    updateNote,
    selectedFilter,
    setSelectedFilter,
    syncPlaces,
  } = usePlaces();
  const { currentUserId } = useAuth();
  const colors = useSpotColors();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const openSwipeableRef = useRef<Swipeable | null>(null);
  const listSearchInputRef = useRef<TextInput>(null);

  const [editingPlace, setEditingPlace] = useState<SavedPlaceLocal | null>(
    null,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // Track which IDs are brand-new so we can animate them in
  const prevIdsRef = useRef<Set<string> | null>(null);
  const newIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(savedPlaces.map((p) => p.id));
    if (prevIdsRef.current !== null) {
      const added: string[] = [];
      for (const id of currentIds) {
        if (!prevIdsRef.current.has(id)) {
          newIdsRef.current.add(id);
          added.push(id);
        }
      }
      if (added.length > 0) {
        setTimeout(
          () => added.forEach((id) => newIdsRef.current.delete(id)),
          800,
        );
      }
    }
    prevIdsRef.current = currentIds;
  }, [savedPlaces]);

  const [selectedDistance, setSelectedDistance] = useState<number | null>(null);
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [listSearchQuery, setListSearchQuery] = useState("");

  useEffect(() => {
    if (currentUserId && isFocused) {
      refreshPlaces(currentUserId);
    }
    if (!isFocused) {
      openSwipeableRef.current?.close();
    }
  }, [currentUserId, isFocused, refreshPlaces]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({});
        setUserLocation({
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        });
      }
    })();
  }, []);

  const availableCuisines = useMemo(() => {
    const cuisines = savedPlaces
      .map((p) => p.cuisine)
      .filter((c): c is string => !!c && c.length > 0);
    return [...new Set(cuisines)].sort();
  }, [savedPlaces]);

  const filteredPlaces = useMemo(() => {
    let result = savedPlaces;

    // Text search across name, note, address, cuisine
    const q = listSearchQuery.trim().toLowerCase();
    if (q.length > 0) {
      result = result.filter(
        (p) =>
          (p.name ?? "").toLowerCase().includes(q) ||
          (p.note_text ?? "").toLowerCase().includes(q) ||
          (p.address ?? "").toLowerCase().includes(q) ||
          (p.cuisine ?? "").toLowerCase().includes(q),
      );
    }

    // Category filter
    if (selectedFilter) {
      result = result.filter((p) => p.category === selectedFilter);
    }

    // Distance filter
    if (selectedDistance !== null && userLocation) {
      result = result.filter((p) => {
        if (p.lat == null || p.lng == null) return true;
        const distKm = getDistanceKm(
          userLocation.lat,
          userLocation.lng,
          p.lat,
          p.lng,
        );
        return distKm <= selectedDistance;
      });
    }

    // Cuisine filter
    if (selectedCuisine) {
      result = result.filter((p) => p.cuisine === selectedCuisine);
    }

    return result;
  }, [
    savedPlaces,
    listSearchQuery,
    selectedFilter,
    selectedDistance,
    selectedCuisine,
    userLocation,
  ]);

  const hasAdvancedFilters =
    selectedDistance !== null || selectedCuisine !== null;

  const handleRefresh = useCallback(async () => {
    if (!currentUserId) return;
    setIsRefreshing(true);
    try {
      await syncPlaces(currentUserId);
    } catch {
      // Toast already shown by PlacesContext
    } finally {
      setIsRefreshing(false);
    }
  }, [currentUserId, syncPlaces]);

  const handleExitAnimationComplete = useCallback(
    (id: string, name: string) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      deletePlaceById(id, name);
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [deletePlaceById],
  );

  const handleDelete = useCallback((place: SavedPlaceLocal) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert("Delete spot", `Remove ${place.name ?? "this spot"}?`, [
      {
        text: "Cancel",
        style: "cancel",
        onPress: () => openSwipeableRef.current?.close(),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => setDeletingIds((prev) => new Set([...prev, place.id])),
      },
    ]);
  }, []);

  const handleEditNote = useCallback((place: SavedPlaceLocal) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingPlace(place);
  }, []);

  const handleSaveNote = useCallback(
    async (note: string, dateVisited?: string | null) => {
      if (!editingPlace) return;
      await updateNote(
        editingPlace.id,
        note,
        editingPlace.name ?? "",
        dateVisited,
      );
      setEditingPlace(null);
      openSwipeableRef.current?.close();
    },
    [editingPlace, updateNote],
  );

  const renderRightActions = useCallback(
    (
      place: SavedPlaceLocal,
      progress: Animated.AnimatedInterpolation<number>,
    ) => {
      const opacity = progress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 0, 1],
      });

      return (
        <Animated.View style={[styles.swipeActions, { opacity }]}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => handleEditNote(place)}
            style={[
              styles.swipeAction,
              { backgroundColor: colors.spotEmerald },
            ]}
          >
            <Ionicons name="pencil" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => handleDelete(place)}
            style={[styles.swipeAction, { backgroundColor: colors.spotDanger }]}
          >
            <Ionicons name="trash" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>
      );
    },
    [colors, handleEditNote, handleDelete],
  );

  const handleSwipeOpen = useCallback((ref: Swipeable) => {
    if (openSwipeableRef.current && openSwipeableRef.current !== ref) {
      openSwipeableRef.current.close();
    }
    openSwipeableRef.current = ref;
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: SavedPlaceLocal }) => {
      let swipeRef: Swipeable | null = null;
      let swiping = false;
      const isNew = newIdsRef.current.has(item.id);
      const shouldExit = deletingIds.has(item.id);
      return (
        <AnimatedListItem
          id={item.id}
          isNew={isNew}
          shouldExit={shouldExit}
          onExitAnimationComplete={() =>
            handleExitAnimationComplete(item.id, item.name ?? "")
          }
        >
          <Swipeable
            ref={(ref) => {
              swipeRef = ref;
            }}
            renderRightActions={(_progress) =>
              renderRightActions(item, _progress)
            }
            onSwipeableWillOpen={() => {
              swiping = true;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            onSwipeableOpen={() => swipeRef && handleSwipeOpen(swipeRef)}
            onSwipeableClose={() => {
              swiping = false;
            }}
            overshootRight={false}
          >
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                if (!swiping) {
                  navigation.navigate("PlaceDetail", { place: item });
                }
              }}
              style={styles.cardContainer}
            >
              <PlaceCard place={item} />
            </TouchableOpacity>
          </Swipeable>
        </AnimatedListItem>
      );
    },
    [
      deletingIds,
      handleExitAnimationComplete,
      renderRightActions,
      handleSwipeOpen,
      navigation,
    ],
  );

  if (isLoadingPlaces && savedPlaces.length === 0) {
    return (
      <View
        style={[
          styles.emptyContainer,
          { backgroundColor: colors.spotBackground, paddingTop: insets.top },
        ]}
      >
        <ActivityIndicator color={colors.spotEmerald} />
      </View>
    );
  }

  if (savedPlaces.length === 0) {
    return (
      <View
        style={[
          styles.emptyContainer,
          { backgroundColor: colors.spotBackground, paddingTop: insets.top },
        ]}
      >
        <View
          style={[
            styles.emptyIconWrap,
            { backgroundColor: `${colors.spotEmerald}18` },
          ]}
        >
          <Ionicons
            name="location-outline"
            size={44}
            color={colors.spotEmerald}
          />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.spotTextPrimary }]}>
          No spots saved yet
        </Text>
        <Text
          style={[styles.emptySubtitle, { color: colors.spotTextSecondary }]}
        >
          Search for a place or share a link from{"\n"}TikTok or Instagram to
          get started
        </Text>
        <TouchableOpacity
          style={[styles.emptyButton, { backgroundColor: colors.spotEmerald }]}
          onPress={() => tabNavigation.navigate("Search")}
          activeOpacity={0.8}
        >
          <Text style={styles.emptyButtonText}>Find a spot</Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.spotBackground, paddingTop: insets.top },
      ]}
    >
      {/* Header */}
      <Pressable style={styles.headerRow} onPress={() => Keyboard.dismiss()}>
        <Text style={[styles.screenTitle, { color: colors.spotTextPrimary }]}>
          My spots
        </Text>
        <Text
          style={[styles.screenTitleCount, { color: colors.spotTextSecondary }]}
        >
          {filteredPlaces.length}
        </Text>
      </Pressable>

      {/* Search bar */}
      <Pressable
        style={[
          styles.listSearchBar,
          { backgroundColor: colors.spotSearchBar },
        ]}
        onPress={() => listSearchInputRef.current?.focus()}
      >
        <Ionicons name="search" size={16} color={colors.spotTextSecondary} />
        <TextInput
          ref={listSearchInputRef}
          style={[styles.listSearchInput, { color: colors.spotTextPrimary }]}
          placeholder="Search your spots..."
          placeholderTextColor={colors.spotTextSecondary}
          value={listSearchQuery}
          onChangeText={(text) => {
            setListSearchQuery(text);
            openSwipeableRef.current?.close();
          }}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {listSearchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => setListSearchQuery("")}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="close-circle"
              size={16}
              color={colors.spotTextSecondary}
            />
          </TouchableOpacity>
        )}
      </Pressable>

      {/* Filter row */}
      <View style={styles.filterRow}>
        <FilterBar
          selectedFilter={selectedFilter}
          onFilterChange={setSelectedFilter}
        />
        <TouchableOpacity
          onPress={() => setShowFilterSheet(true)}
          style={styles.filterIconButton}
        >
          <Ionicons
            name={hasAdvancedFilters ? "options" : "options-outline"}
            size={22}
            color={hasAdvancedFilters ? spotEmerald : colors.spotTextSecondary}
          />
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredPlaces}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          { flexGrow: 1 },
          filteredPlaces.length > 0 && styles.listContent,
        ]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          listSearchQuery.trim().length > 0 ? (
            <View style={styles.searchEmptyContainer}>
              <Ionicons
                name="search-outline"
                size={36}
                color={colors.spotTextSecondary}
                style={{ opacity: 0.4 }}
              />
              <Text
                style={[
                  styles.searchEmptyTitle,
                  { color: colors.spotTextPrimary },
                ]}
              >
                No spots found
              </Text>
              <Text
                style={[
                  styles.searchEmptySubtitle,
                  { color: colors.spotTextSecondary },
                ]}
              >
                No results for "{listSearchQuery}"
              </Text>
            </View>
          ) : selectedFilter || hasAdvancedFilters ? (
            <View style={styles.searchEmptyContainer}>
              <Ionicons
                name="filter-outline"
                size={36}
                color={colors.spotTextSecondary}
                style={{ opacity: 0.4 }}
              />
              <Text
                style={[
                  styles.searchEmptyTitle,
                  { color: colors.spotTextPrimary },
                ]}
              >
                No spots matched
              </Text>
              <Text
                style={[
                  styles.searchEmptySubtitle,
                  { color: colors.spotTextSecondary },
                ]}
              >
                Try adjusting or clearing your filters
              </Text>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.spotEmerald}
          />
        }
      />

      <EditNoteModal
        visible={editingPlace !== null}
        placeName={editingPlace?.name ?? ""}
        initialNote={editingPlace?.note_text ?? ""}
        initialDateVisited={editingPlace?.date_visited ?? null}
        onSave={handleSaveNote}
        onCancel={() => {
          setEditingPlace(null);
          openSwipeableRef.current?.close();
        }}
      />

      <FilterSheet
        visible={showFilterSheet}
        selectedDistance={selectedDistance}
        selectedCuisine={selectedCuisine}
        availableCuisines={availableCuisines}
        onDistanceChange={setSelectedDistance}
        onCuisineChange={setSelectedCuisine}
        onClearAll={() => {
          setSelectedDistance(null);
          setSelectedCuisine(null);
        }}
        onDone={() => setShowFilterSheet(false)}
      />
    </View>
  );
}

interface AnimatedListItemProps {
  id: string;
  isNew: boolean;
  shouldExit: boolean;
  onExitAnimationComplete: () => void;
  children: React.ReactNode;
}

function AnimatedListItem({
  isNew,
  shouldExit,
  onExitAnimationComplete,
  children,
}: AnimatedListItemProps) {
  const opacity = useRef(new Animated.Value(isNew ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(isNew ? -14 : 0)).current;
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isNew) {
      Animated.parallel([
        Animated.spring(opacity, {
          toValue: 1,
          useNativeDriver: true,
          tension: 90,
          friction: 13,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 90,
          friction: 13,
        }),
      ]).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (shouldExit) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 240,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: 60,
          duration: 240,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) onExitAnimationComplete();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldExit]);

  return (
    <Animated.View
      style={{ opacity, transform: [{ translateY }, { translateX }] }}
    >
      {children}
    </Animated.View>
  );
}

function getDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // Earth's radius in km
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
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    gap: 16,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    ...SpotTypography.title2,
    textAlign: "center",
  },
  emptySubtitle: {
    ...SpotTypography.body,
    textAlign: "center",
    lineHeight: 24,
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 999,
  },
  emptyButtonText: {
    ...SpotTypography.headline,
    color: "#fff",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  screenTitle: {
    ...SpotTypography.largeTitle,
  },
  screenTitleCount: {
    ...SpotTypography.title2,
  },
  listSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    gap: 8,
  },
  listSearchInput: {
    flex: 1,
    ...SpotTypography.body,
    padding: 0,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 12,
  },
  searchEmptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  searchEmptyTitle: {
    ...SpotTypography.headline,
  },
  searchEmptySubtitle: {
    ...SpotTypography.body,
  },
  filterIconButton: {
    paddingHorizontal: 16,
  },
  listContent: {
    paddingVertical: 8,
  },
  cardContainer: {
    marginHorizontal: 16,
    marginVertical: 6,
  },
  swipeActions: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 6,
    marginRight: 16,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    overflow: "hidden",
  },
  swipeAction: {
    justifyContent: "center",
    alignItems: "center",
    width: 64,
    height: "100%",
  },
});
