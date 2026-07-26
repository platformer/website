# website

Personal site. [Typst](https://typst.app) source, compiled to HTML by a small
custom generator, deployed to GitHub Pages.

## Layout

```
content/            pages (each *.typ becomes a page)
  index.typ           -> /
  blog/index.typ      -> /blog/
  blog/*.typ          -> /blog/<slug>.html
  contact/index.typ   -> /contact/
lib/                Typst library, layered:
  config.typ          site name, nav, source path -> URL
  base.typ            frontmatter, element helpers, head channel
  elements.typ        components (callouts, details, quotes, toc, ...)
  templates.typ       templates (base, blog) and the shared theme
  site.typ            barrel; pages import this
  components.css      component styles, injected on use
  scrollspy.ts        behaviour shipped by #toc()
static/             copied to the site root (styles.css, images)
ssg/build.ts        the generator
ssg/serve.ts        dev server
dist/               build output (git-ignored)
```

Everything is TypeScript. Node 24 runs `ssg/*.ts` directly by stripping types;
browser scripts are transpiled during the build.

## Develop

Needs [Typst](https://github.com/typst/typst) 0.13+ on your `PATH` and Node 24+.
The [elembic](https://typst.app/universe/package/elembic/) package is fetched on
first compile, then cached.

```sh
npm run dev      # build, watch, serve at http://localhost:4321 with live reload
npm run build    # one-shot build into dist/
```

`npm run dev` rebuilds on any change under `content/`, `lib/` or `static/` and
reloads the browser. It polls mtimes rather than using `fs.watch`, since inotify
doesn't fire on the WSL2 `/mnt/c` mount.

If Typst isn't on your `PATH`: `TYPST_BIN=/path/to/typst npm run build`.

`tsconfig.json` is for the editor and `npm run check`; the build never reads it.
Types are stripped at runtime, never checked, so `erasableSyntaxOnly` rejects
what Node can't strip (`enum`, `namespace`, parameter properties).

## Writing a page

Every page picks a template. `base` covers the home page, section indexes and
toys; `blog` adds a table of contents.

```typ
#import "/lib/site.typ": *
#show: base
#meta(title: "My Page")

= Heading
Body text...
```

Both templates live in `lib/templates.typ`, so a new page type means one more
function there.

Posts add a `date`, and optionally a `summary`, which feed the blog index and
the home page:

```typ
#meta(title: "My Post", date: "2026-07-21", summary: "One-line teaser.")
```

## Config and linking

`lib/config.typ` holds the site name and nav. The SSG reads it once per build,
so neither is duplicated in the generator.

```typ
#let site = (
  name: "Andrew Sen",
  nav: (
    (label: "Blog", page: "/content/blog/index.typ"),
    (label: "Contact", page: "/content/contact/index.typ"),
  ),
)
```

Nav entries name a page's source file, not its URL; `page-url` in the same file
derives it (`/content/blog/index.typ` becomes `/blog/`). Two build checks keep
that honest: a nav entry naming a missing file fails, and so does `page-url`
disagreeing with the paths the build writes. A rename can't leave a dead link,
and a change to the URL scheme can't half-apply.

Link between pages the same way:

```typ
#page-link("/content/misc/counter.typ")[Counter]   // -> /misc/counter.html
```

Plain `#link` still handles external URLs and anchors.

## Scripts

Scripts can be TypeScript or JavaScript; the SSG strips types with Node's
built-in transformer. Each is emitted as `<script type="module">`, so it's
deferred: it runs after the DOM is parsed, in document order, head before body.
Modules are isolated, so top-level `const` and `let` in different toys don't
collide.

Inline, as a raw block tagged `inline-script`, removed from the rendered text
and injected at the end of `<body>`:

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

Or as a file, resolved relative to the current `.typ` and linked in `<head>`:

```typ
#script("counter.ts")   // compiled to /misc/counter.js
```

Compiled output mirrors the source path, so `content/misc/counter.ts` becomes
`/misc/counter.js`; scripts from elsewhere in the repo go under `/scripts/`. A
file used by several pages compiles once.

Two limits, both from transpiling each file on its own. Cross-file `import`s
aren't bundled, so keep script files self-contained. And only erasable syntax
works: `enum`, `namespace` and parameter properties throw, which
`erasableSyntaxOnly` catches in the editor first. Swap in esbuild if you outgrow
either.

### Tagging content for scripts

Typst labels don't survive to HTML, so an id has to sit on a real element:

- `#id(name, body)`, an inline `<span id>`, e.g. `#id("count")[0]`
- `#button(name, body)`, a `<button id>`, e.g. `#button("inc")[+]`
- `#elem(tag, body, id: ..., ...attrs)`, the general `html.elem` wrapper, e.g.
  `#elem("div", id: "box")[...]` or `#elem("a", href: "/x")[link]`

## Styles and the head channel

`#style` and `#head` feed a deduplicated `<head>` channel, so an asset requested
many times over (by a repeated component, say) is emitted once.

- `#style("post.css")` links a stylesheet, relative to the current `.typ` or
  from the project root with a leading `/`. The SSG copies it into the build;
  `content/` paths mirror, everything else goes under `/styles/`.
- `#head(tag, ...attrs)` injects any head tag, for fonts, meta or preloads:

```typ
#head("meta", name: "description", content: "...")
#head("link", rel: "preconnect", href: "https://fonts.gstatic.com")
```

`static/styles.css` is always linked; these add to it.

## Components

The building blocks in `lib/elements.typ` are
[elembic](https://typst.app/universe/package/elembic/) elements, so they have
typed fields and can be restyled in bulk. Each registers `lib/components.css`
through the head channel, so that CSS ships only where a component is used. The
interactive ones are native HTML, with no JavaScript.

- `#note[...]`, `#tip[...]`, `#warn[...]`: callouts; all take `title:`, as in
  `#warn(title: "Careful")[...]`. Generic: `#callout(kind: "note", title: ...)[...]`.
- `#details("Summary")[...]`: a collapsible `<details>`; `open: true` starts expanded.
- `#blockquote(by: [Author])[...]`: a quotation with optional attribution.
- `#popover("unique-id", "trigger")[...]`: a popover on the native Popover API.
- `#post-list(posts, limit: n)`: the shared blog listing.
- `#toc()`: table of contents, placed by the `blog` template. Renders nothing
  under two sections; otherwise links every `==` and `===`, floats into the left
  margin when there's room, and ships its own scroll-spy.

### The theme

Component defaults live in one place rather than at each call site. The `theme`
in `lib/templates.typ` holds them as `set_` rules:

```typ
#let theme(body) = {
  show raw.where(lang: "inline-script"): ...  // hand scripts to the SSG
  show: e.set_(callout, kind: "note")         // default callout colour
  show: e.set_(details, open: false)          // collapsibles start closed
  body
}
```

Edit a rule to restyle everywhere; a page can override locally:

```typ
#show: e.set_(details, open: true)      // expand every details on this page
```

## Deploy

`.github/workflows/deploy.yml` builds on every push to `main` and publishes
`dist/` to GitHub Pages. Enable Pages once under Settings > Pages > Source:
GitHub Actions.

Internal links are root-absolute, which suits a user or org site
(`you.github.io`) or a custom domain. A project page under
`you.github.io/website/` would need them prefixed.

## Notes

Typst's HTML export is still experimental, so the build passes `--features
html`. A few PDF-oriented features don't map to HTML and need an `html.elem`
workaround. Note that `typst eval` defaults to the paged target, where
`html.elem` content is dropped along with any metadata inside it; the SSG passes
`--target html` for exactly that reason.
