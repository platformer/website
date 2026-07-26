#import "/lib/base.typ": *
#import "@preview/elembic:1.1.1" as e: field, types

// Post components, as elembic elements: typed fields, restylable in bulk from
// templates.typ. Each registers the shared stylesheet on use, and the SSG links
// it once per page.
#let _uses-css = style("/lib/components.css")

// Callout. kind sets the accent; title optional.
#let callout = e.element.declare(
  "callout",
  prefix: "site",
  display: it => {
    _uses-css
    elem("aside", {
      if it.title != none { elem("p", it.title, class: "callout-title") }
      elem("div", it.body, class: "callout-body")
    }, class: "callout callout-" + it.kind)
  },
  fields: (
    field("body", types.option(content), required: true),
    field("kind", str, default: "note"),
    field("title", types.option(content), default: none),
  ),
)
#let note(body, ..a) = callout(body, kind: "note", ..a.named())
#let tip(body, ..a) = callout(body, kind: "tip", ..a.named())
#let warn(body, ..a) = callout(body, kind: "warn", ..a.named())

// Collapsible. Native <details>; open to start expanded.
#let details = e.element.declare(
  "details",
  prefix: "site",
  display: it => {
    _uses-css
    let attrs = (class: "details")
    if it.open { attrs.insert("open", "") }
    html.elem("details", attrs: attrs, {
      html.elem("summary", it.summary)
      elem("div", it.body, class: "details-body")
    })
  },
  fields: (
    field("summary", types.option(content), required: true),
    field("body", types.option(content), required: true),
    field("open", bool, default: false),
  ),
)

// Quote with optional attribution.
#let blockquote = e.element.declare(
  "blockquote",
  prefix: "site",
  display: it => {
    _uses-css
    html.elem("blockquote", attrs: (class: "quote"), {
      elem("div", it.body, class: "quote-body")
      if it.by != none { elem("footer", it.by, class: "quote-by") }
    })
  },
  fields: (
    field("body", types.option(content), required: true),
    field("by", types.option(content), default: none),
  ),
)

// Popover via the native Popover API; id must be unique on the page. The field
// is `trigger` because elembic reserves `label`.
#let popover = e.element.declare(
  "popover",
  prefix: "site",
  display: it => {
    _uses-css
    // Per-instance anchor name links trigger to panel for CSS anchor positioning.
    let anchor = "--pop-" + it.id
    html.elem("button", attrs: (
      class: "popover-trigger", popovertarget: it.id, style: "anchor-name: " + anchor,
    ), it.trigger)
    html.elem("div", attrs: (
      id: it.id, popover: "", class: "popover", style: "position-anchor: " + anchor,
    ), it.body)
  },
  fields: (
    field("id", str, required: true),
    field("trigger", types.option(content), required: true),
    field("body", types.option(content), required: true),
  ),
)

// Site footer. A sibling of <main>, so it keeps its contentinfo landmark.
#let site-footer() = elem(
  "footer",
  [© #datetime.today().year() #site.name],
  class: "site-footer",
)

// Table of contents. Place it in a post; it links every section (== and deeper)
// and renders nothing if there are fewer than two. Typst assigns the heading
// ids and anchors; the CSS floats it into the left margin when there's room.
#let toc() = context {
  let heads = query(heading).filter(it => it.level >= 2)
  if heads.len() >= 2 {
    _uses-css
    elem("div", elem("nav", {
      elem("p", "On this page", class: "toc-title")
      elem("ul", {
        for h in heads {
          elem("li", link(h.location(), h.body), class: "toc-l" + str(h.level))
        }
      })
    }, class: "toc"), class: "toc-col")
    // Ship the highlight behavior with the element via the inline-script channel.
    raw(read("/lib/scrollspy.ts"), lang: "inline-script")
  }
}
