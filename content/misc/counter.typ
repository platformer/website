#import "/lib/site.typ": *
#show: base
#meta(title: "Counter")
#script("counter.ts")

= Counter

A minimal interactive toy: the markup is Typst, the behaviour lives in a
TypeScript file (`counter.ts`) loaded as a head script via `#script`.

Value: #id("c-val")[0]

#elem("div", id: "c-controls")[
  #button("c-dec")[−]
  #button("c-inc")[+]
  #button("c-reset")[reset]
]
