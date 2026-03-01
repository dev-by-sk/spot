import React, { useCallback, useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSpotColors } from "../../theme/colors";
import { SpotTypography } from "../../theme/typography";
import { relativeDate } from "../../utils/relativeDate";
import { usePlaces } from "../../hooks/usePlaces";
import type { ListStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<ListStackParamList, "PlaceDetail">;

export function SpotDetailScreen({ route, navigation }: Props) {
  const { place } = route.params;
  const colors = useSpotColors();
  const insets = useSafeAreaInsets();
  const { updateNote } = usePlaces();

  const scrollRef = useRef<ScrollView>(null);
  const noteCardYRef = useRef(0);

  const [noteText, setNoteText] = useState(place.note_text ?? '');
  const savedNoteRef = useRef(place.note_text ?? '');
  const noteTextRef = useRef(noteText);

  const handleNoteChange = useCallback((text: string) => {
    setNoteText(text);
    noteTextRef.current = text;
  }, []);

  const handleNoteBlur = useCallback(async () => {
    const trimmed = noteTextRef.current.trim();
    if (trimmed === savedNoteRef.current) return;
    savedNoteRef.current = trimmed;
    await updateNote(place.id, trimmed, place.name ?? '', place.date_visited);
  }, [updateNote, place.id, place.name, place.date_visited]);

  // Save on unmount — covers back navigation before onBlur fires
  useEffect(() => {
    return () => {
      const trimmed = noteTextRef.current.trim();
      if (trimmed !== savedNoteRef.current) {
        updateNote(place.id, trimmed, place.name ?? '', place.date_visited);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const priceLabel = place.price_level ? "$".repeat(place.price_level) : null;
  const todayName = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
  ][new Date().getDay()];
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const hasRating = place.rating != null && place.rating > 0;
  const hasInfoData =
    hasRating ||
    !!priceLabel ||
    !!place.address ||
    !!place.phone_number ||
    !!place.website;
  // Whether there's at least one row above the "action" rows (phone/website)
  const hasUpperRow = hasRating || !!priceLabel || !!place.address;

  const openInMaps = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { lat, lng, name, address } = place;
    let url: string;

    if (lat != null && lng != null) {
      const label = encodeURIComponent(name ?? address ?? "Place");
      url =
        Platform.OS === "ios"
          ? `maps://?q=${label}&ll=${lat},${lng}`
          : `geo:${lat},${lng}?q=${lat},${lng}(${label})`;
    } else if (address) {
      const query = encodeURIComponent(address);
      url = Platform.OS === "ios" ? `maps://?q=${query}` : `geo:0,0?q=${query}`;
    } else {
      return;
    }

    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      Linking.openURL(url);
    } else {
      const query =
        lat != null && lng != null
          ? `${lat},${lng}`
          : encodeURIComponent(address ?? "");
      Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${query}`,
      );
    }
  }, [place]);

  const openWebsite = useCallback(() => {
    if (!place.website) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(place.website);
  }, [place.website]);

  const callPhone = useCallback(() => {
    if (!place.phone_number) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(`tel:${place.phone_number}`);
  }, [place.phone_number]);

  return (
    <View
      style={[styles.container, { backgroundColor: colors.spotBackground }]}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={28} color={colors.spotEmerald} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 32 },
        ]}
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
      >
        {/* Name */}
        <Text style={[styles.name, { color: colors.spotTextPrimary }]}>
          {place.name ?? "Unknown"}
        </Text>

        {/* Category + cuisine */}
        <View style={styles.tagRow}>
          {place.category ? (
            <View
              style={[
                styles.badge,
                { backgroundColor: `${colors.spotEmerald}1A` },
              ]}
            >
              <Text style={[styles.badgeText, { color: colors.spotEmerald }]}>
                {place.category}
              </Text>
            </View>
          ) : null}
          {place.cuisine ? (
            <Text style={[styles.cuisine, { color: colors.spotTextSecondary }]}>
              {place.cuisine}
            </Text>
          ) : null}
        </View>

        {/* Info card */}
        {hasInfoData ? (
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.spotCardBackground,
              borderColor: colors.spotDivider,
            },
          ]}
        >
          {place.rating != null && place.rating > 0 ? (
            <>
              <View style={styles.cardRow}>
                <View
                  style={[
                    styles.iconWrap,
                    { backgroundColor: `${colors.spotEmerald}15` },
                  ]}
                >
                  <Ionicons name="star" size={15} color="#F59E0B" />
                </View>
                <Text
                  style={[
                    styles.cardRowLabel,
                    { color: colors.spotTextSecondary },
                  ]}
                >
                  Rating
                </Text>
                <Text
                  style={[
                    styles.cardRowValue,
                    { color: colors.spotTextPrimary },
                  ]}
                >
                  {place.rating.toFixed(1)}
                </Text>
              </View>
              {priceLabel ? (
                <View
                  style={[
                    styles.cardDivider,
                    { backgroundColor: colors.spotDivider },
                  ]}
                />
              ) : null}
            </>
          ) : null}

          {priceLabel ? (
            <View style={styles.cardRow}>
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: `${colors.spotEmerald}15` },
                ]}
              >
                <Ionicons
                  name="cash-outline"
                  size={15}
                  color={colors.spotEmerald}
                />
              </View>
              <Text
                style={[
                  styles.cardRowLabel,
                  { color: colors.spotTextSecondary },
                ]}
              >
                Price
              </Text>
              <Text
                style={[
                  styles.cardRowValue,
                  { color: colors.spotTextPrimary },
                ]}
              >
                {priceLabel}
              </Text>
            </View>
          ) : null}

          {place.address ? (
            <>
              {(place.rating != null && place.rating > 0) || priceLabel ? (
                <View
                  style={[
                    styles.cardDivider,
                    { backgroundColor: colors.spotDivider },
                  ]}
                />
              ) : null}
              <TouchableOpacity
                style={styles.cardRow}
                onPress={openInMaps}
                activeOpacity={0.6}
              >
                <View
                  style={[
                    styles.iconWrap,
                    { backgroundColor: `${colors.spotEmerald}15` },
                  ]}
                >
                  <Ionicons
                    name="location-outline"
                    size={15}
                    color={colors.spotEmerald}
                  />
                </View>
                <Text
                  style={[
                    styles.cardRowValue,
                    { color: colors.spotEmerald, flex: 1 },
                  ]}
                  numberOfLines={2}
                >
                  {place.address}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={colors.spotEmerald}
                />
              </TouchableOpacity>
            </>
          ) : null}

          {place.phone_number ? (
            <>
              {hasUpperRow ? (
                <View
                  style={[
                    styles.cardDivider,
                    { backgroundColor: colors.spotDivider },
                  ]}
                />
              ) : null}
              <TouchableOpacity
                style={styles.cardRow}
                onPress={callPhone}
                activeOpacity={0.6}
              >
                <View
                  style={[
                    styles.iconWrap,
                    { backgroundColor: `${colors.spotEmerald}15` },
                  ]}
                >
                  <Ionicons
                    name="call-outline"
                    size={15}
                    color={colors.spotEmerald}
                  />
                </View>
                <Text
                  style={[
                    styles.cardRowLabel,
                    { color: colors.spotTextSecondary },
                  ]}
                >
                  Phone
                </Text>
                <Text
                  style={[
                    styles.cardRowValue,
                    { color: colors.spotEmerald },
                  ]}
                  numberOfLines={1}
                >
                  {place.phone_number}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={colors.spotEmerald}
                />
              </TouchableOpacity>
            </>
          ) : null}

          {place.website ? (
            <>
              {(hasUpperRow || !!place.phone_number) ? (
                <View
                  style={[
                    styles.cardDivider,
                    { backgroundColor: colors.spotDivider },
                  ]}
                />
              ) : null}
              <TouchableOpacity
                style={styles.cardRow}
                onPress={openWebsite}
                activeOpacity={0.6}
              >
                <View
                  style={[
                    styles.iconWrap,
                    { backgroundColor: `${colors.spotEmerald}15` },
                  ]}
                >
                  <Ionicons
                    name="globe-outline"
                    size={15}
                    color={colors.spotEmerald}
                  />
                </View>
                <Text
                  style={[
                    styles.cardRowLabel,
                    { color: colors.spotTextSecondary },
                  ]}
                >
                  Website
                </Text>
                <Text
                  style={[
                    styles.cardRowValue,
                    { color: colors.spotEmerald },
                  ]}
                  numberOfLines={1}
                >
                  {(() => {
                    try {
                      return new URL(place.website).hostname;
                    } catch {
                      return place.website;
                    }
                  })()}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={colors.spotEmerald}
                />
              </TouchableOpacity>
            </>
          ) : null}

        </View>
        ) : null}

        {/* Hours card */}
        {place.opening_hours ? (
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.spotCardBackground,
                borderColor: colors.spotDivider,
              },
            ]}
          >
            <View style={styles.cardRow}>
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: `${colors.spotEmerald}15` },
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={15}
                  color={colors.spotEmerald}
                />
              </View>
              <View style={{ flex: 1 }}>
                {place.opening_hours.split("\n").map((line, i) => {
                  const [day, ...rest] = line.split(": ");
                  const hours = rest.join(": ");
                  const isToday = day === todayName;
                  if (!hoursExpanded && !isToday) return null;
                  return (
                    <View key={i} style={styles.hoursRow}>
                      <Text
                        style={[
                          styles.hoursDay,
                          {
                            color: isToday && hoursExpanded
                              ? colors.spotEmerald
                              : colors.spotTextSecondary,
                            fontWeight: isToday ? "600" : "400",
                          },
                        ]}
                      >
                        {day}
                      </Text>
                      <Text
                        style={[
                          styles.hoursTime,
                          {
                            color: isToday && hoursExpanded
                              ? colors.spotEmerald
                              : colors.spotTextPrimary,
                            fontWeight: isToday ? "600" : "400",
                          },
                        ]}
                      >
                        {hours}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
            <View
              style={[styles.cardDivider, { backgroundColor: colors.spotDivider }]}
            />
            <TouchableOpacity
              style={styles.hoursToggle}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setHoursExpanded((prev) => !prev);
              }}
              activeOpacity={0.6}
            >
              <Text style={[styles.hoursToggleText, { color: colors.spotEmerald }]}>
                {hoursExpanded ? "Show less" : "See all hours"}
              </Text>
              <Ionicons
                name={hoursExpanded ? "chevron-up" : "chevron-down"}
                size={14}
                color={colors.spotEmerald}
              />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Note card */}
        <Text
          style={[styles.sectionLabel, { color: colors.spotTextSecondary }]}
        >
          YOUR NOTE
        </Text>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.spotCardBackground,
              borderColor: colors.spotDivider,
            },
          ]}
          onLayout={(e) => { noteCardYRef.current = e.nativeEvent.layout.y; }}
        >
          <TextInput
            style={[styles.noteText, { color: colors.spotTextPrimary }]}
            value={noteText}
            onChangeText={handleNoteChange}
            onBlur={handleNoteBlur}
            onFocus={() => {
              scrollRef.current?.scrollTo({ y: noteCardYRef.current, animated: true });
            }}
            placeholder="Add a note..."
            placeholderTextColor={colors.spotTextSecondary}
            multiline
            scrollEnabled={false}
          />
        </View>

        {/* Footer meta */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.spotCardBackground,
              borderColor: colors.spotDivider,
            },
          ]}
        >
          {place.date_visited ? (
            <>
              <View style={styles.cardRow}>
                <View
                  style={[
                    styles.iconWrap,
                    { backgroundColor: `${colors.spotEmerald}15` },
                  ]}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={15}
                    color={colors.spotEmerald}
                  />
                </View>
                <Text
                  style={[
                    styles.cardRowLabel,
                    { color: colors.spotTextSecondary },
                  ]}
                >
                  Visited
                </Text>
                <Text
                  style={[
                    styles.cardRowValue,
                    { color: colors.spotTextPrimary },
                  ]}
                >
                  {relativeDate(place.date_visited)}
                </Text>
              </View>
              <View
                style={[
                  styles.cardDivider,
                  { backgroundColor: colors.spotDivider },
                ]}
              />
            </>
          ) : null}
          <View style={styles.cardRow}>
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: `${colors.spotEmerald}15` },
              ]}
            >
              <Ionicons
                name="bookmark-outline"
                size={15}
                color={colors.spotEmerald}
              />
            </View>
            <Text
              style={[styles.cardRowLabel, { color: colors.spotTextSecondary }]}
            >
              Saved
            </Text>
            <Text
              style={[styles.cardRowValue, { color: colors.spotTextPrimary }]}
            >
              {relativeDate(place.saved_at)}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backButton: {
    padding: 4,
  },
  content: {
    paddingHorizontal: 16,
    gap: 12,
  },
  name: {
    ...SpotTypography.largeTitle,
    marginTop: 4,
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: {
    ...SpotTypography.caption,
    fontWeight: "600",
  },
  cuisine: {
    ...SpotTypography.subheadline,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    overflow: "hidden",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 52,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  cardRowLabel: {
    ...SpotTypography.subheadline,
    flex: 1,
  },
  cardRowValue: {
    ...SpotTypography.subheadline,
    textAlign: "right",
    flexShrink: 1,
  },
  sectionLabel: {
    ...SpotTypography.caption,
    fontWeight: "600",
    letterSpacing: 0.6,
    marginTop: 4,
    marginLeft: 4,
  },
  noteText: {
    ...SpotTypography.body,
    lineHeight: 24,
    padding: 14,
    textAlignVertical: 'top',
  },
  hoursRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 1,
  },
  hoursDay: {
    ...SpotTypography.subheadline,
    lineHeight: 20,
    width: 90,
  },
  hoursTime: {
    ...SpotTypography.subheadline,
    lineHeight: 20,
    textAlign: "right",
    flex: 1,
  },
  hoursToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginLeft: 42,
  },
  hoursToggleText: {
    ...SpotTypography.subheadline,
    fontWeight: "500",
  },
});
