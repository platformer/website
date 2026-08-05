// Frontmatter, element helpers, and the <head> asset channel. The SSG reads
// the metadata these emit.

#import "/lib/config.typ": *

// Posts want title + date; summary is optional.
#let meta(..args) = [#metadata(args.named())<page-meta>]

// html.elem with an optional id; everything below is built from it.
#let elem(tag, body, id: none, ..attrs) = {
  let a = attrs.named()
  if id != none { a.insert("id", id) }
  html.elem(tag, attrs: a, body)
}

// An id a script can find.
#let id(name, body) = elem("span", body, id: name)
#let button(name, body) = elem("button", body, id: name)

//   #page-link("/content/blog/index.typ")[Blog]
#let page-link(path, body) = link(page-url(path), body)

// Head channel; the SSG collects these into <head>, deduplicated.
#let style(path) = [#metadata(path)<style-src>] // relative to the file, or /root-absolute
#let head(tag, ..attrs) = [#metadata((tag: tag, attrs: attrs.named()))<head-tag>] // fonts, meta, preload
#let script(path) = [#metadata(path)<script-src>] // .ts/.js, as a deferred head module
