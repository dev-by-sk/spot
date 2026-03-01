import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { TOAST_DISMISS_MS } from '../config/constants';

export type ToastType = 'error' | 'success' | 'info';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface Toast {
  text: string;
  type: ToastType;
  action?: ToastAction;
  duration?: number;
}

interface ToastContextValue {
  current: Toast | null;
  showToast: (toast: Toast) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastContextValue>({
  current: null,
  showToast: () => {},
  dismiss: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<Toast | null>(null);
  const queueRef = useRef<Toast[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showNext = useCallback(() => {
    if (queueRef.current.length === 0) {
      setCurrent(null);
      return;
    }
    const next = queueRef.current.shift()!;
    setCurrent(next);
    timerRef.current = setTimeout(() => {
      showNext();
    }, next.duration ?? TOAST_DISMISS_MS);
  }, []);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    showNext();
  }, [showNext]);

  const showToast = useCallback(
    (toast: Toast) => {
      // Deduplicate: skip if the same text is already showing or queued
      if (current?.text === toast.text) return;
      if (queueRef.current.some((t) => t.text === toast.text)) return;

      if (current === null && queueRef.current.length === 0) {
        setCurrent(toast);
        timerRef.current = setTimeout(() => {
          showNext();
        }, toast.duration ?? TOAST_DISMISS_MS);
      } else {
        queueRef.current.push(toast);
      }
    },
    [current, showNext],
  );

  return (
    <ToastContext.Provider value={{ current, showToast, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
}
