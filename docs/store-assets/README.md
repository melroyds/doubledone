# Store assets (Google Play)

The Play Store listing graphics live here. See [play-store-release.md](../play-store-release.md) for
where each one is used and the exact requirements.

- `feature-graphic.png` (1024x500): the listing banner, the warm Dusk wordmark ("DoubleDone" in
  Newsreader SemiBold, ink #2B2722) over the tagline ("A calmer kind of to-do." in Atkinson Hyperlegible,
  mauve #9B6A7D) on the dusk gradient.
- `screenshot-1.png` and up (about 1080x1920 portrait, 2 to 5 of them): phone screenshots.
- The app icon (512x512) is generated from `client/assets/images/icon.png`, so it is not stored here.

Dimensions are strict: Play rejects off-by-one sizes, so export at the exact pixels.
