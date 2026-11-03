# Disclaimer

## Fan-made, unofficial project

Poudlard TV is a personal fan project, published by Wavia on an experimental basis. It is **neither affiliated with, nor endorsed, nor sponsored** by Warner Bros. Discovery, Wizarding World, J.K. Rowling, her publishers or her rights holders.

"Harry Potter", "Hogwarts", "Poudlard", "Wizarding World", the names of the houses, places, objects and characters, and every trademark mentioned in this repository (Netflix, Prime Video, Disney+, Canal+, Max, Apple TV, Paramount+, YouTube, france.tv, TF1+, M6+, Arte, Crunchyroll, DAZN, Twitch, Spotify, Deezer, Plex, PlayStation, Xbox, Nintendo Switch, Google TV, Android TV, Chromecast and the others) are the property of their respective owners. They are mentioned only to designate the services and devices concerned.

## Names and text

Every sentence shown by the interface is original copy written for this project: the Map's opening and closing lines, the Admission Letter, the captions. No passage from the books or the films, in any language, is reproduced. The single-word names kept as nominative labels are: Poudlard, Lumos, Nox, Hedwige, Gryffondor, Serpentard, Serdaigle, Poufsouffle, Ollivanders, Rappeltout, Beuglante, Choixpeau (in the house section only), the Carte du Maraudeur and the Salle sur Demande as screen names. They designate the theme; they are not licensed by this repository, and the product name itself is the owner's decision (it lives in one place: `app_name` in `android/res/values/strings.xml` and the README).

## What the repository does not contain

- **No official assets** from the films, books or games: no photo, no clip, no official crest, no lightning-bolt lettering, no font derived from the posters. The scenery (castle, parchment, mist, owl), the crests and the glyphs are generated or drawn for this project.
- **No melody from the films.** The interface sounds and the background music (a celesta waltz) are synthesized at runtime (Web Audio) and composed for this project; no audio file is distributed. Hedwig's Theme and the other music by John Williams, Patrick Doyle, Nicholas Hooper and Alexandre Desplat are protected works: they are neither included, nor quoted, nor "rearranged". See `docs/MUSIC.md`.
- **No app logos.** Streaming service logos are trademarks; the repository does not distribute them. `app/assets/logos.js` is deliberately absent and ignored by Git; the repository provides `app/assets/logos.example.js` (empty) and the interface shows a monogram instead. On a real TV, the launcher uses the icon each app provides to the system itself.
- **No data.** The launcher collects nothing, transmits nothing, has no account, no analytics, no crash reporting and no network access. Settings stay in the device's local storage.

## What the user supplies themselves

For strictly private use, anyone can complete their installation with:

1. **Their logos**: an `app/assets/logos.js` file generated locally (procedure in `tools/README.md`), from sources whose terms of use they comply with. This file must not be redistributed.
2. **Their background music**: an audio file they own or hold a license for, placed in `app/assets/music/` under the name `ambiance.ogg`, `ambiance.mp3` or `ambiance.m4a`. This folder is ignored by Git. The films' soundtrack has no place there.
3. **Their content links**: the addresses of the films on their streaming service, in `app/js/config.js`. Only the hosts on the whitelist in `app/js/platform.js` are accepted.

## Third-party material versioned at the maintainer's request

Since November 2026 the repository also carries, on the maintainer's explicit decision and responsibility:

- the four house crest pictures (`app/assets/crest-*.webp`), cut out from published artwork owned by Warner Bros.;
- the streaming apps' logos (`app/assets/logos.js`), trademarks of their owners;
- a background music file (`app/assets/music/ambiance.mp3`), a recording whose rights belong to its author.

None of it is covered by the MIT license, none of it is claimed as original, and any rights holder may ask for its removal: open an issue or write to the maintainer and the file will be taken out of the repository. Anyone who forks or redistributes this repository does so under their own responsibility for these files.

## Usage

This project is provided "as is", without warranty (see `LICENSE`). It is not intended for commercial use. It circumvents no protection, gives access to no content and replaces no subscription: all it does is open, on request, the apps already installed on the TV.

If you are a rights holder and believe an element of this repository infringes your rights, open an issue: the element will be removed.
