import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { EditNoteModal } from '@/screens/list/EditNoteModal';

/**
 * EditNoteModal date format tests (Issue #26):
 *
 * === Date parsing on init ===
 * 1. Initializes dateVisited as null when initialDateVisited is null
 * 2. Correctly parses a date-only string (YYYY-MM-DD) as local midnight
 * 3. Does not shift date-only strings by timezone offset
 *
 * === Date format on save ===
 * 4. Outputs date-only string (YYYY-MM-DD) on save
 * 5. Does not include time component in saved date
 * 6. Passes null when date is cleared
 *
 * === Roundtrip consistency ===
 * 7. Saving then re-opening with the saved value preserves the same date
 *
 * === Legacy data handling ===
 * 8. Full ISO string as initialDateVisited produces Invalid Date — flagged
 *    as likely bug for existing data migration
 *
 * === Timezone edge case ===
 * 9. toISOString().split('T')[0] on save has same UTC shift bug as
 *    SaveConfirmationModal
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
    spotEmeraldLight: '#059669',
    spotDivider: '#E5E7EB',
  }),
}));

jest.mock('@/theme/typography', () => ({
  SpotTypography: {
    headline: {},
    title2: {},
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

// ── Tests ──

describe('EditNoteModal — date format', () => {
  beforeEach(() => {
    capturedDatePickerOnChange = null;
  });

  it('displays "Add a date" when initialDateVisited is null', () => {
    const { getByText } = render(
      <EditNoteModal
        visible={true}
        placeName="Test Place"
        initialNote=""
        initialDateVisited={null}
        onSave={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(getByText('Add a date')).toBeTruthy();
  });

  it('displays formatted date when initialDateVisited is a date-only string', () => {
    const { queryByText } = render(
      <EditNoteModal
        visible={true}
        placeName="Test Place"
        initialNote=""
        initialDateVisited="2025-06-15"
        onSave={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    // Should show a formatted date, not "Add a date"
    expect(queryByText('Add a date')).toBeNull();
    // The formatDate function uses toLocaleDateString — exact output depends
    // on locale, but it should contain "2025" and "15"
    expect(queryByText(/2025/)).toBeTruthy();
    expect(queryByText(/15/)).toBeTruthy();
  });

  it('parses date-only string as local midnight, not UTC', () => {
    // The fix appends T00:00:00 to force local parsing.
    // Without it, "2025-06-15" is parsed as UTC midnight, which in
    // negative UTC offsets (e.g., US timezones) becomes June 14 local.
    // We verify by checking the displayed date contains "15", not "14".
    const { queryByText } = render(
      <EditNoteModal
        visible={true}
        placeName="Test Place"
        initialNote=""
        initialDateVisited="2025-06-15"
        onSave={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    // If parsed as UTC midnight and displayed in a negative offset,
    // this would show June 14. The fix ensures it shows June 15.
    expect(queryByText(/15/)).toBeTruthy();
  });

  it('outputs date-only string (YYYY-MM-DD) on save', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const { getByText } = render(
      <EditNoteModal
        visible={true}
        placeName="Test Place"
        initialNote=""
        initialDateVisited="2025-06-15"
        onSave={onSave}
        onCancel={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.press(getByText('Save'));
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
    const [, dateArg] = onSave.mock.calls[0];
    expect(dateArg).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dateArg).not.toContain('T');
  });

  it('passes null when date is cleared', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const { getByText } = render(
      <EditNoteModal
        visible={true}
        placeName="Test Place"
        initialNote=""
        initialDateVisited="2025-06-15"
        onSave={onSave}
        onCancel={jest.fn()}
      />,
    );

    // Press the close-circle icon to clear the date
    fireEvent.press(getByText('close-circle'));

    await act(async () => {
      fireEvent.press(getByText('Save'));
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
    const [, dateArg] = onSave.mock.calls[0];
    expect(dateArg).toBeNull();
  });

  it('roundtrips: saving then re-opening preserves the same date', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const { getByText, rerender, queryByText } = render(
      <EditNoteModal
        visible={true}
        placeName="Test Place"
        initialNote=""
        initialDateVisited="2025-06-15"
        onSave={onSave}
        onCancel={jest.fn()}
      />,
    );

    // Save to capture the output date
    await act(async () => {
      fireEvent.press(getByText('Save'));
    });
    const [, savedDate] = onSave.mock.calls[0];

    // Re-open with the saved date as input
    rerender(
      <EditNoteModal
        visible={true}
        placeName="Test Place"
        initialNote=""
        initialDateVisited={savedDate}
        onSave={onSave}
        onCancel={jest.fn()}
      />,
    );

    // Should still display June 15, not shift by a day
    expect(queryByText(/15/)).toBeTruthy();
    expect(queryByText('Add a date')).toBeNull();
  });

  // BUG: The implementation prepends initialDateVisited with T00:00:00
  // unconditionally: `new Date(`${initialDateVisited}T00:00:00`)`.
  // If legacy data contains a full ISO string like "2025-06-15T10:30:00.000Z",
  // this produces "2025-06-15T10:30:00.000ZT00:00:00" — an Invalid Date.
  // Existing records saved before this fix may still have full ISO strings
  // in the database, and there is no data migration.
  it('produces Invalid Date when initialDateVisited is a full ISO string (legacy data bug)', () => {
    const { queryByText } = render(
      <EditNoteModal
        visible={true}
        placeName="Test Place"
        initialNote=""
        initialDateVisited="2025-06-15T10:30:00.000Z"
        onSave={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    // With a full ISO string, the Date constructor receives
    // "2025-06-15T10:30:00.000ZT00:00:00" which is invalid.
    // The component should show "Add a date" (null-ish) or crash,
    // but instead toLocaleDateString on Invalid Date produces "Invalid Date".
    expect(queryByText('Add a date')).toBeNull();
    expect(queryByText(/Invalid Date/)).toBeTruthy();
  });
});
