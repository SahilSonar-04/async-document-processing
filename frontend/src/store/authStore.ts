/**
 * Client-side authentication store using Zustand.
 *
 * Persists active JWT tokens and authenticated user metadata across views.
 *
 * @packageDocumentation
 */

import { create } from "zustand";

/**
 * Authenticated user identity model.
 */
interface User {
  /** Unique user UUID */
  id: string;
  /** User email address */
  email: string;
}

/**
 * Authentication store state and action contracts.
 */
interface AuthStore {
  /** Active signed JWT bearer token string */
  token: string | null;
  /** Authenticated user profile */
  user: User | null;
  /** Set authentication state upon successful login or registration */
  setAuth: (token: string, user: User) => void;
  /** Reset authentication state upon logout or 401 session expiry */
  clearAuth: () => void;
}

/**
 * Global reactive Zustand hook for managing user authentication tokens and profile data.
 */
export const useAuthStore = create<AuthStore>((set) => ({
  token: null,
  user: null,
  setAuth: (token, user) => set({ token, user }),
  clearAuth: () => set({ token: null, user: null }),
}));
