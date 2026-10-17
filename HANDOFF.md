# Handoff: Kindred Compass Games website

Status as of **2026-10-17**. Written so a new Claude session (or person) can pick up where the last one stopped. Read this first, then `README.md`.

## What this repo is

The **studio website** only: a static site hosted on GitHub Pages with no build step. Edit the HTML/CSS directly and push to `main` to publish.

- Live site: https://kindredcompassgames.github.io/kindred-compass-games/
- Contact/support address used on the site: kindredcompassgames@gmail.com

**The game source code is not in this repo.** Umbral Purge and Amber & Sage Sudoku live somewhere else (on the developer's computer or in other Claude chats/projects). A session continuing game work needs those files uploaded or another repo connected.

## Pages

| File | Page | State |
|---|---|---|
| `index.html` | Studio homepage | Done. Teasers for both games. |
| `umbral-purge.html` | Umbral Purge game page | Done. Worlds, 6 classes, features, v1.30.2 screenshot gallery. |
| `amber-sage.html` (+ `amber-sage.css`) | Amber & Sage Sudoku page | New today. Linked from homepage, game page and footers. |
| `privacy.html` | Privacy policy | **Draft.** See open items below. |
| `support.html` | Support/contact | Done. |

Shared styles are in `style.css`. Fonts: `lexend.woff` (Amber & Sage page).

## Recent work (newest first)

1. Added the Amber & Sage Sudoku page with its own calm styling, screenshots and share image, and linked it across the site.
2. Uploaded the real Umbral Purge v1.30.2 screenshots and the title screen capture.
3. Header now explains the two Umbral Purge editions: **Free with ads** and **Premium, one-time purchase, no ads**.
4. Before that: dedicated Umbral Purge page, homepage simplified to a short teaser, rebrand to the gold compass / sunset / blue fantasy look.

## Open items / next steps

1. **Privacy policy is out of date.**
   - It only covers Umbral Purge. Amber & Sage Sudoku needs to be added.
   - It says the inspected build (v1.22.0) had no ads or analytics, but the site now advertises a **free, ad-supported** edition. Once ads (e.g. AdMob) are in the Android build, the policy must name the ad SDK and describe the data it collects.
   - Check it against the final Android builds and the Google Play Data safety form before publishing either game.
2. **Store links.** No Google Play links yet. Both pages say release date TBA / coming soon. Add the links and release dates when the listings go live.
3. **Children's privacy / target audience** section still needs a decision for each game before Play submission.
4. Optional: the screenshot gallery on `umbral-purge.html` still contains the "Image awaiting upload" placeholder blocks. They are hidden automatically once the image loads, so they only appear if an image file goes missing.

## Conventions

- Keep the site static: no frameworks, no build tools, no tracking scripts.
- Images are `.webp` where possible; share images (`*-share.jpg`, `kc-share.jpg`) are used for link previews via `og:image`.
- Use full `https://kindredcompassgames.github.io/kindred-compass-games/...` URLs in `og:image` tags; relative paths everywhere else.
