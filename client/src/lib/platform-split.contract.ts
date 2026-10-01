// The platform-split contract, checked by `npm run typecheck` and nothing else (types only, no code).
//
// WHY. tsc resolves `@/lib/purchases` and `@/lib/storefront` to the BASE files (client/tsconfig.json sets
// no `moduleSuffixes`), while Metro picks `.ios.ts` / `.android.ts` on a phone. So a name the screen
// imports that is missing from `purchases.android.ts` compiles clean, ships, and is `undefined` only on an
// Android device, on the money path, where the web preview can never see it. This file imports each
// platform file directly and fails the typecheck unless every pair exports the SAME names with mutually
// assignable types. Add a split file here the day you create one.
//
// Literal flag types are widened first (`true` and `false` are both boolean), so the switches may differ
// in VALUE per platform but never in kind.

// ESLint's resolver picks the `.android.ts` file for a bare './purchases' (as Metro does on Android), so it
// reads these pairs as one module imported twice. tsc, which is what checks this file, reads the base file.
/* eslint-disable import/no-duplicates */
import type * as PurchasesBase from './purchases';
import type * as PurchasesAndroid from './purchases.android';
import type * as PurchasesIos from './purchases.ios';
import type * as StorefrontBase from './storefront';
import type * as StorefrontAndroid from './storefront.android';
/* eslint-enable import/no-duplicates */

type Widen<T> = T extends boolean ? boolean : T;
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type SameKeys<A, B> = Mutual<keyof A, keyof B>;
type SameTypes<A, B> = { [K in keyof A & keyof B]: Mutual<Widen<A[K]>, Widen<B[K]>> }[keyof A & keyof B];
type Holds<T extends true> = T;

// Same names, both directions.
export type PurchasesIosKeys = Holds<SameKeys<typeof PurchasesBase, typeof PurchasesIos>>;
export type PurchasesAndroidKeys = Holds<SameKeys<typeof PurchasesBase, typeof PurchasesAndroid>>;
export type StorefrontAndroidKeys = Holds<SameKeys<typeof StorefrontBase, typeof StorefrontAndroid>>;

// Same types for every shared name. A mismatch makes the union `boolean`, which is not `true`.
export type PurchasesIosTypes = Holds<SameTypes<typeof PurchasesBase, typeof PurchasesIos>>;
export type PurchasesAndroidTypes = Holds<SameTypes<typeof PurchasesBase, typeof PurchasesAndroid>>;
export type StorefrontAndroidTypes = Holds<SameTypes<typeof StorefrontBase, typeof StorefrontAndroid>>;
