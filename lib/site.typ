// Shared site library. Every content page starts with:
//   #import "/lib/site.typ": *
//   #show: template
//
// The generator (ssg/build.mjs) compiles each page to HTML, then reads the
// metadata this file produces to build <title> tags, the blog index, and to
// inject embedded JavaScript.

// --- Page frontmatter -------------------------------------------------------
// Read by the SSG. Blog posts should include a `date` (YYYY-MM-DD) and may
// include a `summary`.
//   #meta(title: "Hello", date: "2026-07-21", summary: "...")
#let meta(..args) = [#metadata(args.named()) <page-meta>]

// --- HTML elements ----------------------------------------------------------
// A thin, unrestrictive wrapper around html.elem. Pass a body, and optionally
// an `id` or any other HTML attributes as named arguments:
//   #elem("section")[...]
//   #elem("div", id: "box")[...]
//   #elem("a", href: "/x", class: "btn")[link]
//
// Note: Typst labels/metadata do NOT survive to HTML, so an id has to ride on a
// real element — this (and its shorthands below) is the only way to tag output.
#let elem(tag, body, id: none, ..attrs) = {
  let a = attrs.named()
  if id != none { a.insert("id", id) }
  html.elem(tag, attrs: a, body)
}

// Tag inline content with an id so scripts can reach it via getElementById:
//   The count is #id("count")[0].     ->  <span id="count">0</span>
// For block-level content, use #elem("div", id: "...")[...].
#let id(name, body) = elem("span", body, id: name)

// A button (very common in toys):
//   #button("inc")[+]                 ->  <button id="inc">+</button>
#let button(name, body) = elem("button", body, id: name)

// --- External scripts -------------------------------------------------------
// Load an external .ts or .js file as a page-level (head) module script. The
// path is relative to the current .typ file. The SSG transpiles TypeScript and
// emits the compiled .js alongside the pages, referenced via <script src=...>.
//   #script("counter.ts")
#let script(path) = [#metadata(path) <script-src>]

// --- Template ---------------------------------------------------------------
// Activates the inline-script mechanism. Any ```inline-script raw block is
// pulled out of the rendered body and exposed as `<inline-script>` metadata;
// the SSG collects these and injects them as <script> tags in the final page.
#let template(body) = {
  show raw.where(lang: "inline-script"): it => [#metadata(it.text) <inline-script>]
  body
}
