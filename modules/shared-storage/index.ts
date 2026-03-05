import { requireNativeModule } from "expo-modules-core";

const SharedStorage = requireNativeModule("SharedStorage");

export function setItem(key: string, value: string, suiteName: string): void {
  return SharedStorage.setItem(key, value, suiteName);
}

export function getItem(key: string, suiteName: string): string | null {
  return SharedStorage.getItem(key, suiteName);
}

export function removeItem(key: string, suiteName: string): void {
  return SharedStorage.removeItem(key, suiteName);
}
