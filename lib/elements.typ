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
// export. Each argument is one cell; cells center their content vertically and
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
  justify: "center", // justify-content
  align: "stretch", // align-items
  wrap: true,
  basis: "18rem", // width a cell wants before wrapping
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

// The page's <h1>. Defaults to the title given to #meta so the two can't drift;
// pass content to show something else.
//   #title()            #title[Hello!]
#let title(..args) = context {
  let given = args.pos().at(0, default: none)
  std.title(if given != none { given } else {
    query(<page-meta>).at(0, default: (value: (:))).value.at("title", default: "")
  })
}

// Ids we assign: Typst gives a heading's anchor to whatever its show rule emits
// first, which here is the annotation block.
#let _heading-id(n) = "sec-" + str(n)

#let _render-heading(it) = context {
  // Inside a heading's show rule the heading itself counts as "before" here.
  let n = query(selector(heading).before(here(), inclusive: false)).len()
  elem("h" + str(it.level + 1), it.body, id: _heading-id(n))
}

// Annotations: a numbered square in the text, and the note itself either in the
// right margin (wide screens) or in a tabbed panel at the end of the section.
// The marker links to the note and the note links back, so expanding one is
// ordinary fragment navigation and browser history keeps working.
#let _uses-annotation-js = script("/lib/annotation.ts")
#let _ann-colors = 6
#let _ann-class(n, base) = base + " ann-c" + str(calc.rem(n - 1, _ann-colors) + 1)

#let annotation(body) = {
  [#metadata(body)<ann-note>]
  context {
    let n = query(selector(<ann-note>).before(here(), inclusive: true)).len()
    _uses-css
    _uses-annotation-js
    elem("a", str(n),
      id: "ann-ref-" + str(n),
      href: "#ann-" + str(n),
      class: _ann-class(n, "ann-ref"),
      role: "doc-noteref",
      aria-label: "Note " + str(n))
  }
}

// Renders the notes belonging to the section ending here. `in-heading` is set
// when called from the heading show rule, where the heading counts as "before"
// this point.
#let _annotation-flush(in-heading: false) = context {
  let me = here()
  let heads = query(selector(heading).before(me, inclusive: false))
  let prev = if in-heading {
    if heads.len() >= 2 { heads.at(-2) } else { none }
  } else if heads.len() >= 1 { heads.last() } else { none }

  let lo = if prev == none { 0 } else {
    query(selector(<ann-note>).before(prev.location())).len()
  }
  let hi = query(selector(<ann-note>).before(me)).len()

  if hi > lo {
    _uses-css
    let notes = query(<ann-note>).slice(lo, hi)
    elem("section", {
      // Only shown once the margin is too narrow to hold the notes.
      elem("div", {
        elem("span", "Notes", class: "ann-tabs-label")
        for (i, note) in notes.enumerate() {
          let n = lo + i + 1
          elem("button", str(n),
            type: "button",
            class: _ann-class(n, "ann-tab"),
            data-ann: "ann-" + str(n),
            aria-controls: "ann-" + str(n),
            aria-expanded: "false",
            aria-label: "Note " + str(n))
        }
      }, class: "ann-tabs")
      for (i, note) in notes.enumerate() {
        let n = lo + i + 1
        elem("aside", {
          elem("a", str(n),
            href: "#ann-ref-" + str(n),
            class: _ann-class(n, "ann-num"),
            aria-label: "Back to reference " + str(n))
          [ ]
          note.value
        }, id: "ann-" + str(n), class: "ann-panel", role: "doc-footnote")
      }
    }, class: "annotations", role: "doc-endnotes")
  }
}

// Shared by the blog index and the home page. `posts` comes from posts.json.
#let post-list(posts, limit: none) = context {
  // A post title sits one level below whatever section encloses the list, so
  // the list nests correctly wherever it is placed.
  let prev = query(selector(heading).before(here()))
  let level = if prev.len() == 0 { 2 } else { prev.last().level + 2 }
  let shown = if limit == none { posts } else { posts.slice(0, calc.min(limit, posts.len())) }
  elem("ul", class: "posts", {
    for post in shown {
      elem("li", class: "post", {
        elem("h" + str(level),
          elem("a", post.title, class: "post-link", href: page-url(post.page)),
          class: "post-title")
        elem("div", post.date, class: "post-meta")
        if post.desc != "" { elem("p", post.desc, class: "post-desc") }
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
  let heads = all.enumerate().filter(((i, h)) => h.level >= 1)
  if heads.len() >= 2 {
    _uses-css
    elem("div", elem("nav", {
      elem("p", "On this page", class: "toc-title", id: "toc-title")
      elem("ul", {
        for (i, h) in heads {
          elem("li", elem("a", h.body, href: "#" + _heading-id(i + 1)),
            class: "toc-l" + str(h.level))
        }
      })
    }, class: "toc", aria-labelledby: "toc-title"), class: "toc-col")
    // Highlight behavior, shipped with the element.
    raw(read("/lib/scrollspy.ts"), lang: "inline-script")
  }
}
