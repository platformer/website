# website

Personal site. Source is [Typst](https://typst.app); a small custom static site
generator compiles it to HTML. Deployed to GitHub Pages via GitHub Actions.

## Layout

```
content/            pages (each *.typ becomes a page)
  index.typ           -> /
  blog/index.typ      -> /blog/
  blog/*.typ          -> /blog/<slug>.html
  misc/index.typ      -> /misc/
  misc/*.typ          -> /misc/<slug>.html
lib/site.typ        shared Typst helpers (frontmatter, tagging, template)
static/             copied verbatim to the site root (styles.css, images, ...)
ssg/build.mjs       the generator
ssg/serve.mjs       local preview server
dist/               build output (git-ignored)
```

## Develop

Requires [Typst](https://github.com/typst/typst) 0.13+ on your `PATH` and
Node 20+.

```sh
npm run dev      # build, watch sources, serve at http://localhost:4321 (live reload)
npm run build    # one-shot production build -> dist/
```

`npm run dev` rebuilds whenever anything under `content/`, `lib/`, or `static/`
changes and reloads the browser. It polls file mtimes rather than using
`fs.watch`, because inotify doesn't fire on WSL2's `/mnt/c` mount.

If Typst isn't on your `PATH`, point the build at it:
`TYPST_BIN=~/.local/bin/typst npm run build`.

## Writing a page

Every page starts the same way:

```typ
#import "/lib/site.typ": *
#show: template
#meta(title: "My Page")

= Heading
Body text...
```

Blog posts add a `date` (and optionally a `summary`); these feed the blog
index:

```typ
#meta(title: "My Post", date: "2026-07-21", summary: "One-line teaser.")
```

## Scripts (TypeScript or JavaScript)

Scripts may be written in TypeScript or JavaScript; the SSG transpiles TS to
browser JS (type-stripping via Node's built-in transformer). There are two ways
to attach a script to a page.

All scripts are emitted as `<script type="module">`, which is deferred by
default: they run after the DOM is parsed (so DOM access is always safe), in
document order — head scripts before body scripts. Each module is isolated, so
top-level `const`/`let` in different toys never collide.

**Inline** — a raw block tagged `inline-script`. It is removed from the rendered
text and injected at the end of `<body>` as a `<script type="module">`:

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

**External file** — `#script("path")` loads a `.ts`/`.js` file (path relative to
the current `.typ`) as a `<script type="module">` in the `<head>`:

```typ
#script("counter.ts")   // compiled to /misc/counter.js and linked in <head>
```

Compiled output mirrors the source path (`content/misc/counter.ts` →
`/misc/counter.js`); a script referenced from elsewhere in the repo goes under
`/scripts/`. The same file referenced by multiple pages is compiled once.

> **Limitation:** each file is transpiled independently — types are stripped and
> enums/namespaces are lowered, but cross-file `import`s are **not** bundled.
> Keep script files self-contained. If you need bundling later, swap the
> transpile step for esbuild.

### Tagging content for scripts

Typst labels don't survive to HTML, so an id must ride on a real element — these
helpers emit one:

- `#id(name, body)` — inline `<span id="…">`, e.g. `#id("count")[0]`
- `#button(name, body)` — `<button id="…">`, e.g. `#button("inc")[+]`
- `#elem(tag, body, id: …, …attrs)` — general wrapper around `html.elem` for
  anything else: `#elem("div", id: "box")[…]`, `#elem("a", href: "/x")[link]`

## Deploy

`.github/workflows/deploy.yml` builds on every push to `main` and publishes
`dist/` to GitHub Pages. Enable Pages once under **Settings → Pages → Source:
GitHub Actions**.

**Base path:** internal links are root-absolute (`/blog/`, `/styles.css`), which
is correct for a user/org site (`you.github.io`) or a custom domain. A
*project* page served under `you.github.io/website/` would need those paths
prefixed — simplest fix is a custom domain or a user/org repo.

## Notes

- Typst's HTML export is still experimental; the build passes `--features html`.
  Some PDF-oriented features don't map to HTML and may need an `html.elem`
  workaround.
