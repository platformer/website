#import "/lib/elements.typ": *
#import "@preview/elembic:1.1.1" as e

// Component defaults, in one place. Change a rule to restyle every instance; a
// page can still override locally with its own #show: e.set_(...).
#let theme(body) = {
  show: e.set_(callout, kind: "note")
  show: e.set_(details, open: false)
  body
}

// Every page runs `#show: template`: pull ```inline-script blocks out for the
// SSG, then apply the theme.
#let template(body) = {
  show raw.where(lang: "inline-script"): it => [#metadata(it.text) <inline-script>]
  show: theme
  body
}
