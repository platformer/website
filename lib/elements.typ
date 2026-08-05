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

// Layout primitives, since Typst's own grid and stack are dropped by HTML
// export. Each argument is one cell; cells centre their content vertically and
// never force the page wider than it is.

#let _cells(items) = { for c in items { elem("div", c, class: "cell") } }

// Cells stacked vertically.
//   #grid-col[first][second]
#let grid-col(..cells) = {
  _uses-css
  elem("div", _cells(cells.pos()), class: "grid-col")
}

// Cells side by side, stacking below a narrow breakpoint. `cols` sets relative
// widths; the default splits evenly.
//   #grid-row[left][right]
//   #grid-row(cols: (2, 1))[wide][narrow]
#let grid-row(..cells, cols: none) = {
  _uses-css
  let items = cells.pos()
  let template = if cols == none {
    "repeat(" + str(items.len()) + ", 1fr)"
  } else {
    cols.map(c => str(c) + "fr").join(" ")
  }
  elem("div", _cells(items), class: "grid-row", style: "--cols: " + template)
}

// Flex row. Cells wrap to the next line once they no longer fit at `basis`,
// so a pair becomes a stack on a phone without a breakpoint.
//   #flex[left][right]
//   #flex(justify: "space-between", align: "center", basis: "20rem")[a][b]
#let flex(
  ..cells,
  justify: "center",   // justify-content
  align: "stretch",    // align-items
  wrap: true,
  basis: "18rem",      // width a cell wants before wrapping
  gap: none,
) = {
  _uses-css
  let vars = (
    "--justify: " + justify,
    "--align: " + align,
    "--wrap: " + (if wrap { "wrap" } else { "nowrap" }),
    "--basis: " + basis,
  )
  if gap != none { vars.push("--gap-own: " + gap) }
  elem("div", _cells(cells.pos()), class: "flex", style: vars.join("; "))
}

// Headings carry ids we assign rather than the ones Typst attaches to whatever
// a show rule emits first, which the footnote block would otherwise claim.
#let _heading-id(n) = "sec-" + str(n)

#let _render-heading(it) = context {
  // Inside a heading's show rule the heading itself counts as "before" here.
  let n = query(selector(heading).before(here(), inclusive: false)).len()
  elem("h" + str(it.level + 1), it.body, id: _heading-id(n))
}

// Superscript reference, numbered across the document. The note itself is
// collected by _footnote-flush at the end of the section it appears in.
#let footnote(body) = {
  [#metadata(body)<fn-note>]
  context {
    let n = query(selector(<fn-note>).before(here(), inclusive: true)).len()
    _uses-css
    elem("sup", elem("a", str(n), href: "#fn-" + str(n)),
         id: "fn-ref-" + str(n), role: "doc-noteref", class: "fn-ref")
  }
}

// Renders the notes belonging to the section that ends here. Called from the
// heading show rule, where the heading being shown already counts as "before"
// this point, and once more at the end of the document.
#let _footnote-flush(in-heading: false) = context {
  let me = here()
  let heads = query(selector(heading).before(me, inclusive: false))
  let prev = if in-heading {
    if heads.len() >= 2 { heads.at(-2) } else { none }
  } else if heads.len() >= 1 { heads.last() } else { none }

  let lo = if prev == none { 0 } else {
    query(selector(<fn-note>).before(prev.location())).len()
  }
  let hi = query(selector(<fn-note>).before(me)).len()

  if hi > lo {
    _uses-css
    elem("section", elem("ol", {
      for (i, note) in query(<fn-note>).slice(lo, hi).enumerate() {
        let n = lo + i + 1
        elem("li", {
          elem("a", str(n), href: "#fn-ref-" + str(n), class: "fn-back")
          [ ]
          note.value
        }, id: "fn-" + str(n))
      }
    }), role: "doc-endnotes", class: "footnotes")
  }
}

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
    #elem("span", [·], class: "sep")
    #link(site.repo)[Source]
  ],
  class: "site-footer",
)

// Links every section (== and deeper), or renders nothing under two. Floats
// into the left margin where there's room for it.
#let toc() = context {
  let all = query(heading)
  let heads = all.enumerate().filter(((i, h)) => h.level >= 2)
  if heads.len() >= 2 {
    _uses-css
    elem("div", elem("nav", {
      elem("p", "On this page", class: "toc-title")
      elem("ul", {
        for (i, h) in heads {
          elem("li", elem("a", h.body, href: "#" + _heading-id(i + 1)),
               class: "toc-l" + str(h.level))
        }
      })
    }, class: "toc"), class: "toc-col")
    // Highlight behaviour, shipped with the element.
    raw(read("/lib/scrollspy.ts"), lang: "inline-script")
  }
}
