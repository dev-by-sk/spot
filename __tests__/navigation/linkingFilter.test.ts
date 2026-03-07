import * as Linking from 'expo-linking';

jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(),
  addEventListener: jest.fn(),
}));

// Extract the linking filter logic matching App.tsx implementation
function makeGetInitialURL() {
  return async function getInitialURL() {
    const url = await Linking.getInitialURL();
    if (url && url.includes('dataUrl=')) {
      return null;
    }
    return url;
  };
}

function makeSubscribe() {
  return function subscribe(listener: (url: string) => void) {
    const sub = Linking.addEventListener('url', ({ url }: { url: string }) => {
      if (url.includes('dataUrl=')) {
        // filtered — don't forward to React Navigation
      } else {
        listener(url);
      }
    });
    return () => sub.remove();
  };
}

describe('linking URL filter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getInitialURL', () => {
    const getInitialURL = makeGetInitialURL();

    it('returns null for share intent URLs containing dataUrl=', async () => {
      (Linking.getInitialURL as jest.Mock).mockResolvedValue(
        'spot://dataUrl=spotShareKey#weburl'
      );
      expect(await getInitialURL()).toBeNull();
    });

    it('passes through normal deep links', async () => {
      (Linking.getInitialURL as jest.Mock).mockResolvedValue('spot://search');
      expect(await getInitialURL()).toBe('spot://search');
    });

    it('passes through null when no initial URL', async () => {
      (Linking.getInitialURL as jest.Mock).mockResolvedValue(null);
      expect(await getInitialURL()).toBeNull();
    });

    it('passes through OAuth callback URLs', async () => {
      (Linking.getInitialURL as jest.Mock).mockResolvedValue(
        'spot://auth-callback?code=abc123'
      );
      expect(await getInitialURL()).toBe('spot://auth-callback?code=abc123');
    });

    it('filters URLs with dataUrl= anywhere in the string', async () => {
      // Share intents may have dataUrl= at different positions
      (Linking.getInitialURL as jest.Mock).mockResolvedValue(
        'spot://something?dataUrl=encoded-data&other=param'
      );
      expect(await getInitialURL()).toBeNull();
    });

    // FLAG: The filter uses string includes('dataUrl='), which is case-sensitive.
    // If expo-share-intent ever changes the parameter casing (e.g., 'dataurl=' or 'DataUrl='),
    // the filter would fail to catch it and React Navigation would consume the URL.
    it('does NOT filter URLs with different casing like dataurl=', async () => {
      (Linking.getInitialURL as jest.Mock).mockResolvedValue(
        'spot://dataurl=something'
      );
      const result = await getInitialURL();
      expect(result).toBe('spot://dataurl=something');
    });
  });

  describe('subscribe', () => {
    it('does not forward share intent URLs to the listener', () => {
      const listener = jest.fn();
      const mockRemove = jest.fn();
      (Linking.addEventListener as jest.Mock).mockReturnValue({ remove: mockRemove });

      const subscribe = makeSubscribe();
      subscribe(listener);

      // Grab the handler that was registered
      const handler = (Linking.addEventListener as jest.Mock).mock.calls[0][1];

      handler({ url: 'spot://dataUrl=spotShareKey#weburl' });
      expect(listener).not.toHaveBeenCalled();
    });

    it('forwards normal deep links to the listener', () => {
      const listener = jest.fn();
      (Linking.addEventListener as jest.Mock).mockReturnValue({ remove: jest.fn() });

      const subscribe = makeSubscribe();
      subscribe(listener);

      const handler = (Linking.addEventListener as jest.Mock).mock.calls[0][1];

      handler({ url: 'spot://search' });
      expect(listener).toHaveBeenCalledWith('spot://search');
    });

    it('forwards OAuth callbacks to the listener', () => {
      const listener = jest.fn();
      (Linking.addEventListener as jest.Mock).mockReturnValue({ remove: jest.fn() });

      const subscribe = makeSubscribe();
      subscribe(listener);

      const handler = (Linking.addEventListener as jest.Mock).mock.calls[0][1];

      handler({ url: 'spot://auth-callback?code=xyz' });
      expect(listener).toHaveBeenCalledWith('spot://auth-callback?code=xyz');
    });

    it('returns a cleanup function that removes the event listener', () => {
      const mockRemove = jest.fn();
      (Linking.addEventListener as jest.Mock).mockReturnValue({ remove: mockRemove });

      const subscribe = makeSubscribe();
      const cleanup = subscribe(jest.fn());

      expect(mockRemove).not.toHaveBeenCalled();
      cleanup();
      expect(mockRemove).toHaveBeenCalledTimes(1);
    });

    it('correctly filters multiple URLs in sequence', () => {
      const listener = jest.fn();
      (Linking.addEventListener as jest.Mock).mockReturnValue({ remove: jest.fn() });

      const subscribe = makeSubscribe();
      subscribe(listener);

      const handler = (Linking.addEventListener as jest.Mock).mock.calls[0][1];

      handler({ url: 'spot://dataUrl=share1' });
      handler({ url: 'spot://search' });
      handler({ url: 'spot://dataUrl=share2' });
      handler({ url: 'spot://auth-callback?code=abc' });

      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenNthCalledWith(1, 'spot://search');
      expect(listener).toHaveBeenNthCalledWith(2, 'spot://auth-callback?code=abc');
    });
  });
});
