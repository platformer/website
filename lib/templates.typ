#import "/lib/elements.typ": *
#import "@preview/elembic:1.1.1" as e

// Shared by every template: component defaults, plus the channel that hands
// ```inline-script blocks to the SSG. A page can override a set rule locally.
#let theme(body) = {
  show raw.where(lang: "inline-script"): it => [#metadata(it.text) <inline-script>]
  show: e.set_(callout, kind: "note")
  show: e.set_(details, open: false)
  body
}

// Templates own <main> and the footer; the SSG supplies <head> and the header.

#let base(body) = {
  show: theme
  elem("main", body)
  site-footer()
}

// toc() renders nothing unless the post has enough sections.
#let blog(body) = {
  show: theme
  elem("main", { toc(); body })
  site-footer()
}
