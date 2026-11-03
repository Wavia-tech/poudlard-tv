// App logos: example file, deliberately empty.
//
// The public repo distributes no official logo (they are trademarks, see DISCLAIMER.md).
// The real file, `assets/logos.js`, is ignored by Git. To get one:
//
//   1. Copy this file:   cp app/assets/logos.example.js app/assets/logos.js
//      (the mock-up then starts with monograms instead of logos)
//   2. For strictly private use, bundle your own logos with `node tools/logos-build.mjs <folder> [luma-ids]`
//      (white monochrome SVGs, one per CATALOG id from js/config.js), which writes `assets/logos.js` in the format below.
//      Detailed procedure: tools/README.md.
//
// Format expected by the screens:
//   LOGOS[id] = { src: 'data:image/svg+xml;base64,…', ratio: width / height, luma: true | false }
//   - `src`   : white SVG on a transparent background, encoded as a data URI; it serves as a CSS mask (engraved ivory, embossed gold).
//   - `ratio` : proportion of the logo box (1 = square). The screens fix the height and derive the width.
//   - `luma`  : true if the SVG is a solid fill (a logo on a colored background) and must be masked by luminance.
//
// Fallback: when LOGOS[id] does not exist, each screen calls monogram(name) (js/monogram.js), which draws the app's
// initial in a circle, in the same format. The interface therefore works fully without this file being filled in.
// On Android TV, the window.Android bridge also exposes the icon each app provides to the system
// (appIcon(pkg), not yet called by the screens in this version; see tools/README.md).
export const LOGOS = {};
