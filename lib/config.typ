// Site-wide settings. The SSG reads this too, once per build, so it's the only
// place they live.

// Where a source file ends up on the site. Here rather than in the SSG so the
// two can't disagree about a link.
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

// Nav points at each page's source; the href is derived and the SSG checks the
// file exists, so a rename fails the build.
#let _nav = (
  (label: "Blog", page: "/content/blog/index.typ"),
  (label: "Contact", page: "/content/contact/index.typ"),
)

#let site = (
  name: "Andrew Sen",
  nav: _nav.map(it => (label: it.label, page: it.page, href: page-url(it.page))),
)
