# website

Personal site. The source is [Typst](https://typst.app), compiled to HTML by a
small custom static site generator and deployed to GitHub Pages with GitHub
Actions.

## Layout

```
content/            pages (each *.typ becomes a page)
  index.typ           -> /
  blog/index.typ      -> /blog/
  blog/*.typ          -> /blog/<slug>.html
  misc/index.typ      -> /misc/
  misc/*.typ          -> /misc/<slug>.html
lib/                Typst library, layered:
  base.typ            frontmatter, element helpers, head channel
  elements.typ        components (callouts, details, quotes, ...)
  templates.typ       page template and theme
  site.typ            barrel; pages import this
static/             copied verbatim to the site root (styles.css, images)
ssg/build.mjs       the generator
ssg/serve.mjs       dev server
dist/               build output (git-ignored)
```

## Develop

Needs [Typst](https://github.com/typst/typst) 0.13+ on your `PATH` and Node 20+.
The [elembic](https://typst.app/universe/package/elembic/) package is fetched on
first compile (one network round-trip, then cached).

```sh
npm run dev      # build, watch, serve at http://localhost:4321 with live reload
npm run build    # one-shot production build into dist/
```

`npm run dev` rebuilds on any change under `content/`, `lib/`, or `static/` and
reloads the browser. It polls mtimes instead of using `fs.watch`, since inotify
doesn't fire on the WSL2 `/mnt/c` mount.

If Typst isn't on your `PATH`, point the build at it with
`TYPST_BIN=/path/to/typst npm run build`.

## Writing a page

Every page opens the same way:

```typ
#import "/lib/site.typ": *
#show: template
#meta(title: "My Page")

= Heading
Body text...
```

Blog posts add a `date`, and optionally a `summary`, which feed the blog index:

```typ
#meta(title: "My Post", date: "2026-07-21", summary: "One-line teaser.")
```

## Scripts (TypeScript or JavaScript)

Scripts can be TypeScript or JavaScript; the SSG strips TS types to browser JS
with Node's built-in transformer. Every script is emitted as
`<script type="module">`, so it is deferred: it runs after the DOM is parsed, in
document order, head scripts before body scripts. Modules are isolated, so
top-level `const` and `let` in different toys don't collide. Two ways to attach
one.

Inline, as a raw block tagged `inline-script`. It is removed from the rendered
text and injected at the end of `<body>`:

````typ
Clicks: #id("count")[0]

#button("bump")[Click me]

```inline-script
const out = document.getElementById("count") as HTMLElement;
let n: number = 0;
document.getElementById("bump")!.addEventListener("click", () => {
  out.textContent = String(++n);
});
```
````

Or as an external file with `#script("path")`, resolved relative to the current
`.typ` and linked as a module in `<head>`:

```typ
#script("counter.ts")   // compiled to /misc/counter.js, linked in <head>
```

Compiled output mirrors the source path, so `content/misc/counter.ts` becomes
`/misc/counter.js`; a script referenced from elsewhere in the repo goes under
`/scripts/`. A file used by several pages is compiled once.

Each file is transpiled on its own: types are stripped and enums lowered, but
cross-file `import`s are not bundled, so keep script files self-contained. Swap
the transpile step for esbuild if you need bundling later.

### Tagging content for scripts

Typst labels don't survive to HTML, so an id has to sit on a real element. These
emit one:

- `#id(name, body)`, an inline `<span id>`, e.g. `#id("count")[0]`
- `#button(name, body)`, a `<button id>`, e.g. `#button("inc")[+]`
- `#elem(tag, body, id: ..., ...attrs)`, the general `html.elem` wrapper, e.g.
  `#elem("div", id: "box")[...]` or `#elem("a", href: "/x")[link]`

## Styles and the head channel

`#style` and `#head` both feed a deduplicated `<head>` channel, so requesting the
same asset repeatedly (say, from a component used many times) emits it once.

- `#style("post.css")` links a stylesheet. The path is relative to the current
  `.typ`, or from the project root if it starts with `/`. The SSG copies the file
  into the build; `content/` paths mirror, everything else goes under `/styles/`.
- `#head(tag, ...attrs)` injects any head tag, for fonts, meta, preloads, or
  external CSS/JS:

```typ
#head("meta", name: "description", content: "...")
#head("link", rel: "preconnect", href: "https://fonts.gstatic.com")
```

`static/styles.css` is always linked; these add to it.

## Components

The post building blocks in `lib/elements.typ` are
[elembic](https://typst.app/universe/package/elembic/) elements, so they have
typed fields and can be restyled in bulk. Each registers its stylesheet
(`lib/components.css`) through the head channel, so the CSS ships only on pages
that use a component. The interactive ones are native HTML, with no JavaScript.

- `#note[...]`, `#tip[...]`, `#warn[...]`: callout boxes; all take `title:`, as in
  `#warn(title: "Careful")[...]`. Generic form: `#callout(kind: "note", title: ...)[...]`.
- `#details("Summary")[...]`: a collapsible `<details>`; pass `open: true` to start
  expanded.
- `#blockquote(by: [Author])[...]`: a quotation with optional attribution.
- `#popover("unique-id", "trigger")[...]`: a button-triggered popover using the
  native Popover API. The `id` must be unique on the page.

### The theme

Because the components are elembic elements, their defaults live in one place
rather than at each call site. The `theme` in `lib/templates.typ`, applied by
`template`, holds them as `set_` rules:

```typ
#let theme(body) = {
  show: e.set_(callout, kind: "note")   // default callout colour
  show: e.set_(details, open: false)    // collapsibles start closed
  body
}
```

Edit a rule there to restyle everywhere. A single page can override locally:

```typ
#show: e.set_(details, open: true)      // expand every details on this page
```

## Deploy

`.github/workflows/deploy.yml` builds on every push to `main` and publishes
`dist/` to GitHub Pages. Enable Pages once under Settings > Pages > Source:
GitHub Actions.

Internal links are root-absolute (`/blog/`, `/styles.css`), which suits a user or
org site (`you.github.io`) or a custom domain. A project page served under
`you.github.io/website/` would need those paths prefixed, so a custom domain or a
user/org repo is the simplest fix.

## Notes

Typst's HTML export is still experimental, so the build passes `--features html`.
A few PDF-oriented features don't map to HTML and may need an `html.elem`
workaround.
