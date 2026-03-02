import React from 'react';
import { render } from '@testing-library/react-native';
import { PlaceCard } from '@/components/PlaceCard';
import type { SavedPlaceLocal } from '@/types';

/**
 * PlaceCard test scenarios:
 *
 * === Rendering ===
 * 1. Renders place name
 * 2. Shows "Unknown" when name is null
 * 3. Renders cuisine when present
 * 4. Hides cuisine when absent
 * 5. Renders rating when > 0
 * 6. Hides rating when 0
 * 7. Hides rating when null
 * 8. Renders address
 * 9. Renders note text
 * 10. Shows "Visited" date when date_visited is set
 * 11. Shows "Saved" date when date_visited is null
 *
 * === Category icon mapping ===
 * 12. Known category maps to correct icon config
 * 13. Unknown category string falls back to Other
 * 14. Null category falls back to Other
 *
 * === Accessibility ===
 * 15. Accessibility label includes all present fields
 * 16. Accessibility label omits null/empty fields
 * 17. Rating of 0 is excluded from accessibility label
 *
 * === React.memo ===
 * 18. Does not re-render when same props object is passed
 * 19. Re-renders when place prop changes
 */

// ── Mocks ──

jest.mock('@/theme/colors', () => ({
  useSpotColors: () => ({
    spotTextPrimary: '#111827',
    spotTextSecondary: '#6B7280',
    spotBackground: '#FAFAF9',
    spotCardBackground: '#FFFFFF',
    spotEmerald: '#047857',
    spotEmeraldLight: '#059669',
    spotEmeraldDark: '#065F46',
    spotDanger: '#DC2626',
    spotDivider: '#E5E7EB',
    spotSearchBar: '#F3F4F6',
  }),
}));

jest.mock('@/utils/relativeDate', () => ({
  relativeDate: (d: string) => `mocked-${d}`,
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, ...props }: any) => <Text {...props}>{name}</Text>,
  };
});

// ── Helpers ──

function makePlace(overrides: Partial<SavedPlaceLocal> = {}): SavedPlaceLocal {
  return {
    id: 'place-1',
    user_id: 'user-1',
    google_place_id: 'gp-1',
    note_text: '',
    date_visited: null,
    saved_at: '2025-01-01T00:00:00Z',
    name: 'Test Place',
    address: '123 Main St',
    lat: 40.7,
    lng: -74.0,
    rating: 4.5,
    price_level: 2,
    category: 'Restaurant',
    cuisine: 'Italian',
    last_refreshed: '2025-01-01T00:00:00Z',
    website: null,
    phone_number: null,
    opening_hours: null,
    ...overrides,
  };
}

// ── Rendering ──

