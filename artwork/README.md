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
  -> node artwork/build-seal.mjs       cream ramp, 16 fills, viewBox added
  -> pnpm dlx svgo --config artwork/svgo-trace.config.mjs static/seal.svg
static/seal.svg              115 KB

  -> node artwork/build-lace.mjs       seamless tile, 55 KB
  -> pnpm dlx svgo --config artwork/svgo-trace.config.mjs static/lace.svg
static/lace.svg              18 KB
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
fixes which pattern you get — change it to reshuffle the whole tile.
