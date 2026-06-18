// Platform-specific bridge for TypeScript resolution.
// At runtime Metro uses ChronopediaMap.native.tsx (iOS/Android) or ChronopediaMap.web.tsx (browser).
// This file is only used by `tsc --noEmit` for type checking.
export { default } from "./ChronopediaMap.native";
export type { ChronopediaMapHandle, ChronopediaMapProps, SlotMarker } from "./ChronopediaMap.native";