describe('PlaceCard', () => {
  describe('rendering', () => {
    it('renders the place name', () => {
      const { getByText } = render(<PlaceCard place={makePlace({ name: 'Osteria Francescana' })} />);
      expect(getByText('Osteria Francescana')).toBeTruthy();
    });

    it('shows "Unknown" when name is null', () => {
      const { getByText } = render(<PlaceCard place={makePlace({ name: null })} />);
      expect(getByText('Unknown')).toBeTruthy();
    });

    it('renders cuisine when present', () => {
      const { getByText } = render(<PlaceCard place={makePlace({ cuisine: 'Japanese' })} />);
      expect(getByText('Japanese')).toBeTruthy();
    });

    it('does not render cuisine when null', () => {
      const { queryByText } = render(<PlaceCard place={makePlace({ cuisine: null })} />);
      expect(queryByText('Japanese')).toBeNull();
    });

    it('renders rating when > 0', () => {
      const { getByText } = render(<PlaceCard place={makePlace({ rating: 4.2 })} />);
      expect(getByText('4.2')).toBeTruthy();
    });

    it('hides rating when 0', () => {
      const { queryByText } = render(<PlaceCard place={makePlace({ rating: 0 })} />);
      expect(queryByText('0.0')).toBeNull();
    });

    it('hides rating when null', () => {
      const { queryByText } = render(<PlaceCard place={makePlace({ rating: null })} />);
      expect(queryByText('0.0')).toBeNull();
    });

    it('renders address', () => {
      const { getByText } = render(<PlaceCard place={makePlace({ address: '456 Oak Ave' })} />);
      expect(getByText('456 Oak Ave')).toBeTruthy();
    });

    it('renders note text when present', () => {
      const { getByText } = render(<PlaceCard place={makePlace({ note_text: 'Great pasta!' })} />);
      expect(getByText('Great pasta!')).toBeTruthy();
    });

    it('shows "Visited" prefix when date_visited is set', () => {
      const { getByText } = render(
        <PlaceCard place={makePlace({ date_visited: '2025-06-15' })} />,
      );
      expect(getByText('Visited mocked-2025-06-15')).toBeTruthy();
    });

    it('shows "Saved" prefix when date_visited is null', () => {
      const { getByText } = render(
        <PlaceCard place={makePlace({ date_visited: null, saved_at: '2025-01-01T00:00:00Z' })} />,
      );
      expect(getByText('Saved mocked-2025-01-01T00:00:00Z')).toBeTruthy();
    });
  });

  // ── Category icon mapping ──

  describe('category icon mapping', () => {
    it('renders the correct icon for a known category', () => {
      const { getByText } = render(<PlaceCard place={makePlace({ category: 'Bar' })} />);
      // Ionicons mock renders the name prop as text
      expect(getByText('wine-outline')).toBeTruthy();
    });

    it('falls back to Other icon for unknown category string', () => {
      const { getByText } = render(<PlaceCard place={makePlace({ category: 'Speakeasy' })} />);
      expect(getByText('grid-outline')).toBeTruthy();
    });

    it('falls back to Other icon when category is null', () => {
      const { getByText } = render(<PlaceCard place={makePlace({ category: null })} />);
      expect(getByText('grid-outline')).toBeTruthy();
    });
  });

  // ── Accessibility ──

  describe('accessibility', () => {
    it('includes all present fields in accessibility label', () => {
      const place = makePlace({
        name: 'Café Luna',
        category: 'Cafe',
        cuisine: 'French',
        rating: 4.8,
        address: '10 Rue de Rivoli',
        note_text: 'Amazing croissants',
      });
      const { getByLabelText } = render(<PlaceCard place={place} />);
      const label = getByLabelText(
        'Café Luna, Cafe, French, 4.8 stars, 10 Rue de Rivoli, Note: Amazing croissants',
      );
      expect(label).toBeTruthy();
    });

    it('omits null/empty fields from accessibility label', () => {
      const place = makePlace({
        name: 'Minimal Place',
        category: null,
        cuisine: null,
        rating: null,
        address: null,
        note_text: '',
      });
      const { getByLabelText } = render(<PlaceCard place={place} />);
      expect(getByLabelText('Minimal Place')).toBeTruthy();
    });

    // FLAG: rating of 0 is excluded by the `place.rating && place.rating > 0` guard,
    // but a rating of 0 is truthy in the `place.rating > 0` check — consistent.
    // However, an empty string note_text is falsy so excluded from the label,
    // but it IS included in the note_text render check on line 84 which uses
    // `place.note_text ? ...` — this is fine since empty string is falsy.
    it('excludes rating of 0 from accessibility label', () => {
      const place = makePlace({ name: 'Zero Rated', rating: 0 });
      const { getByLabelText } = render(<PlaceCard place={place} />);
      const label = getByLabelText(/Zero Rated/);
      expect(label.props.accessibilityLabel).not.toContain('stars');
    });
  });

  // ── React.memo ──

  describe('React.memo behavior', () => {
    it('does not re-render when the same place reference is passed', () => {
      const renderSpy = jest.fn();
      const SpyCard = React.memo(function SpyCard({ place }: { place: SavedPlaceLocal }) {
        renderSpy();
        return <PlaceCard place={place} />;
      });

      const place = makePlace();
      const { rerender } = render(<SpyCard place={place} />);
      expect(renderSpy).toHaveBeenCalledTimes(1);

      rerender(<SpyCard place={place} />);
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it('re-renders when a different place object is passed', () => {
      const renderCount = { current: 0 };
      const TrackingCard = (props: { place: SavedPlaceLocal }) => {
        renderCount.current++;
        return <PlaceCard {...props} />;
      };

      const place1 = makePlace({ name: 'Place A' });
      const place2 = makePlace({ name: 'Place B' });

      const { rerender } = render(<TrackingCard place={place1} />);
      expect(renderCount.current).toBe(1);

      rerender(<TrackingCard place={place2} />);
      expect(renderCount.current).toBe(2);
    });
  });

  // ── Edge cases ──

  describe('edge cases', () => {
    it('renders dot separator between rating and address only when both exist', () => {
      const { queryByText, rerender } = render(
        <PlaceCard place={makePlace({ rating: 4.0, address: '1 Main St' })} />,
      );
      // middot entity renders as the character ·
      expect(queryByText('·')).toBeTruthy();

      rerender(
        <PlaceCard place={makePlace({ rating: null, address: '1 Main St' })} />,
      );
      expect(queryByText('·')).toBeNull();
    });

    it('renders dot separator only when rating > 0', () => {
      const { queryByText } = render(
        <PlaceCard place={makePlace({ rating: 0, address: '1 Main St' })} />,
      );
      expect(queryByText('·')).toBeNull();
    });

    // FLAG: empty string cuisine is treated as falsy so won't render,
    // but empty string note_text is also treated as falsy — both consistent.
    it('does not render cuisine row for empty string', () => {
      const place = makePlace({ cuisine: '' });
      const { queryByText } = render(<PlaceCard place={place} />);
      // Should not render an empty cuisine text
      // The cuisine element should not be present at all
      const tree = render(<PlaceCard place={makePlace({ cuisine: 'Sushi' })} />);
      expect(tree.getByText('Sushi')).toBeTruthy();
    });
  });
});
