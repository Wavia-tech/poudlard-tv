# The approach: making your TV your own

This guide tells how to turn an ordinary TV home screen into something you want to look at every evening, with Poudlard TV as the example. It is written for someone who has never opened a terminal: each step says what to gather, what to prepare, then what to ask a coding assistant (Claude Code or equivalent) in a prompt to paste.

One rule runs through the whole guide: **nothing gets broken**. At every step, the TV can go back to its original state in under a minute.

The path:

1. Before you start
2. A clean base: remove the ads, keep the original home within reach
3. Gathering your assets
4. The home: the Parapet
5. The collection: Ollivanders
6. Settings and first launch
7. Sounds
8. Finishing cleanly

---

## 1. Before you start

- **An Android TV or Google TV** (TCL, Sony, Hisense, Philips, Xiaomi, Chromecast with Google TV, Google TV Streamer…). Samsung (Tizen) and LG (webOS) do not accept third-party launchers: on those TVs, a Google TV dongle plugged into HDMI gives the same result.
- **A computer on the same Wi-Fi**, with `adb` (Android platform-tools) and, if you want help, Claude Code.
- **Developer mode on the TV**: Settings → System → About → press "Build" seven times. Then Developer options → USB debugging (and Network debugging if the TV offers it). On first connection the TV asks "Allow debugging?": yes.
- **Time for the images, not for the code.** The prompts take a few minutes; choosing a castle, an owl, a shop window takes an evening.

## 2. A clean base

