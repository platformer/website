// Frontmatter, HTML element helpers, and the <head> asset channel. The SSG
// reads the metadata these emit.

// Page frontmatter. Posts want title + date; summary is optional.
#let meta(..args) = [#metadata(args.named()) <page-meta>]

// html.elem with an optional id and any other attributes. Everything below
// funnels through this. ids have to sit on a real element, since Typst labels
// don't survive to HTML.
#let elem(tag, body, id: none, ..attrs) = {
  let a = attrs.named()
  if id != none { a.insert("id", id) }
  html.elem(tag, attrs: a, body)
}

// Inline span / button carrying an id for scripts to reach.
#let id(name, body) = elem("span", body, id: name)
#let button(name, body) = elem("button", body, id: name)

// Head channel. The SSG collects these into <head>, deduplicated.
#let style(path) = [#metadata(path) <style-src>] // stylesheet; path relative to the file, or /root-absolute
#let head(tag, ..attrs) = [#metadata((tag: tag, attrs: attrs.named())) <head-tag>] // any <head> tag (fonts, meta, preload)
#let script(path) = [#metadata(path) <script-src>] // .ts/.js file, loaded as a deferred head module
