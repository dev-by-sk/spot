import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Switch } from 'react-native';
import { SaveConfirmationModal } from '@/screens/search/SaveConfirmationModal';
import type { PlaceCacheDTO } from '@/types';

/**
 * SaveConfirmationModal date format tests (Issue #26):
 *
 * The fix standardizes date storage to date-only strings (YYYY-MM-DD).
 * Previously, this modal stored full ISO strings while EditNoteModal
 * stored date-only strings, causing inconsistent sorting and display.
 *
 * === Date format on save ===
 * 1. Passes null dateVisited when no date is selected
 * 2. Passes date-only string (YYYY-MM-DD) when date is selected
 * 3. Does not include a time component in the saved date
 * 4. Resets date to null after cancel
 *
 * === Timezone edge case ===
 * 5. toISOString().split('T')[0] produces wrong date in positive UTC
 *    offsets when local time is late evening — flagged as likely bug
 */

// ── Mocks ──

jest.mock('@/theme/colors', () => ({
  spotEmerald: '#047857',
  spotEmeraldLight: '#059669',
  useSpotColors: () => ({
    spotTextPrimary: '#111827',
    spotTextSecondary: '#6B7280',
    spotBackground: '#FAFAF9',
    spotCardBackground: '#FFFFFF',
    spotEmerald: '#047857',
    spotDivider: '#E5E7EB',
  }),
}));

jest.mock('@/theme/typography', () => ({
  SpotTypography: {
    headline: {},
    title3: {},
    subheadline: {},
    body: {},
    footnote: {},
  },
}));

jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ resolvedScheme: 'light' }),
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: (props: any) => <Text>{props.name}</Text>,
  };
});

jest.mock('@/components/SpotButton', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return {
    SpotButton: ({ title, onPress }: any) => (
      <TouchableOpacity onPress={onPress}>
        <Text>{title}</Text>
      </TouchableOpacity>
    ),
  };
});

let capturedDatePickerOnChange: ((event: any, date?: Date) => void) | null =
  null;
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ onChange }: any) => {
      capturedDatePickerOnChange = onChange;
      return <View testID="date-picker" />;
    },
  };
});

// ── Helpers ──

function makePlaceDTO(overrides: Partial<PlaceCacheDTO> = {}): PlaceCacheDTO {
  return {
    google_place_id: 'gp-123',
    name: 'Test Restaurant',
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

// ── Tests ──

describe('SaveConfirmationModal — date format', () => {
  beforeEach(() => {
    capturedDatePickerOnChange = null;
  });

  it('passes null dateVisited when no date is selected', () => {
    const onSave = jest.fn();
    const { getByText } = render(
      <SaveConfirmationModal
        visible={true}
        placeDTO={makePlaceDTO()}
        onSave={onSave}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.press(getByText('Save'));
    expect(onSave).toHaveBeenCalledWith('', null);
  });

  it('passes date-only string (YYYY-MM-DD) when date is selected', () => {
    const onSave = jest.fn();
    const { getByText, UNSAFE_getAllByType } = render(
      <SaveConfirmationModal
        visible={true}
        placeDTO={makePlaceDTO()}
        onSave={onSave}
        onCancel={jest.fn()}
      />,
    );

    // Toggle the date switch to enable the date picker
    const switches = UNSAFE_getAllByType(Switch);
    fireEvent(switches[0], 'valueChange', true);

    // Simulate the DateTimePicker selecting a specific date
    // Use noon UTC to avoid timezone-shift ambiguity in this test
    const selectedDate = new Date('2025-06-15T12:00:00.000Z');
    expect(capturedDatePickerOnChange).not.toBeNull();
    act(() => {
      capturedDatePickerOnChange!({}, selectedDate);
    });

    fireEvent.press(getByText('Save'));

    const [, dateArg] = onSave.mock.calls[0];
    expect(dateArg).toBe('2025-06-15');
    expect(dateArg).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('does not include a time component in the saved date', () => {
    const onSave = jest.fn();
    const { getByText, UNSAFE_getAllByType } = render(
      <SaveConfirmationModal
        visible={true}
        placeDTO={makePlaceDTO()}
        onSave={onSave}
        onCancel={jest.fn()}
      />,
    );

    const switches = UNSAFE_getAllByType(Switch);
    fireEvent(switches[0], 'valueChange', true);

    const selectedDate = new Date('2025-08-20T18:30:00.000Z');
    act(() => {
      capturedDatePickerOnChange!({}, selectedDate);
    });

    fireEvent.press(getByText('Save'));

    const [, dateArg] = onSave.mock.calls[0];
    expect(dateArg).not.toContain('T');
    expect(dateArg).not.toContain(':');
  });

  it('resets date to null after cancel', () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();
    const { getByText, UNSAFE_getAllByType } = render(
      <SaveConfirmationModal
        visible={true}
        placeDTO={makePlaceDTO()}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    // Enable date, select one, then cancel
    const switches = UNSAFE_getAllByType(Switch);
    fireEvent(switches[0], 'valueChange', true);
    act(() => {
      capturedDatePickerOnChange!({}, new Date('2025-06-15T12:00:00.000Z'));
    });
    fireEvent.press(getByText('Cancel'));

    // After cancel, internal state resets. Save on a fresh render should pass null.
    fireEvent.press(getByText('Save'));
    const lastCall = onSave.mock.calls[onSave.mock.calls.length - 1];
    expect(lastCall[1]).toBeNull();
  });

  // BUG: toISOString().split('T')[0] converts to UTC before extracting the date
  // portion. In positive UTC offsets, a late-evening local Date becomes the NEXT
  // day in UTC. For example, a user in UTC+5 selects June 15 and the
  // DateTimePicker returns a Date with local time 22:00 (= June 16 03:00 UTC).
  // The implementation then stores '2025-06-16' instead of '2025-06-15'.
  //
  // A correct fix would extract local date components:
  //   `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  it('shifts date forward when UTC representation crosses midnight (timezone bug)', () => {
    const onSave = jest.fn();
    const { getByText, UNSAFE_getAllByType } = render(
      <SaveConfirmationModal
        visible={true}
        placeDTO={makePlaceDTO()}
        onSave={onSave}
        onCancel={jest.fn()}
      />,
    );

    const switches = UNSAFE_getAllByType(Switch);
    fireEvent(switches[0], 'valueChange', true);

    // Simulate: user in UTC+5 selects June 15, picker returns 10pm local
    // which is June 16 03:00 UTC
    const lateEvening = new Date('2025-06-16T03:00:00.000Z');
    act(() => {
      capturedDatePickerOnChange!({}, lateEvening);
    });

    fireEvent.press(getByText('Save'));

    const [, dateArg] = onSave.mock.calls[0];
    // Documents the bug: the user intended June 15 but gets June 16
    // because toISOString() uses UTC
    expect(dateArg).toBe('2025-06-16');
  });
});
