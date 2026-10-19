import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AuthState, User } from "@/types";
import { authService } from "@/services/api";

export const useAuthStore = create<AuthState & {
  initializing: boolean;
  authError: string | null;
  initializeAuth: () => Promise<void>;
  setInitializing: (v: boolean) => void;
  setAuthError: (msg: string | null) => void;
} & {
  login: (token: string, user?: User) => void;
  logout: () => void;
  setUser: (user: User) => void;
}>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      initializing: true,
      authError: null,
      login: (token: string, user?: User) =>
        set({ token, user: user ?? null, isAuthenticated: true, initializing: false, authError: null }),
      logout: () =>
        set({ token: null, user: null, isAuthenticated: false, initializing: false, authError: null }),
      setUser: (user: User) => set({ user }),
      setInitializing: (v: boolean) => set({ initializing: v }),
      setAuthError: (msg: string | null) => set({ authError: msg }),
      initializeAuth: async () => {
        const { token } = get();
        if (!token) {
          set({ initializing: false, isAuthenticated: false });
          return;
        }
         try {
           const res = await authService.me();
           set({ user: res.data, isAuthenticated: true, initializing: false, authError: null });
         } catch (err: any) {
           const status = err?.response?.status;
           // Only clear auth state on explicit unauthorized/forbidden responses.
           // Transient network/API failures should not log the user out.
           if (status === 401 || status === 403) {
             set({ token: null, user: null, isAuthenticated: false, initializing: false, authError: "Session expired. Please log in again." });
           } else {
             const stillAuthed = Boolean(get().token);
             set({ isAuthenticated: stillAuthed, initializing: false, authError: "Unable to verify session. Please try again." });
           }
         }
      },
    }),
    {
      name: "rsgo-auth",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
