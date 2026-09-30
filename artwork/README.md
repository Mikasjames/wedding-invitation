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
```

Both steps are idempotent: re-running them from the originals reproduces the
committed output byte for byte. Verified, not assumed.

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
