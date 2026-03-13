import { PoolConfig } from "./types";

const STORAGE_KEY = "golf-pool-config";

export function savePool(config: PoolConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function loadPool(): PoolConfig | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PoolConfig;
  } catch {
    return null;
  }
}

export function clearPool(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
