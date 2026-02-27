import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  StyleSheet as RN,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { Ionicons } from '@expo/vector-icons';
import { SpotButton } from '../../components/SpotButton';
import { useSpotColors } from '../../theme/colors';
import { SpotTypography } from '../../theme/typography';
import { analytics, AnalyticsEvent } from '../../services/analyticsService';
import { useTheme } from '../../context/ThemeContext';
import type { SpotColors } from '../../theme/colors';

// ── Mock data ────────────────────────────────────────────────────────────────

const CATEGORY_STYLES: Record<string, { icon: any; bg: string; color: string }> = {
  Restaurant: { icon: 'restaurant-outline', bg: 'rgba(251,146,60,0.14)', color: '#EA7C2A' },
  Cafe:       { icon: 'cafe-outline',        bg: 'rgba(161,95,55,0.14)',  color: '#A15F37' },
  Bar:        { icon: 'wine-outline',         bg: 'rgba(139,92,246,0.14)', color: '#7C3AED' },
  Dessert:    { icon: 'ice-cream-outline',    bg: 'rgba(236,72,153,0.14)', color: '#DB2777' },
};

// ── Shared mini components ───────────────────────────────────────────────────

function MockCard({
  name,
  category,
  cuisine,
  rating,
  address,
  note,
  colors,
}: {
  name: string;
  category: string;
  cuisine?: string;
  rating?: number;
  address?: string;
  note?: string;
  colors: SpotColors;
}) {
  const cat = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.Restaurant;
  return (
    <View style={[mockStyles.card, { backgroundColor: colors.spotBackground, borderLeftColor: colors.spotEmerald }]}>
      <View style={[mockStyles.iconBox, { backgroundColor: cat.bg }]}>
        <Ionicons name={cat.icon} size={15} color={cat.color} />
      </View>
      <View style={mockStyles.cardContent}>
        <Text style={[mockStyles.cardName, { color: colors.spotTextPrimary }]} numberOfLines={1}>
          {name}
        </Text>
        {cuisine ? (
          <Text style={[mockStyles.cardCuisine, { color: colors.spotTextSecondary }]} numberOfLines={1}>
            {cuisine}
          </Text>
        ) : null}
        <View style={mockStyles.metaRow}>
          {rating != null ? (
            <>
              <Ionicons name="star" size={10} color="#F59E0B" />
              <Text style={[mockStyles.metaText, { color: colors.spotTextSecondary }]}>{rating.toFixed(1)}</Text>
            </>
          ) : null}
          {address ? (
            <>
              {rating != null ? <Text style={[mockStyles.metaText, { color: colors.spotTextSecondary }]}> · </Text> : null}
              <Text style={[mockStyles.metaText, { color: colors.spotTextSecondary, flexShrink: 1 }]} numberOfLines={1}>
                {address}
              </Text>
            </>
          ) : null}
        </View>
        {note ? (
          <Text style={[mockStyles.cardNote, { color: colors.spotTextSecondary }]} numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ── Slide illustrations ──────────────────────────────────────────────────────

function SlideOne({ colors }: { colors: SpotColors }) {
  return (
    <View style={[mockStyles.frame, { backgroundColor: colors.spotCardBackground, borderColor: colors.spotDivider }]}>
      <MockCard name="Joe's Pizza" category="Restaurant" cuisine="Italian" rating={4.8} address="7 Carmine St" colors={colors} />
      <View style={[mockStyles.frameDivider, { backgroundColor: colors.spotDivider }]} />
      <MockCard name="Blue Bottle Coffee" category="Cafe" cuisine="Specialty Coffee" rating={4.5} address="450 Hayes St" colors={colors} />
      <View style={[mockStyles.frameDivider, { backgroundColor: colors.spotDivider }]} />
      <MockCard name="Employees Only" category="Bar" cuisine="Cocktails" rating={4.7} address="510 Hudson St" colors={colors} />
    </View>
  );
}

function SlideTwo({ colors }: { colors: SpotColors }) {
  return (
    <View style={[mockStyles.frame, { backgroundColor: colors.spotCardBackground, borderColor: colors.spotDivider }]}>
      {/* Mock search bar — uses spotDivider so it's visible in both light and dark */}
      <View style={[mockStyles.searchBar, { backgroundColor: colors.spotDivider }]}>
        <Ionicons name="search-outline" size={15} color={colors.spotTextSecondary} />
        <Text style={[mockStyles.searchText, { color: colors.spotTextSecondary }]}>ramen new york...</Text>
      </View>

      {/* Mock results */}
      {[
        { name: 'Tonchin New York', address: 'Midtown East, New York' },
        { name: 'Mu Ramen', address: 'Long Island City, New York' },
        { name: 'Ivan Ramen', address: 'Lower East Side, New York' },
      ].map((r, i) => (
        <View key={i}>
          {i > 0 ? <View style={[mockStyles.frameDivider, { backgroundColor: colors.spotDivider }]} /> : null}
          <View style={mockStyles.searchResult}>
            <View style={[mockStyles.resultIconBox, { backgroundColor: `${colors.spotEmerald}20` }]}>
              <Ionicons name="location-outline" size={13} color={colors.spotEmerald} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[mockStyles.resultName, { color: colors.spotTextPrimary }]} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={[mockStyles.resultAddress, { color: colors.spotTextSecondary }]} numberOfLines={1}>
                {r.address}
              </Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function SlideThree({ colors }: { colors: SpotColors }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={[mockStyles.frame, { backgroundColor: colors.spotCardBackground, borderColor: colors.spotDivider }]}>
        <MockCard
          name="Nobu"
          category="Restaurant"
          cuisine="Japanese"
          rating={4.9}
          address="105 Hudson St, New York"
          colors={colors}
        />
      </View>
      {/* Note preview */}
      <View style={[mockStyles.frame, { backgroundColor: colors.spotCardBackground, borderColor: colors.spotDivider }]}>
        <Text style={[mockStyles.noteLabelText, { color: colors.spotTextSecondary }]}>YOUR NOTE</Text>
        <Text style={[mockStyles.noteBodyText, { color: colors.spotTextPrimary }]}>
          "Amazing wagyu, book 2 weeks ahead. Ask for the patio."
        </Text>
      </View>
    </View>
  );
}

// ── Pages config ─────────────────────────────────────────────────────────────

const PAGES = [
  {
    title: 'Welcome to',
    subtitle: 'Never lose track of a restaurant, cafe, bar, or spot you want to try',
  },
  {
    title: 'Search any place',
    subtitle: 'Find restaurants, cafes, bars and more — powered by Google Places',
  },
  {
    title: 'Your personal list',
    subtitle: 'Save places with notes, filter by category, and never lose a spot',
  },
];

// ── Main screen ──────────────────────────────────────────────────────────────

interface OnboardingScreenProps {
  onComplete: () => void;
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const pagerRef = useRef<PagerView>(null);
  const colors = useSpotColors();
  const { resolvedScheme } = useTheme();

  const dotWidths = useRef(PAGES.map((_, i) => new Animated.Value(i === 0 ? 22 : 8))).current;

  useEffect(() => {
    PAGES.forEach((_, i) => {
      Animated.spring(dotWidths[i], {
        toValue: i === currentPage ? 22 : 8,
        useNativeDriver: false,
        bounciness: 4,
        speed: 20,
      }).start();
    });
  }, [currentPage]);

  const handleNext = () => {
    if (currentPage < PAGES.length - 1) {
      pagerRef.current?.setPage(currentPage + 1);
    } else {
      analytics.track(AnalyticsEvent.OnboardingCompleted);
      onComplete();
    }
  };

  const circleOpacityTop    = resolvedScheme === 'dark' ? 0.22 : 0.08;
  const circleOpacityBottom = resolvedScheme === 'dark' ? 0.15 : 0.05;

  return (
    <View style={[styles.container, { backgroundColor: colors.spotBackground }]}>

      {/* Background decoration */}
      <View pointerEvents="none" style={[styles.bgCircleTop,    { backgroundColor: colors.spotEmerald, opacity: circleOpacityTop }]} />
      <View pointerEvents="none" style={[styles.bgCircleBottom, { backgroundColor: colors.spotEmerald, opacity: circleOpacityBottom }]} />

      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageScroll={(e) => {
          const { position, offset } = e.nativeEvent;
          const snapped = offset >= 0.5 ? position + 1 : position;
          if (snapped !== currentPage) setCurrentPage(snapped);
        }}
        onPageSelected={(e) => setCurrentPage(e.nativeEvent.position)}
      >
        {PAGES.map((page, index) => (
          <View key={index} style={styles.page}>

            {/* Text */}
            <View style={styles.textSection}>
              {index === 0 ? (
                <Text style={[styles.title, { color: colors.spotTextPrimary }]}>
                  Welcome to{'\n'}<Text style={{ color: colors.spotEmerald }}>spot.</Text>
                </Text>
              ) : (
                <Text style={[styles.title, { color: colors.spotTextPrimary }]}>
                  {page.title}
                </Text>
              )}
              <Text style={[styles.subtitle, { color: colors.spotTextSecondary }]}>
                {page.subtitle}
              </Text>
            </View>

            {/* Illustration */}
            <View style={styles.illustrationSection}>
              {index === 0 && <SlideOne colors={colors} />}
              {index === 1 && <SlideTwo colors={colors} />}
              {index === 2 && <SlideThree colors={colors} />}
            </View>

          </View>
        ))}
      </PagerView>

      <View style={styles.footer}>
        <View style={styles.dotsContainer} accessibilityLabel={`Page ${currentPage + 1} of ${PAGES.length}`}>
          {PAGES.map((_, index) => (
            <Animated.View
              key={index}
              style={[styles.dot, {
                width: dotWidths[index],
                backgroundColor: index === currentPage ? colors.spotEmerald : colors.spotDivider,
              }]}
            />
          ))}
        </View>
        <View style={styles.buttonContainer}>
          <SpotButton
            title={currentPage < PAGES.length - 1 ? 'Next' : 'Get started'}
            onPress={handleNext}
          />
        </View>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  bgCircleTop: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    top: -100,
    right: -80,
  },
  bgCircleBottom: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    bottom: -60,
    left: -60,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    gap: 36,
  },
  textSection: {
    gap: 10,
  },
  title: {
    ...SpotTypography.largeTitle,
  },
  subtitle: {
    ...SpotTypography.body,
    lineHeight: 24,
    opacity: 0.85,
  },
  illustrationSection: {
    // natural height — no flex stretch
  },
  footer: {
    paddingBottom: 52,
    gap: 24,
    alignItems: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  buttonContainer: {
    paddingHorizontal: 24,
    width: '100%',
  },
});

const mockStyles = StyleSheet.create({
  frame: {
    borderRadius: 16,
    borderWidth: RN.hairlineWidth,
    padding: 12,
    gap: 0,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  frameDivider: {
    height: RN.hairlineWidth,
    marginVertical: 2,
    marginLeft: 44,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    borderLeftWidth: 2.5,
    borderRadius: 8,
    paddingLeft: 8,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  cardContent: {
    flex: 1,
    gap: 2,
  },
  cardName: {
    ...SpotTypography.subheadline,
    fontWeight: '600',
  },
  cardCuisine: {
    fontSize: 12,
    fontFamily: SpotTypography.caption.fontFamily,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: 11,
    fontFamily: SpotTypography.caption.fontFamily,
  },
  cardNote: {
    fontSize: 11,
    fontStyle: 'italic',
    fontFamily: SpotTypography.caption.fontFamily,
    marginTop: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 8,
  },
  searchText: {
    ...SpotTypography.subheadline,
    opacity: 0.6,
  },
  searchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  resultIconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  resultName: {
    ...SpotTypography.subheadline,
    fontWeight: '600',
    fontSize: 13,
  },
  resultAddress: {
    fontSize: 11,
    fontFamily: SpotTypography.caption.fontFamily,
    marginTop: 1,
  },
  noteLabelText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
    fontFamily: SpotTypography.caption.fontFamily,
    marginBottom: 4,
  },
  noteBodyText: {
    ...SpotTypography.subheadline,
    lineHeight: 20,
    fontStyle: 'italic',
  },
});
