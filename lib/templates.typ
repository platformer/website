#import "/lib/elements.typ": *
#import "@preview/elembic:1.1.1" as e

// Shared by every template: component defaults plus the channel that hands
// ```inline-script blocks to the SSG. Change a set rule to restyle in bulk; a
// page can still override locally with its own #show: e.set_(...).
#let theme(body) = {
  show raw.where(lang: "inline-script"): it => [#metadata(it.text) <inline-script>]
  show: e.set_(callout, kind: "note")
  show: e.set_(details, open: false)
  body
}

// Templates own the page body: <main> plus the footer. The SSG supplies only
// the surrounding document (<head> and the site header).

// Plain page: home, section indexes, toys.
#let base(body) = {
  show: theme
  elem("main", body)
  site-footer()
}

// Blog post: adds the table of contents, which renders itself only when the
// post has enough sections.
#let blog(body) = {
  show: theme
  elem("main", { toc(); body })
  site-footer()
}
