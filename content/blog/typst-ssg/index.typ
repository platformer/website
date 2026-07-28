#import "/lib/site.typ": *
#show: blog
#meta(
  title: "How this site is built",
  date: "2026-07-26",
  summary: "Typst source, a few hundred lines of TypeScript, and a metadata channel that ties them together.",
)

= How this site is built

The source of this site is #link("https://typst.app")[Typst], the typesetting
language, compiled to HTML by about 500 lines of TypeScript. There is no
framework, no bundler, and one dependency, which is a types package. This post
covers why Typst, the mechanism the whole thing rests on, and what the generator
does with a page.

== Why Typst

Typst is a markup language with a real programming language inside it. Prose is
the default, and you drop into code with `#` when you want it. That mix is what
makes it work as a source language for a website. A page is mostly text, but it
can also define functions, read a JSON file at compile time, or ask questions
about its own contents.

The last part matters more than it sounds. Typst can introspect a document while
compiling it, which is how the table of contents on the left of this page works:

```typ
#let toc() = context {
  let heads = query(heading).filter(it => it.level >= 2)
  if heads.len() >= 2 {
    // ...render a link per heading
  }
}
```

`query(heading)` sees every heading in the document, and `link(h.location(), ...)`
points at it. Typst assigns the anchor ids itself, so the sidebar and the
headings cannot drift apart.

== HTML export gives you tags, not styles

Typst 0.13 added an HTML export target, and it is semantic-first. A `=` heading
becomes an `<h2>`, `*bold*` becomes `<strong>`, and a fenced code block becomes
`<pre><code>` with syntax highlighting already applied.

What it does not do is carry Typst's visual model across:

#table(
  columns: 2,
  [`#strong`, `#emph`, `#link`, raw blocks], [semantic tags, as you'd hope],
  [`#text(fill: red, size: 20pt)`], [plain text; colour and size dropped],
  [`#block(fill: ..., inset: ..., radius: ...)`], [a bare `<div>`],
  [`#align`, `#pad`], [ignored, with a warning],
)

So presentation lives in CSS, and Typst owns structure, semantics and class
names. That division is worth taking as given rather than fighting.

#note[
  There is an escape hatch. `html.frame` renders Typst content to inline SVG and
  preserves arbitrary styling, at the cost of selectable text and dark mode. It
  suits diagrams, not paragraphs.
]

== The metadata channel

Almost everything in this setup rides on one mechanism. A page emits a labelled
value that renders as nothing:

```typ
#let meta(..args) = [#metadata(args.named()) <page-meta>]
```

and the generator asks for it back:

```
typst eval --target html --in page.typ 'query(<page-meta>).map(it => it.value)'
```

That single trick carries the frontmatter, the embedded scripts, the stylesheets
a page wants, and any extra `<head>` tags. Four channels, one pattern:

```typ
#let style(path)       = [#metadata(path) <style-src>]
#let script(path)      = [#metadata(path) <script-src>]
#let head(tag, ..attrs) = [#metadata((tag: tag, attrs: attrs.named())) <head-tag>]
```

The generator collects each channel and deduplicates it, which is what makes
component CSS work: a component asks for its stylesheet every time it is used,
and the page links it once.

== Elements

Typst labels do not survive into HTML, so anything a script needs to find has to
sit on a real element. One helper covers it:

```typ
#let elem(tag, body, id: none, ..attrs) = {
  let a = attrs.named()
  if id != none { a.insert("id", id) }
  html.elem(tag, attrs: a, body)
}

#let id(name, body) = elem("span", body, id: name)
#let button(name, body) = elem("button", body, id: name)
```

`#elem` is the general wrapper and everything else is built from it, including
every component below.

== Components

The components are #link("https://typst.app/universe/package/elembic/")[elembic]
elements, which gives them typed fields and, more usefully, bulk restyling. Their
defaults live in one `theme` function rather than at each call site, so
`e.set_(details, open: true)` expands every collapsible on the site.

Here they are, with the code that produces them.

=== Callouts

```typ
#note[A plain note for context.]
#warn(title: "Careful")[This one has a title.]
```

#note[A plain note for context.]

#warn(title: "Careful")[This one has a title.]

=== Collapsibles and quotes

