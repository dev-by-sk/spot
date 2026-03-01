import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Keyboard,
  StyleSheet,
  InteractionManager,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useNavigation, useIsFocused } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { usePlaces } from "../../hooks/usePlaces";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../context/ToastContext";
import { useDebounce } from "../../hooks/useDebounce";
import { useShare } from "../../context/ShareContext";
import { useSpotColors } from "../../theme/colors";
import { SpotTypography } from "../../theme/typography";
import { SEARCH_DEBOUNCE_MS } from "../../config/constants";
import { SaveConfirmationModal } from "./SaveConfirmationModal";
import type { PlaceCacheDTO, PlaceSearchResult } from "../../types";
import { SpotError } from "../../types";

export function SearchScreen() {
  const {
    isOnline,
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    search,
    getPlaceDetails,
    savePlace,
  } = usePlaces();
  const { currentUserId } = useAuth();
  const {
    pendingPlace,
    isExtracting,
    extractionError,
    clearShare,
    testExtract,
  } = useShare();
  const { showToast } = useToast();
  const colors = useSpotColors();
  const navigation = useNavigation<any>();

  const searchInputRef = useRef<TextInput>(null);
  const searchDispatchedFor = useRef("");

  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [placeToSave, setPlaceToSave] = useState<PlaceCacheDTO | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const isFocused = useIsFocused();

  // Handle incoming share intent
  React.useEffect(() => {
    if (pendingPlace) {
      setPlaceToSave(pendingPlace);
      setShowConfirmation(true);
    }
  }, [pendingPlace]);

  React.useEffect(() => {
    if (extractionError) {
      if (!isOnline) {
        Alert.alert(
          "Could not extract spot",
          "You're offline. Try again when you're connected to the internet.",
          [{ text: "OK", onPress: () => clearShare() }],
        );
      } else {
        Alert.alert("Could not extract spot", extractionError, [
          { text: "Search manually", onPress: () => clearShare() },
        ]);
      }
    }
  }, [extractionError, clearShare, isOnline]);

  React.useEffect(() => {
    if (!isFocused) {
      setSearchQuery("");
    }
  }, [isFocused, setSearchQuery]);

  const debouncedQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);

  // Trigger search when debounced query changes
  React.useEffect(() => {
    searchDispatchedFor.current = debouncedQuery;
    search(debouncedQuery);
  }, [debouncedQuery, search]);

  const handleResultPress = useCallback(
    async (result: PlaceSearchResult) => {
      if (loadingItemId) return;
      setLoadingItemId(result.id);
      const details = await getPlaceDetails(result.id);
      setLoadingItemId(null);
      if (details) {
        setPlaceToSave(details);
        setShowConfirmation(true);
      }
    },
    [loadingItemId, getPlaceDetails],
  );

  const handleSave = useCallback(
    async (note: string, dateVisited: string | null) => {
      if (!placeToSave || !currentUserId) return;
      setIsSaving(true);
      try {
        await savePlace(placeToSave, note, currentUserId, dateVisited);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowConfirmation(false);
        setPlaceToSave(null);
        setIsSaving(false);
        clearShare();
        navigation.navigate("List");
      } catch (error: any) {
        setIsSaving(false);
        setShowConfirmation(false);
        if (error instanceof SpotError && error.code === "DUPLICATE_PLACE") {
          Alert.alert("Already saved", "This spot is already in your list.");
        } else {
          console.error("[Save] Error:", error);
          Alert.alert("Save failed", error?.message ?? "Something went wrong.");
        }
      }
    },
    [placeToSave, currentUserId, savePlace, navigation],
  );

  const handleClear = useCallback(() => {
    setSearchQuery("");
  }, [setSearchQuery]);

  const renderItem = useCallback(
    ({ item }: { item: PlaceSearchResult }) => {
      const isThisLoading = loadingItemId === item.id;
      return (
        <TouchableOpacity
          onPress={() => handleResultPress(item)}
          activeOpacity={isThisLoading ? 1 : 0.6}
          disabled={loadingItemId !== null}
          style={[styles.resultItem, isThisLoading && styles.resultItemLoading]}
        >
          <Text style={[styles.resultName, { color: colors.spotTextPrimary }]}>
            {item.name}
          </Text>
          <Text
            style={[styles.resultAddress, { color: colors.spotTextSecondary }]}
          >
            {item.address}
          </Text>
          {isThisLoading && (
            <ActivityIndicator
              size="small"
              color={colors.spotEmerald}
              style={styles.resultSpinner}
            />
          )}
        </TouchableOpacity>
      );
    },
    [loadingItemId, handleResultPress, colors],
  );

  const pendingDispatch =
    debouncedQuery.trim().length > 0 &&
    debouncedQuery !== searchDispatchedFor.current;
  const showLoading = isSearching || pendingDispatch;
  const showNoResults =
    !showLoading &&
    debouncedQuery.trim().length > 0 &&
    searchResults.length === 0 &&
    isOnline;

  return (
    <View
      style={[styles.container, { backgroundColor: colors.spotBackground }]}
    >
      {/* Search bar */}
      <Pressable
        style={[
          styles.searchBar,
          {
            backgroundColor: colors.spotSearchBar,
            opacity: isOnline ? 1 : 0.45,
          },
        ]}
        onPress={() => {
          if (!isOnline) {
            showToast({
              text: "Search requires an internet connection.",
              type: "error",
            });
            return;
          }
          searchInputRef.current?.focus();
        }}
      >
        <Ionicons name="search" size={18} color={colors.spotTextSecondary} />
        <TextInput
          ref={searchInputRef}
          style={[styles.searchInput, { color: colors.spotTextPrimary }]}
          placeholder="Search restaurants, cafes, bars..."
          placeholderTextColor={colors.spotTextSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
          autoCapitalize="none"
          editable={isOnline}
          pointerEvents={isOnline ? "auto" : "none"}
        />
        {searchQuery.length > 0 && isOnline && (
          <TouchableOpacity onPress={handleClear}>
            <Ionicons
              name="close-circle"
              size={18}
              color={colors.spotTextSecondary}
            />
          </TouchableOpacity>
        )}
      </Pressable>

      {/* DEV: Test share extraction */}
      {__DEV__ && (
        <View style={styles.testExtractRow}>
          <TouchableOpacity
            style={[
              styles.testExtractButton,
              { backgroundColor: colors.spotEmerald },
            ]}
            onPress={async () => {
              const text = await Clipboard.getStringAsync();
              const url = text?.trim();
              if (!url) {
                Alert.alert("Clipboard empty", "Copy a URL first.");
                return;
              }
              Keyboard.dismiss();
              testExtract(url);
            }}
          >
            <Ionicons
              name="clipboard-outline"
              size={16}
              color="#fff"
              style={{ marginRight: 6 }}
            />
            <Text style={styles.testExtractButtonText}>Paste & Extract</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Results */}
      {!isOnline ? (
        <Pressable style={styles.centered} onPress={Keyboard.dismiss}>
          <Text style={[styles.emptyText, { color: colors.spotTextSecondary }]}>
            Search unavailable offline
          </Text>
        </Pressable>
      ) : showLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.spotEmerald} />
        </View>
      ) : showNoResults ? (
        <Pressable style={styles.centered} onPress={Keyboard.dismiss}>
          <Text style={[styles.emptyText, { color: colors.spotTextSecondary }]}>
            No results found
          </Text>
        </Pressable>
      ) : searchQuery.trim().length === 0 ? (
        <Pressable style={styles.centered} onPress={Keyboard.dismiss} />
      ) : (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}

      {/* Share extraction loading overlay */}
      {isExtracting && (
        <View style={styles.extractionOverlay}>
          <View
            style={[
              styles.extractionBox,
              { backgroundColor: colors.spotBackground },
            ]}
          >
            <ActivityIndicator size="large" color={colors.spotEmerald} />
            <Text
              style={[styles.extractionText, { color: colors.spotTextPrimary }]}
            >
              Extracting place...
            </Text>
          </View>
        </View>
      )}

      {/* Save confirmation modal */}
      <SaveConfirmationModal
        visible={showConfirmation}
        placeDTO={placeToSave}
        onSave={handleSave}
        loading={isSaving}
        onCancel={() => {
          setShowConfirmation(false);
          setPlaceToSave(null);
          clearShare();
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
    flexDirection: "row",
    alignItems: "center",
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
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    ...SpotTypography.body,
  },
  resultItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  resultItemLoading: {
    opacity: 0.6,
  },
  resultName: {
    ...SpotTypography.headline,
  },
  resultAddress: {
    ...SpotTypography.footnote,
  },
  resultSpinner: {
    position: "absolute",
    right: 16,
    top: 0,
    bottom: 0,
  },
  extractionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  extractionBox: {
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    gap: 16,
  },
  extractionText: {
    ...SpotTypography.body,
  },
  testExtractRow: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  testExtractButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  testExtractButtonText: {
    color: "#fff",
    ...SpotTypography.footnote,
    fontWeight: "600" as const,
  },
});
