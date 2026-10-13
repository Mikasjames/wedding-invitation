# artwork/

Source illustrations and the pipeline that turns them into what the site ships.

Nothing in here is published. `static/` is served verbatim, so the VTracer
originals sitting in it would have been deployed alongside the derivatives —
932 KB of unused source on a wedding invitation.

## The pipeline

```
artwork/plant_N.svg          VTracer output, ~330 KB each, 149-222 colours
  -> node artwork/build-plants.mjs     single ink, transparent, viewBox added
  -> pnpm dlx svgo --config artwork/svgo.config.mjs -f static/plants
static/plants/plant_N.svg    ~110 KB each, 1 colour + fill-opacity

artwork/seal-grey.svg        VTracer greyscale trace, 745 KB, 60 greys
artwork/seal-name.svg        VTracer trace of the monogram, 19 KB, 3 paths
  -> node artwork/build-seal.mjs       cream ramp, 16 fills, monogram baked in
  -> pnpm dlx svgo --config artwork/svgo-trace.config.mjs static/seal.svg
static/seal.svg              117 KB

  -> node artwork/build-lace.mjs       seamless tile, 55 KB
  -> pnpm dlx svgo --config artwork/svgo-trace.config.mjs static/lace.svg
static/lace.svg              18 KB

artwork/names.svg            VTracer trace of the names, 3371x2269, 17 paths
  -> node artwork/build-names.mjs       single ink, transparent, cropped to ink
  -> pnpm dlx svgo --config artwork/svgo-trace.config.mjs static/names.svg
static/names.svg             6.2 KB
```

All steps are idempotent: re-running them from the originals reproduces the
committed output byte for byte. Verified, not assumed.

## Two svgo configs, on purpose

`svgo.config.mjs` runs at `floatPrecision: 2`, which is right for the plants.
The seal renders at a maximum of 232px from a 432-unit canvas and the lace is
line art, so integer coordinates are well inside a device pixel at every size
the site uses. `svgo-trace.config.mjs` runs the traced assets at
`floatPrecision: 0` and keeps the `viewBox`; that alone takes the seal from
745 KB to 115 KB. Dropping precision to 1 instead gives 227 KB — the savings are
almost entirely in the fractional tail of the path data.

## The wax seal

`seal.svg` is the cream wax seal on the envelope reveal. It is a VTracer trace,
so like the plants it arrives as fills only, with no `viewBox`.

The 60 greys are not colour, they are **relief** — the trace encodes light from
the upper left, and the greys are its shading. That makes retinting almost free:
`build-seal.mjs` maps the luminance range onto a cream ramp (`INK_LO` to
`INK_HI`) rather than substituting a hue, so every shadow and highlight in the
pressed sprig survives the recolour. Quantising to `LEVELS` (22) collapses the
60 greys to 16 fills with no visible banding at display size.

**The source is `seal-grey.svg`, not `seal.svg`.** The red wax original is still
here as the archival source, but building from it is worse: it carries the
near-white full-canvas backdrop that the plant pipeline drops, and its
luminance range is compressed enough that the cream version washes out. The
greyscale retrace has no backdrop and better tonal separation. Verified by
rendering both.

Both `<g>` wrappers are left in place. The first carries
`transform="scale(0.25)"` and holds a single path; the second carries the fill
that 614 paths inherit. Stripping the tags to flatten the document unbalances the
markup and drops that scale, which moves the whole seal off-canvas.

## The monogram

`seal-name.svg` is the script monogram pressed into the face of the seal, and it
is **baked into `seal.svg` rather than laid over it as a second `<img>`**. Both
reveals already load that one file, so baking it costs no extra request on the
first paint and needs no component or CSS changes at all — positioning, the
`.seal-wax` drop-shadow and both breakpoints' sizing all keep working untouched.

**Its coordinates are pre-multiplied into seal space, not placed under a
`scale()`.** Both render identically, because `floatPrecision: 0` rounds the path
data to whole seal units either way — measured at 4 differing pixels out of 32000
at the seal's largest render size — but pre-scaling is **9 KB smaller**, since it
turns the source's 4-digit numbers into 2- and 3-digit ones. It also leaves the
monogram clear of `cleanupNumericValues` rounding a fractional `scale(0.1216)`,
and makes it ordinary seal-space geometry beside the other 589 paths.

**The monogram is appended to `body` after it is built, not folded into the
string the re-ink pass rewrites.** That is harmless today only by luck: neither
monogram colour is one of the 16 ramp values, so `reink` falls through to its
`?? match` and preserves them. Pick a `MONOGRAM_INK` or `MONOGRAM_HI` that *does*
collide with the cream ramp and it is silently re-mapped to a wax tone.

**The scale is only safe because the path uses `M`, `C` and `Z`, and the build
guards that.** A blanket multiply over the coordinates would destroy an
elliptical arc, whose radii, rotation and two flags are not all lengths. Re-tracing
the monogram is exactly the change that would introduce one.

`NEAR_WHITE_MIN` is the names' `0xD0`, and this trace needs it twice over: it has
the usual full-canvas backdrop, **and** a near-white swash sitting *inside* the
descender of the `L`. Dropped, both are the smudge failure described above.

The build **throws** rather than emitting a seal with no monogram, so a missing
`seal-name.svg` cannot quietly ship a blank wax face.

## The lace

