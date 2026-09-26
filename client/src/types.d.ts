// Side-effect CSS imports (web only, e.g. `import '@/global.css'`) carry no
// types. Declaring them keeps `tsc --noEmit` green everywhere, including a
// fresh CI checkout, which has no Expo-generated `expo-env.d.ts`.
declare module '*.css';

// Static image assets resolve to a Metro asset id (a number) that React Native's
// Image accepts directly as a source. Expo only types these via the gitignored
// `expo-env.d.ts`, so declare them here to keep CI's `tsc` green too.
declare module '*.jpg' {
  const src: number;
  export default src;
}

declare module '*.png' {
  const src: number;
  export default src;
}

// The Menu's room pictures are WebP (the Today v3 handoff: small, and decoded natively on web, on
// iOS 14+ through ImageIO and on Android through Fresco, all static lossy files with no animation).
declare module '*.webp' {
  const src: number;
  export default src;
}
