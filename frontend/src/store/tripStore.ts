import { create } from "zustand";
import type { AppState } from "@/types";

export const useTripStore = create<AppState>((set) => ({
  selectedCategory: "Sedan",
  pickupLocation: null,
  dropoffLocation: null,
  fareEstimate: null,
  setSelectedCategory: (cat) => set({ selectedCategory: cat }),
  setPickupLocation: (loc) => set({ pickupLocation: loc }),
  setDropoffLocation: (loc) => set({ dropoffLocation: loc }),
  setFareEstimate: (est) => set({ fareEstimate: est }),
  clearTrip: () =>
    set({ pickupLocation: null, dropoffLocation: null, fareEstimate: null }),
}));
