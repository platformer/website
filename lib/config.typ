// Site-wide settings. The SSG reads this too (one `typst eval` per build), so
// it's the only place these live.

// Where a content source file ends up on the site. Defined here rather than in
// the SSG so Typst and the generator can't disagree about a link.
//   /content/index.typ         -> /
//   /content/blog/index.typ    -> /blog/
//   /content/misc/counter.typ  -> /misc/counter.html
#let page-url(path) = {
  let p = path
  if p.starts-with("/content/") { p = p.slice("/content".len()) }
  if p.ends-with(".typ") { p = p.slice(0, p.len() - ".typ".len()) + ".html" }
  if p.ends-with("/index.html") { p = p.slice(0, p.len() - "index.html".len()) }
  p
}

// Nav entries point at the page's source, not its URL; the href is derived.
// The SSG checks each page exists, so a rename fails the build.
#let _nav = (
  (label: "Blog", page: "/content/blog/index.typ"),
  (label: "Misc", page: "/content/misc/index.typ"),
)

#let site = (
  name: "Andrew Sen",
  nav: _nav.map(it => (label: it.label, page: it.page, href: page-url(it.page))),
)
