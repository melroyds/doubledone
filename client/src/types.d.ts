// Side-effect CSS imports (web only, e.g. `import '@/global.css'`) carry no
// types. Declaring them keeps `tsc --noEmit` green everywhere, including a
// fresh CI checkout, which has no Expo-generated `expo-env.d.ts`.
declare module '*.css';
