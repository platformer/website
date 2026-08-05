# website

Source for [andrewsen.dev](https://andrewsen.dev).

Pages are written in [Typst](https://typst.app) and compiled to HTML by a small
generator in `ssg/`. Typst handles structure and semantics, and CSS handles
presentation.

## Develop

Needs [Typst](https://github.com/typst/typst) 0.13+ on your `PATH` and Node 24+.

```sh
npm install      # @types/node, only for silencing type errors in your editor
npm run dev      # build, watch, and serve at http://localhost:4321
npm run build    # build into dist/
npm run check    # tsc --noEmit
```

## What it does

The Typst documents emit labelled metadata that `ssg/build.ts` reads back after running the Typst compiler.
That allows the Typst code to reference any scripts or stylesheets the page needs, and the build bundles the compiled HTML together with its dependencies.

Other features:

- Typst documents can pick a template.
  The `blog` template provides a table of contents that builds itself from the Typst document's headings.
- Layout primitives, since Typst's own `grid` and `stack` don't survive HTML
  export: `#grid-col` and `#grid-row` for extrinsic sizing, and
  `#flex` for intrinsic sizing
- Typst elements for callouts, collapsibles, quotes, popovers and annotations.
- JS/TS can be embedded in a Typst document and will be bundled as a module.

There's a longer write-up of how it works at
[andrewsen.dev/blog/typst-ssg](https://andrewsen.dev/blog/typst-ssg/).
