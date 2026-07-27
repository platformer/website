// Site-wide settings, read by both Typst and the build.

// Where a source file ends up on the site.
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

// Entries name a page's source; the href is derived and the build fails if the
// file is missing.
#let _nav = (
  (label: "Blog", page: "/content/blog/index.typ"),
  (label: "Contact", page: "/content/contact/index.typ"),
)

#let site = (
  name: "Andrew Sen",
  repo: "https://github.com/platformer/website",
  nav: _nav.map(it => (label: it.label, page: it.page, href: page-url(it.page))),
)