Two open-source projects already do the heavy lifting: [Free My TV](https://github.com/simbasjungles/free-my-tv) and [CleanYourTV](https://github.com/Gathin23/cleanyourtv). They remove the sponsored rows and the ads from the home screen, and install a sober home. Poudlard TV borrows the Free My TV method (install with `adb`, app launching, safety net) without disabling the Google home: it stays installed, and one setting puts it back. The details of what is borrowed: `docs/FREE-MY-TV.md`.

**What we do**

1. Clone Poudlard TV, build the APK (`android/build.sh`) and install it: `docs/INSTALLATION.md`, section 2.
2. Hand the Home key to Poudlard TV from the launcher itself: Room of Requirement → "Accueil de la télé" → Touche Home: Poudlard TV (the TV shows its own confirmation; the Admission Letter offers the same button on its last page). Not before checking that "hold Back for two seconds" does bring plain mode back, and that the same row set to "Accueil d'origine" gives the original home back.

**What we do not do**: disable or uninstall the original home, install an accessibility service, give the launcher a network permission. If a tutorial suggests it, walk away.

## 3. Gathering your assets

Make a folder (for example `tv-assets/`) and name each file in lowercase with hyphens. Everything below stays with you: the repository distributes none of it.

| Asset | Used for | Format | Where to find it, how to prepare it |
|---|---|---|---|
| The home backdrop | The Parapet | 16:9, at least 1920 px wide, JPEG or WebP | A generated image (the repository documents the method in `tools/README.md`) or an illustration you hold the rights to. Choose a calm lower third: the apps sit there. No photo from the films. |
| The owl poses | Hedwig | Cut-out PNGs, transparent background, 600 px tall | Five poses are enough: perched, wings up, wings down, gliding, landing. Generated on a plain black background then cut out (`tools/cutout_owl.py`). All three-quarter views, facing the same side. |
| The shop window | Ollivanders | 16:9, 1672×941 or the same ratio | A shop-window image with one box per film. The selection areas are polygons measured on the image (`app/js/screens/ollivanders.js`, constant `BOXES`). |
| The film links | Ollivanders | One web address per title | On your streaming service's site, the film's page (or its search). For Netflix: `netflix.com/title/<number>`. Check on JustWatch first where each title is available in your country. Only the hosts on the whitelist in `app/js/platform.js` are accepted. |
| The app logos | The Parapet, the Map | Monochrome SVGs | On the real TV, not needed: the launcher takes the icon each app provides to the system. For the mock-up, `tools/README.md` explains how to assemble your own file, not to be redistributed. |
| The background music | The whole interface | OGG, MP3 or M4A | A file you own, in `app/assets/music/`. Otherwise, the synthesized celesta waltz does the job. `docs/MUSIC.md`. |

## 4. The home: the Parapet

The home fits in one sentence: a backdrop, the time, up to eight apps spread across the width, and an owl that lands on the one you pick. Nothing else. The rest of the interface is one press away (down for the collection, up for sound, the Map and the settings).

What makes the difference in daily use, and what gets tuned first:

- **A fade rather than a strip.** The apps do not sit on a banner: the night rises gently from the bottom of the image and they settle on it.
- **The spread.** Eight apps at most, always all visible, evenly spaced. Never any scrolling.
- **A single focus.** Only one thing is alive at a time: the focused app goes from engraved ivory to raised gold, a candle lights up beneath it, the owl lands on it. No frame, no glass panel.
- **Visual silence.** No name under the icons, no permanent loop: only the castle windows twinkle.

**Prompt to paste** (fill in the brackets):

> My backdrop is `tv-assets/chateau.jpg`, my owl poses are in `tv-assets/chouette/`. Install them in `app/assets/` under the expected names (`castle.jpg`, `owl-perch.png`, `owl-up.png`, `owl-down.png`, `owl-glide.png`, `owl-land.png`). My parapet: [Netflix, Prime Video, Disney+, Canal+, Max, Apple TV, YouTube, PlayStation 5]. My house: [Gryffindor]. Relaunch the mock-up and show me the home with each app in focus. Do not change the animation durations without asking me.

Then look at the screen and correct in plain language: "the owl is too big", "move the icons down", "the fade hides the castle". One request at a time.

## 5. The collection: Ollivanders

The films are not a list: they are a shop window. One box per film, from the plainest to the most elaborate, and OK opens the film in the app that owns it.

1. Prepare the shop-window image (see Assets) and put it in `app/assets/ollivanders.webp`.
2. Note down the link of each film.
3. Paste the prompt:

> Here is my shop window `app/assets/ollivanders.webp` and the links of my films (title | app | link):
> - [Philosopher's Stone | Max | https://…]
> - […]
> Measure the area of each box on the image and update `BOXES` in `app/js/screens/ollivanders.js`; put the links in `LIBRARY` (`app/js/config.js`). The selection draws no outline: a warm spotlight on the chosen box, the rest of the window dimmed a notch, the camera tilting slightly. Show me each box selected.

## 6. Settings and first launch

Everything is set with the remote, in the Room of Requirement (Salle sur Demande; Menu key, or the quill at the top right): the Home key (Poudlard TV or the original home), the TV's own settings, the parapet apps and their order, the house (it tints the candle, the edging, the crest under the time), the owl (lively, calm, absent), sounds and music, motion (auto, reduced, economy), standby and plain mode.

The Admission Letter (Lettre d'admission) does all of this in four pages on first launch; the last page, "Les issues de secours", lists the four ways out and, on the TV, asks for the Home key. To replay it: Settings → About → Replay the Admission Letter; to reread the exits alone: Settings → About → "Les issues de secours".

**Réglages de la télé.** Poudlard TV has no settings of its own for picture, sound, network or remotes: it opens the TV's. The "Réglages de la télé" section lists eleven entries (all settings, network and Wi-Fi, remote and Bluetooth, picture, sound, applications, date and time, language, accessibility, update, about the TV), each opening the TV's own screen; the remote's Settings key does the same (except on Hisense and TCL, where the TV keeps that key). Plain mode has a "Télé" tile, and a long OK on the Map's candle opens the same list. If a TV lacks one of these screens, the entry says so and nothing else happens.

**Uninstalling an app** = long OK on it (Parapet, Map or plain mode) → "Infos de l'appli" → the TV's own page, with its Uninstall and Force stop buttons. Installing one = the Map's "Boutique" piece, which opens the TV's store. Poudlard never installs or removes anything itself.

Plain mode is there for the others: the family, the guest, the evening when the TV is sluggish. Hold Back for two seconds from any screen, and the same gesture to come back.

## 7. Sounds

No audio files in the interface: a synthesized celesta voice, nine short phrases (move, descend, back, Lumos, Nox, wake, error, tick, confirm) and a background waltz, all original. The Sound key at the top right mutes everything at once. For music of your own: `docs/MUSIC.md`.

What we do not do: reuse the films' music, even modified. An arrangement is still a derivative work.

## 8. Finishing cleanly

- **Turn off USB debugging** when you are done. While it is on, any computer on the Wi-Fi can ask to connect. Turn it back on when you want to change something.
- **Everything can be undone.** The original home was never touched; Room of Requirement → "Accueil de la télé" → "Accueil d'origine" puts it back; uninstalling the app puts everything back as before, because the launcher only ever disables its own home entry.
- **One step at a time.** One prompt, one look at the screen, one correction in plain language. Small, precise requests work better than a giant prompt.
- **Keep your assets folder.** Changing the backdrop, the owl or the shop window later is one short prompt.
- **Hands off the remote during an install.** Each install restarts the home.

---

Starting idea: the reel "I vibecoded my TV to feel like Hogwarts" (@ikevinadams). Install and roll-back method: Free My TV (MIT). Fan-made, unofficial project: `DISCLAIMER.md`.