`lace.svg` is the botanical texture on the envelope paper, and it is generated,
not traced. `build-lace.mjs` seeds a PRNG and lays down sprigs and five-petal
blossoms on a `TILE`-sized square, so the pattern is reproducible and there is no
binary asset to keep around.

**Seamlessness is handled by wrap-aware duplication.** Each motif is emitted once
per offset that can actually overlap the tile — a motif near an edge is written
again at `±TILE` on the axes where it would otherwise be clipped. Blindly drawing
all nine copies tripled the file; the reach test keeps it to 55 KB.

The tile is black on transparent. The envelope draws it twice at slightly
different offsets — once dark, once inverted to white — which is what turns a
flat pattern into an emboss, and CSS owns the strength. That is the reason the
colour is baked here even though the lace is pure decoration: a `background-image`
in an `<img>`-less context cannot inherit anything either.

## Why the originals need rewriting

VTracer vectorises a raster, so it emits **fills only** — there is not a single
`stroke` in any of these files. The line art is drawn as filled polygons, and
the gaps between the strokes are filled near-white. One of those near-white
paths is a full-canvas backdrop, so each file renders as gold art sitting on a
cream rectangle. Verified by rendering on rose and on plum: the box shows.

Two further problems, both fixed in `build-plants.mjs`:

- **Colour noise.** 149-222 unique colours per file, from quantising a
  photograph. A handful of golds would cover it. Every surviving fill is
  rewritten to inherit one ink, with `fill-opacity` carrying the original tone,
  so the tonal relationships survive and the palette collapses to one colour.
- **No `viewBox`.** Just `width`/`height`, which will not scale cleanly.

## Two judgement calls worth knowing about

**Near-white fills are dropped rather than made transparent.** Anything with
`min(R,G,B) >= 0xEF` goes — the backdrop, but also the small highlights
between strokes. Keeping them would be actively wrong: they are invisible on
ivory, and re-inking them turns them into visible gold smudges. The interior
shading that gives the petals their modelling (`#E9DEBD` and darker) is well
below the threshold and is preserved.

**The ink is `#CFB76F`, the source's own gold — not `--color-gold-deep`.**
That token was deepened to `#7a5a20` for text contrast against the rose field,
and that is the right call for type. At hairline stroke width it is the wrong
one: it renders the line art as heavy bronze and fills the petals in solid.
Tested against four candidates; the source gold preserves the delicacy.

The opacity curve is gamma 1.6, not linear. The darkness histogram is bunched at
0.10-0.15 (the pale interior washes), so a linear map lands the bulk of the
paths near 0.5 opacity and the petals read blotchy.

## Why the colour is baked into the file

It is a `fill` presentation attribute on the root `<svg>`, **not**
`currentColor`. These load via `<img>`, and an SVG in an `<img>` is a separate
document that cannot inherit the page's `color` — `currentColor` there renders
black. Inlining the SVG would work, but it would put ~110 KB of path data into
the prerendered HTML, on the page we just made fast.

The names are the exception that proves the rule would be wrong to extend
here. At 6.2 KB inlining costs nothing, so `names.svg` could carry
`currentColor` and follow the page ink. It is still baked, because the hero
renders it through the same `<img>` as everything else and there is no second
code path to keep honest for one asset.

The trade-off: CSS can set size, position and opacity, but not the colour.
Retinting means editing `INK` in `build-plants.mjs` and re-running.

## Re-tuning

Edit the constants at the top of `build-plants.mjs` — `INK`,
`OPACITY_FLOOR`, `OPACITY_GAMMA` — then run both commands. Render the result on
rose and on plum as well as ivory; the transparency bug was invisible on the
background the art actually shipped against, which is the whole reason to check
it on the ones it does not.

For the seal, `INK_LO` / `INK_HI` set the ramp and `LEVELS` the quantisation. For
the lace, `TILE`, `SPRIG_COUNT` and `BLOSSOM_COUNT` set the density, and `SEED`
fixes which pattern you get — change it to reshuffle the whole tile. For the
names, `INK` is the single colour and `NEAR_WHITE_MIN` is the cut-off.

For the monogram on the seal, `MONOGRAM_INK` is the deboss and `MONOGRAM_W` its
width in seal units — `MONOGRAM_CX` / `MONOGRAM_CY` place it, and the height
follows from the source's aspect. Keep `MONOGRAM_INK` just darker than
`INK_LO` — enough to read, not so dark it stops looking like wax — and off the
cream ramp's 16 values, or the re-ink pass will eat it.

## The hero names

`names.svg` is the hero wordmark, traced from the same script the site sets its
names in. It arrives with the two usual VTracer problems — a near-white
full-canvas backdrop and pale fills between the strokes — plus a lot of dead
canvas: the ink occupies 25% of the 3371x2269 source. `build-names.mjs` drops
the backdrop, re-inks every surviving path to one colour, and crops the viewBox
to the ink, which is what takes it from 41 KB to 6.2 KB.

**`NEAR_WHITE_MIN` is `0xD0`, not the plants' `0xEF`, and the difference
matters.** Unlike the plants, this is a flat script trace with no interior
shading: the ink sits at luminance 73-120 and the highlights jump to 212-232,
with nothing in between. At `0xEF` the four paths in that 212-232 band survive
the cut and are re-inked into solid blobs — the exact smudge failure described
above, and the reason the cut has to sit below the band rather than above it.

**The crop is computed from the bezier control points**, which overshoot the
curve rather than understate it. The box is at most a unit or two larger than
the true ink, so it never clips, and it keeps the script independent of any
hand-measured numbers.
