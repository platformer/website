#import "/lib/base.typ": *
#import "@preview/elembic:1.1.1" as e: field, types

// Components as elembic elements: typed fields, restyled in bulk from the theme
// in templates.typ. Each pulls in the shared stylesheet on use.
#let _uses-css = style("/lib/components.css")

// kind sets the accent; title optional.
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

// Native <details>; open to start expanded.
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

// Optional attribution.
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

// Native Popover API. `id` must be unique on the page.
#let popover = e.element.declare(
  "popover",
  prefix: "site",
  display: it => {
    _uses-css
    // Per-instance anchor name ties the panel to its trigger.
    let anchor = "--pop-" + it.id
    html.elem("button", attrs: (
      class: "popover-trigger", popovertarget: it.id, style: "anchor-name: " + anchor,
    ), it.trigger)
    // Must stay inline: a block element here splits the surrounding paragraph.
    html.elem("span", attrs: (
      id: it.id, popover: "", class: "popover", style: "position-anchor: " + anchor,
    ), it.body)
  },
  fields: (
    field("id", str, required: true),
    field("trigger", types.option(content), required: true),
    field("body", types.option(content), required: true),
  ),
)

// Shared by the blog index and the home page. `posts` comes from posts.json.
#let post-list(posts, limit: none) = {
  let shown = if limit == none { posts } else { posts.slice(0, calc.min(limit, posts.len())) }
  elem("ul", class: "posts", {
    for post in shown {
      elem("li", class: "post", {
        elem("h3", elem("a", post.title, class: "post-link", href: page-url(post.page)),
             class: "post-title")
        elem("div", post.date, class: "post-meta")
        if post.summary != "" { elem("p", post.summary, class: "post-summary") }
      })
    }
  })
}

// Kept a sibling of <main> for the contentinfo landmark.
#let site-footer() = elem(
  "footer",
  [
    © #datetime.today().year() #site.name
    #h(0.6em) · #h(0.6em)
    #link(site.repo)[Source]
  ],
  class: "site-footer",
)

// Links every section (== and deeper), or renders nothing under two. Floats
// into the left margin where there's room for it.
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
    // Highlight behaviour, shipped with the element.
    raw(read("/lib/scrollspy.ts"), lang: "inline-script")
  }
}
