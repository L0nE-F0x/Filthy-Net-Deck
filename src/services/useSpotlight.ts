import { useSyncExternalStore } from "react";
import { getSpotlightState, subscribeSpotlight, type SpotlightState } from "./spotlightFeed";

export function useSpotlight(): SpotlightState {
  return useSyncExternalStore(subscribeSpotlight, getSpotlightState, getSpotlightState);
}