```typ
#details("Implementation detail")[
  Built on the native `<details>` element, so it needs no JavaScript.
]

#blockquote(by: [Ada Lovelace])[
  The Analytical Engine weaves algebraic patterns.
]
```

#details("Implementation detail")[
  Built on the native `<details>` element, so it needs no JavaScript.
]

#blockquote(by: [Ada Lovelace])[
  The Analytical Engine weaves algebraic patterns.
]

=== Popovers

```typ
Hover facts go in a #popover("pv-post", "popover")[Native Popover API,
anchored with CSS anchor positioning.].
```

Hover facts go in a #popover("pv-post", "popover")[Native Popover API, anchored
with CSS anchor positioning. Chromium anchors it under the trigger; elsewhere it
falls back to centred.].

Both the collapsible and the popover are native HTML. The only JavaScript on
this page is the scroll-spy driving the sidebar, and the counter below.

== Scripts

A show rule in the template catches raw blocks tagged `inline-script` and hands
them to the generator instead of rendering them:

```typ
show raw.where(lang: "inline-script"): it => [#metadata(it.text) <inline-script>]
```

So a toy can carry its own behaviour. The generator strips the types and injects
the result as a deferred module. Written in the page, this:

````typ
Clicks: #id("demo-count")[0]

#button("demo-go")[Click me]

```inline-script
const out = document.getElementById("demo-count") as HTMLElement;
let n: number = 0;
document.getElementById("demo-go")!.addEventListener("click", () => {
  out.textContent = String(++n);
});
```
````

produces this, and it works:

Clicks: #id("demo-count")[0]

#button("demo-go")[Click me]

```inline-script
const out = document.getElementById("demo-count") as HTMLElement;
let n: number = 0;
document.getElementById("demo-go")!.addEventListener("click", () => {
  out.textContent = String(++n);
});
```

Larger scripts go in their own file with `#script("toy.ts")`, which compiles to
a sibling `.js` and links it in the head. Each post is a directory with an
`index.typ` inside, so a script like that sits next to the prose it belongs to
and is emitted next to the published page. Files are transpiled one at a time by
Node's built-in type stripping, so there is no bundler, and no cross-file
imports either.

The same channel is how `#toc()` ships the scroll-spy. The element reads its own
TypeScript at compile time and emits it as an inline script:

```typ
raw(read("/lib/scrollspy.ts"), lang: "inline-script")
```

The generator has no idea a table of contents exists. It just injects whatever
inline scripts a page happened to produce.

== What the generator does

For each `.typ` under `content/`, two Typst invocations:

+ `typst compile --format html`, and lift the `<body>` out of the result.
+ One `typst eval` that returns every metadata channel at once.

Then it wraps the body in a shell, resolves and copies any scripts and
stylesheets, and writes the file. The templates emit `<main>` and the footer
themselves, so the shell contributes only `<head>` and the site header.

Two passes, because the blog index and the home page read `posts.json` at compile
time, so the frontmatter of every post has to be collected before anything
compiles.

That query being a single call is worth the awkward string it lives in. Process
startup dominates the build: an individual `typst` call takes about 70ms, and
compilation is a small fraction of that. Asking five separate questions per page
made the build three times slower than asking one.

== Things that bit me

#warn(title: "Wrong target")[
  `typst eval` defaults to the paged target, which discards `html.elem`
  content. Once the templates wrapped each page in `<main>`, every metadata
  query returned nothing and titles fell back to the site name, with no error.
  Pass `--target html` to eval so it introspects the same document the compile
  produces.
]

Three smaller ones. Media queries resolve `rem` against the browser default
rather than your root font size, so with an 18px root a `72rem` breakpoint fires
at 1152px rather than 1296px. Author styles beat the user agent stylesheet
whatever the specificity, so styling `display` on a `[popover]` unscoped leaves
the panel permanently open. And elembic reserves `label` as a field name.

== Worth it?

For a personal site, yes. Embedding JavaScript and generating a table of
contents are the parts that sound hardest and are in fact the easiest, because
both reduce to introspection. The friction is all in HTML export being young:
features that map cleanly to PDF sometimes do not map at all, and they tend to
fail quietly rather than loudly.

About 1300 lines all in, counting the Typst library and the stylesheets. The
#link("https://github.com/platformer/website")[repository] is public.
