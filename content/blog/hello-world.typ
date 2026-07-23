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
