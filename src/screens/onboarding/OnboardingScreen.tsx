import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, useWindowDimensions } from 'react-native';
import PagerView from 'react-native-pager-view';
import { SpotButton } from '../../components/SpotButton';
import { useSpotColors } from '../../theme/colors';
import { SpotTypography } from '../../theme/typography';
import { analytics, AnalyticsEvent } from '../../services/analyticsService';

const PAGES = [
  {
    title: 'Welcome',
    subtitle: 'Never lose track of a restaurant, cafe, bar, or dessert spot you want to try',
  },
  {
    title: 'Search any place',
    subtitle: 'Find restaurants, cafes, bars and more',
  },
  {
    title: 'Your personal list',
    subtitle: 'Save places with notes, filter by category, and never lose a spot',
  },
];

interface OnboardingScreenProps {
  onComplete: () => void;
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const pagerRef = useRef<PagerView>(null);
  const colors = useSpotColors();

  const handleNext = () => {
    if (currentPage < PAGES.length - 1) {
      pagerRef.current?.setPage(currentPage + 1);
    } else {
      analytics.track(AnalyticsEvent.OnboardingCompleted);
      onComplete();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.spotBackground }]}>
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={(e) => setCurrentPage(e.nativeEvent.position)}
      >
        {PAGES.map((page, index) => (
          <View key={index} style={styles.page}>
            <View style={styles.pageContent}>
              <Text style={[styles.title, { color: colors.spotTextPrimary }]}>
                {page.title}
              </Text>
              <Text style={[styles.subtitle, { color: colors.spotTextSecondary }]}>
                {page.subtitle}
              </Text>
            </View>
          </View>
        ))}
      </PagerView>

      <View style={styles.footer}>
        {/* Page dots */}
        <View
          style={styles.dotsContainer}
          accessibilityLabel={`Page ${currentPage + 1} of ${PAGES.length}`}
        >
          {PAGES.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    index === currentPage ? colors.spotEmerald : colors.spotDivider,
                },
              ]}
            />
          ))}
        </View>

        {/* Button */}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageContent: {
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  title: {
    ...SpotTypography.largeTitle,
    textAlign: 'center',
  },
  subtitle: {
    ...SpotTypography.body,
    textAlign: 'center',
  },
  footer: {
    paddingBottom: 48,
    gap: 24,
    alignItems: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  buttonContainer: {
    paddingHorizontal: 24,
    width: '100%',
  },
});
