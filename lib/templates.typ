#import "/lib/elements.typ": *
#import "@preview/elembic:1.1.1" as e

// Component defaults and the inline-script channel, shared by every template.
// A page can override any set rule locally.
#let theme(body) = {
  show raw.where(lang: "inline-script"): it => [#metadata(it.text)<inline-script>]
  // Each heading closes the previous section, so its annotations land there.
  show heading: it => { _annotation-flush(in-heading: true); _render-heading(it) }
  show: e.set_(callout, kind: "note")
  show: e.set_(details, open: false)
  body
}

// Templates own <main> and the footer; the SSG supplies <head> and the header.

#let base(body) = {
  show: theme
  elem("main", { body; _annotation-flush() }, id: "content")
  site-footer()
}

// toc() renders nothing unless the post has enough sections.
#let blog(body) = {
  show: theme
  elem("main", { toc(); body; _annotation-flush() }, id: "content")
  site-footer()
}
