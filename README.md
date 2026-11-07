# AuraForge

Real-time, no-code parametric generative art studio. Chaotic energy collisions,
turbulent nebula fields and fractal lightning — rendered live in WebGL2 and
exported as stills or video in six formats, from 9:16 Reels to 2.39:1 cinema.

Tauri v2 (Rust shell) + React / TypeScript / Vite + a pure **WebGL2** renderer.
No three.js, no canvas 2D — the whole image is two GLSL passes, and an export is
that same shader re-rendered frame by frame at full resolution.

---

## Install

Grab the `.dmg` from
**[Releases](https://github.com/ArdaTkn/AuraForge/releases/latest)**, open it,
drag AuraForge into Applications. That is the whole install.

The app then **updates itself**. It checks a signed manifest on launch; when a
newer version exists a small pill appears in the top bar and installing it is
one click. There is nothing to download by hand ever again.

## Run from source

```bash
git clone https://github.com/ArdaTkn/AuraForge.git
cd AuraForge
npm install
npm run fonts      # Satoshi is not committed — see "Fonts" below
npm run app:dev    # Tauri window with hot reload
```

Browser-only (fast shader iteration, no exporting):

```bash
npm run dev        # http://127.0.0.1:1420
```

`ffmpeg` must be on `PATH` for video export (`brew install ffmpeg`).

---

## Updates

The updater is Tauri's, pointed at
`https://github.com/ArdaTkn/AuraForge/releases/latest/download/latest.json`.

Every update is **signed with a minisign key** and verified against the public
key baked into the binary, so a tampered or substituted download is rejected
before it is unpacked. The private key lives at `~/.tauri/auraforge.key` and is
never committed — **if it is lost, no further updates can ever be signed.**

The app checks quietly a few seconds after launch and says nothing when it is up
to date. To check on demand: **⌘K → "Check for updates"**.

### Publishing an update

```bash
npm run release -- 0.2.0 "What changed in this version"
```

That one command:

1. bumps the version in `package.json`, `tauri.conf.json` and `Cargo.toml`;
2. builds and signs the bundle;
3. writes `latest.json` with the signature and the download URL;
4. commits, pushes, and creates the GitHub Release with the tarball, its
   signature, the manifest and the `.dmg`.

Every installed copy picks it up on its next launch.

### Unattended installs

Launching with `AURAFORGE_AUTOUPDATE=1` checks almost immediately and installs
without waiting for a click. Add `AURAFORGE_VERBOSE=1` to see the updater's log
lines from a **release** build — useful for diagnosing a machine you cannot
rebuild.

```bash
AURAFORGE_AUTOUPDATE=1 AURAFORGE_VERBOSE=1 open -a /Applications/AuraForge.app
```

---

## The interface

```
┌──────────────────────────────────────────────────────────────┐
│  AURAFORGE      ⌘K Search        pattern · nodes · fps · seed │
├────┬────────────────────────────────────────────┬────────────┤
│ ⬡  │                                            │  PATTERN   │
│ ❋  │                                            │            │
│ ∿  │              the artwork                   │  one       │
│ ⌗  │              at full height                │  subject   │
│ ◍  │                                            │  at a time │
│ ◐  │                                            │            │
│ ✳  │                                            │            │
│ ⊙  │                                            │            │
│ ⇩  │                                            │            │
│    │                                            │            │
│ ⌘  │                                            │            │
│ ◧  │                                            │            │
│ ⤢  │                                            │            │
└────┴────────────────────────────────────────────┴────────────┘
```

**A rail, not a wall.** One narrow icon rail carries every subject; clicking an
icon swaps a single contextual panel, so no two scrolling control columns are
ever on screen at once.

| | Section | What lives there |
| --- | --- | --- |
| ⬡ | **Scenes** | nine complete looks, thumbnailed by the engine itself |
| ❋ | **Pattern** | the nine archetypes, plus hybrid target and mix |
| ∿ | **Flow** | turbulence, warp passes, shear, vorticity, direction, mirror |
| ⌗ | **Structure** | threads, scatter, sharpness, bands, twist, sparsity |
| ◍ | **Volume** | density, filaments, sparks, volume steps |
| ◐ | **Colour** | 5-stop gradient ramp, mapping mode, hue shift, cycle |
| ✳ | **Post** | bloom, chroma, vignette, posterize, scanlines, grain, grade |
| ⊙ | **Nodes** | one expandable card per node |
| ⇩ | **Export** | format, resolution, stills, video, quality |

Rail footer: **⌘K** palette · **◧** live code · **⤢** full-bleed canvas.

### Keyboard

| Key | Action |
| --- | --- |
| `⌘K` | command palette (actions, scenes, patterns, sections, every parameter) |
| `⌘C` | live code drawer |
| `⌘.` / `F` | hide the panel — full-bleed canvas |
| `⌘Z` / `⇧⌘Z` | undo / redo |
| `1`–`9` | jump to a section |
| `Space` | play / pause |
| `R` / `M` | randomize / mutate |
| `Esc` | close drawer, deselect node |

### Every icon is a drawing, not a character

There is not a single Unicode glyph in the interface. That is deliberate: SF Mono
has no `⌘` or `◧` (they rendered as tofu boxes inside the app) and a handful of
others — `⏮ ⚡ ✳` — carry *emoji presentation*, so macOS painted coloured emoji
into the middle of a neutral grey interface. Everything is an inline SVG in
`src/ui/Icon.tsx`, which also lets every stroke match the 1px hairline language.

### Design language

Taken straight from Arda's portfolio so the tool and the work read as one piece
of design: `#0a0a0a` ground, `#1e1e1e` hairlines, a **neutral** `#d6d6d6`
accent, Syne for headings, Satoshi for interface text, SF Mono for every number,
a film-grain overlay, and no gradients, glow rings or neon anywhere in the
chrome. All the colour in the window comes from the artwork.

### Fonts

Syne (SIL Open Font License) is committed. **Satoshi is not** — Fontshare allows
using it in a product but not redistributing the files, so a clone runs
`npm run fonts` once to fetch them into `public/fonts/`. Everything works
offline afterwards, and the Tauri CSP stays locked to `'self'`.

---

## Export

### Format

The shader derives uv as `(fragCoord − 0.5·resolution) / resolution.y`, so the
**vertical framing is identical at every aspect** and only the horizontal field
of view changes. Switching format therefore *reframes* the composition instead
of stretching it — a 16:9 export is the same image through a wider lens, not a
squashed one.

| Format | Ratio | For | Sizes (Draft / HD / 2K / 4K) |
| --- | --- | --- | --- |
| **Reels** | 9:16 | Reels · Stories · TikTok | 720×1280 → 2160×3840 |
| **Portrait** | 4:5 | Instagram feed | 720×900 → 2160×2700 |
| **Square** | 1:1 | Feed · album art | 720×720 → 2160×2160 |
| **Photo** | 3:2 | photography · print | 1200×800 → 3600×2400 |
| **Landscape** | 16:9 | YouTube · TV · desktop | 1280×720 → 3840×2160 |
| **Cinema** | 2.39:1 | wide banner · title card | 1280×536 → 3840×1608 |

Every size is even, because h.264 refuses odd dimensions. The canvas on screen
reshapes to match, so what you compose is what you get.

### Stills

| | Encoding | Notes |
| --- | --- | --- |
| **PNG** | lossless | every pixel exact, largest file |
| **JPEG** | quality slider | small and universal; slight softness in dark gradients |
| **WebP** | — | shown *disabled* when the platform cannot encode it (see below) |

### Video

h.264 in MP4, 24 / 30 / 60 fps, 1–30 s, `+faststart` so it streams. Frame *N*
is always drawn at `t = N / fps`, so a render is reproducible however busy the
machine is. Frames stream into `ffmpeg`'s stdin one at a time as raw RGBA over
the Tauri IPC raw-body channel — 8.3 MB per frame is never buffered.

### What the quality tiers actually mean

CRF is x264's *constant rate factor*: **lower means better and bigger**. The
chroma format matters just as much — 4:2:0 throws away three quarters of the
colour resolution, which is exactly what phones and social platforms expect,
while 4:4:4 keeps it and is rejected by many players.

| Tier | Setting | Plain meaning |
| --- | --- | --- |
| **Draft** | CRF 28 · veryfast · 4:2:0 | Small and quick. For checking motion, not for posting. |
| **Stream** | CRF 23 · fast · 4:2:0 | Light file for the web. Some softness in gradients. |
| **High** | CRF 18 · medium · 4:2:0 | **The default for Reels, TikTok and YouTube.** Clean at normal viewing. |
| **Master** | CRF 12 · slow · 4:2:0 | Visually lossless. For archiving or re-editing later. |
| **Lossless** | CRF 0 · medium · **4:4:4** | Pixel-for-pixel identical, very large, and social platforms reject it. |

**Rule of thumb: post with `High`. Archive with `Master`. Use `Lossless` only
when handing the file to an editor.**

### Where files go

| Output | Where |
| --- | --- |
| Stills | `~/Pictures/AuraForge/` |
| Video | `~/Movies/AuraForge/` |

Nothing is ever overwritten — a second render becomes `name-2`.

### WebP

`canvas.toBlob('image/webp')` does not fail on macOS — WebKit silently returns a
**PNG** instead. The studio asks for a 1×1 WebP at start-up and disables the
option with the reason when the answer is not WebP. It is also guarded twice:
the encoder verifies the mime it actually got, and the Rust writer sniffs the
magic bytes and refuses a payload that contradicts the requested format.

---

## Live code generator

The **◧** button (or `⌘C`).

* **p5.js** — a complete, runnable sketch at the current output size.
* **GLSL** — the raw WebGL2 fragment shader.

Both are the studio's *own* shader: every parameter is baked in as a `const`,
the palette is folded into a `paletteStop()` chain, the node loops are unrolled
to constant indices with each node's behaviour resolved, and the `uNodes` /
`uPalette` uniforms disappear entirely. The host only supplies `uResolution`
and `uTime`.

---

## Architecture

```
src/
  render/
    shaders/aura.frag        the volume renderer: flow field, 9 archetypes,
                             nodes, palette  (GLSL ES 3.00)
    shaders/post.frag        bloom, chroma, tonemap, posterize, scanlines,
                             vignette, grain, dither
    shaders/fullscreen.vert  gl_VertexID triangle — no vertex buffers
    engine.ts                AuraRenderer: two programs, HDR scene target,
                             cached export target, readback
    types.ts                 parameters, archetypes, node kinds, ASPECTS
    runtime.ts               live renderer + clock handle
  codegen/index.ts           p5.js + GLSL generator (bakes, unrolls, rewrites)
  export/pipeline.ts         frame loop, still encoding, progress
  state/store.ts             zustand: params, nodes, section, aspect, undo
  update.ts                  the updater state machine
  ui/
    shell:                   Rail, Panel, TopBar, Stage, CommandPalette,
                             CodeDrawer, UpdateBadge
    sections:                PatternPicker, groups, PaletteEditor, NodeEditor,
                             SceneGallery, ExportPanel
    shared:                  Icon, Slider, Toggle, Segmented, ColorField,
                             NodeControls
    params.ts                parameter registry (palette + ⌘K jump targets)
  platform.ts                Tauri bridge (no-op in a plain browser)
  selftest.ts                in-app end-to-end export test (env-gated)
  styles/                    bundled fonts + the design system
scripts/
  fetch-fonts.sh             one-time Satoshi download
  install-macos.sh           copy the bundle into /Applications
  release.sh                 version bump → build → sign → publish
```

### Two passes, not one

The volume shader only produces raw radiance; a second full-screen pass does
bloom, chromatic separation, tonemapping, posterize, scanlines, vignette, grain
and an ordered dither. The scene target is **RGBA16F** when
`EXT_color_buffer_float` is available, so bloom works on real HDR values.

### The archetypes

Each is `vec3 pattern(vec2 w, float z, float t)` returning
`(density, filament, paletteT)`:

Braid · Threads · Vortex · Lattice · Rift · Nebula · Storm · Shockwave · Crystal
— plus a hybrid lane that crossfades the active one with any other.

### The nodes

Nine independent behaviours (Attract · Repel · Vortex · Sink · Shear · Burst ·
Ripple · Magnet · Source), each with its own drive, radius, falloff, colour and
colour mix. Influence has **compact support**: exactly zero beyond the radius
you set, so the gizmo on canvas and the effect it drives are the same size.

### Determinism

The image is a pure function of `(uniforms, time)` — no accumulation buffer, no
internal random state — which is what makes the offline renderer trustworthy.

---

## Verification

```bash
npx tsc --noEmit                              # clean
node ./node_modules/vite/bin/vite.js build    # clean
cd src-tauri && cargo build --release         # clean

npm run selftest   # VITE_AURAFORGE_SELFTEST=1 tauri dev
```

The self test pushes a render through **every** output path — three still
formats at three different aspect ratios, and two videos at two ratios and two
quality tiers — and reports each result through the app's own telemetry channel.
Nothing is declared working on the strength of a return value: the Rust writer
sniffs each payload back and the dimensions must agree.

```
SELFTEST ok   codegen p5=23248b glsl=22139b consts=34
SELFTEST ok   still PNG 1080x1920 …selftest-1337-reels.png 1080x1920 3662821B
SELFTEST ok   still JPEG 1920x1080 …selftest-1337-landscape.jpg 1920x1080 669679B
SELFTEST skip still WebP — this webview has no WebP encoder
SELFTEST ok   mp4 reels 1080x1920 high   frames=120 fps=60 4215262B
SELFTEST ok   mp4 landscape 1280x720 draft frames=30 fps=30 118282B
SELFTEST done · all paths passed
```

---

## Gotchas worth knowing

* **The dmg bundler consumes the `.app` it packages.** Running
  `tauri build --bundles dmg` after `--bundles app` deletes the app the previous
  step produced. `scripts/release.sh` runs the dmg first, for that reason.
* Driving the app's store from a browser console via a second
  `import('/src/state/store.ts')` gets you a **separate module instance** and a
  separate store — your changes appear to do nothing. Test by clicking the real
  UI.
* **React StrictMode runs effects twice.** A `useRef` "already ran" guard lets
  the first (later cancelled) run win and the second never happen. Use a
  module-level promise for one-shot work — that is what the scene thumbnails do.
* **`toBlob` lies about unsupported formats.** It returns a PNG rather than
  failing, so always verify `blob.type` after encoding.
* `#version 300 es` must be the first token of a shader source.
* Never call `WEBGL_lose_context.loseContext()` in a renderer's `dispose()` —
  StrictMode's double-mount then grabs a dead context and `compileShader` fails
  with an empty info log.
* GLSL ES 1.00 (p5.js) cannot index arrays with a variable and has no array
  constructors, which is why the generator unrolls node loops and rewrites
  `uPalette[i]` into a `paletteStop(i)` chain.
