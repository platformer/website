#import "/lib/site.typ": *
#show: template
#meta(
  title: "Hello, World",
  date: "2026-07-21",
  summary: "First post --- and a live demo of JavaScript embedded in Typst.",
)

= Hello, World

This is the first post. The interesting bit is the widget below: it is driven
by JavaScript written *inside this Typst file*.

== The embedded script

Clicks: #id("demo-count")[0]

#button("demo-box")[Click me]

```inline-script
const box = document.getElementById("demo-box") as HTMLElement;
const out = document.getElementById("demo-count") as HTMLElement;
let n: number = 0;
box.addEventListener("click", () => {
  n += 1;
  out.textContent = String(n);
});
```

The `inline-script` block never renders as text --- a show rule in
`lib/site.typ` pulls it out, the generator transpiles it (it's TypeScript ---
note the type annotations), and injects it into the page as a real `<script>`
tag.

== Components

The library ships a few building blocks for posts. Their stylesheet is pulled
in through the head channel only when used, and deduplicated.

=== Callouts

#note[A plain note for context.]

#warn(title: "Careful")[This calls out something risky.]

=== Quotes and details

#blockquote(by: [Ada Lovelace])[
  The Analytical Engine weaves algebraic patterns.
]

#details("Implementation detail")[
  Collapsible content, built on the native `<details>` element --- no JavaScript.
]

=== Popovers

Hover facts appear in a
#popover("pv-native", "popover")[Powered by the native HTML Popover API, so it
needs no script either.].

== Notes

Everything on this page is static HTML plus a little JavaScript. Scroll and the
sidebar tracks where you are.
