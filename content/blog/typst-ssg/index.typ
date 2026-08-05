#import "/lib/site.typ": *
#show: blog

#meta(
  title: "How this site is built",
  date: "2026-07-26",
  summary: "Typst source, a few hundred lines of TypeScript, and a metadata channel that ties them together.",
)

= How this site is built

This site is primarily written in #link("https://typst.app")[Typst], a markup language that can be used as an alternative to Latex, Markdown, or AsciiDoc. I've been meaning to make my own static site generator based on Typst for a very long time, essentially ever since the Typst developers started teasing HTML export. Now HTML export is available (in an experimental capacity), and I've finally found the time and motivation to get my own domain and build everything out.

== Why Typst?

If you've never heard of Typst before, my incoming praise for it will likely sound evangelical, but simply put, it's the most delightful markup language I've ever used.

The core conceit of Typst is that it is both a simple markup language and an ergonomic scripting language. Typst is expression-based, and expressions can yield content that gets rendered in a PDF, or in this case, HTML. I got my hands on Typst almost as soon as it was first released, and it immediately struck me how simple, expressive, and composable Typst code is.

#let fib(n) = {
  let fibs = (0, 1)
  let a = 0
  let b = 1
  fibs = (
    fibs
      + for i in range(2, n) {
        let c = a + b
        a = b
        b = c
        (c,)
      }
  )
  fibs.slice(0, n)
}

#flex[
  ```typ
  // the classic fib example
  #let fib(n) = {
    let fibs = (0, 1)
    let a = 0
    let b = 1
    fibs = fibs + for i in range(2, n) {
      let c = a + b
      a = b
      b = c
      (c,)
    }
    fibs.slice(0, n)
  }

  #fib(24).map(x => str(x)).join(" ")
  ```
][
  #fib(24).map(x => str(x)).join(" ")
]

Typst's ergonomics are especially apparent if you have extensive experience writing Latex documents. If you've used Latex before, at some point it probably felt arcane or confusing. Often, if you had a specific use case, you'd find whatever package you needed, figure out its API, and move on. But how did that package actually work? What are the actual fundamentals of Latex programming that would allow you to write your own packages? I was usually too intimidated and time-constrained as a student to bother with finding the answer to those questions. But Typst felt different. It is so simple as to invite you to try writing your own packages.

And I did! My first Typst project was a #link("https://gist.github.com/platformer/6b4504608969cfebff46ddcfbc18c537")[homework template]#annotation[There have been many Typst versions since I last used this, so it's likely severely outdated. Use at your own peril.] that I used for every class that would allow me, and I convinced all of two people to use it as well. My biggest contribution to the Typst community was a #link("https://typst.app/universe/package/algo")[package for displaying algorithms] that I also used quite extensively#annotation[I confess this package has been unmaintained for a while. If you actually need a Typst package for algorithms, I encourage you to research alternatives. I still intend to revisit this package whenever Typst implements first-class user-defined elements.].

Seriously, if you've never tried Typst, I invite you to #link("https://typst.app/play")[play] around with it. But that's enough evangelizing. How does this website make use of it?

== HTML export

Typst 0.13 added HTML as an export target. Currently, Typst's main goal with HTML export is converting Typst content to semantic HTML, so a `=` heading becomes an `<h2>`, `*bold*` becomes `<strong>`, and a fenced code block becomes `<pre><code>` with syntax highlighting already applied. However, it does not translate Typst's layout and styling primitives:

#table(
  columns: 2,
  [`#strong`, `#emph`, `#link`, raw blocks], [semantic tags, as you'd expect],
  [`#text(fill: red, size: 20pt)`], [plain text; color and size are dropped],
  [`#block(fill: ..., inset: ..., radius: ...)`], [a bare `<div>`],
  [`#align`, `#pad`, `#grid`], [ignored with warnings],
)

So Typst files own the raw content and any HTML elements you explicitly create, but your styling and layout will mostly live in dedicated CSS files.

#note[
  There is a small escape hatch. `html.frame` renders Typst content to inline SVG and preserves arbitrary styling, but of course you lose out on selectable text and accessibility. It's really only intended for diagrams or figures.
]

== The metadata channel

A lot of my setup relies on Typst's metadata mechanism. A Typst document can use the `metadata` function to emit arbitrary data that the compiler can later query by its label:

```typ
// I define a helper function where the `metadata` is always labeled `<page-meta>`
#let meta(..args) = [#metadata(args.named())<page-meta>]
```

and the site generator queries the `<page-meta>` label:

```
typst eval --target html --in page.typ 'query(<page-meta>).map(it => it.value)'
```

With this little trick, the SSG can collect `metadata` values and implement special handling for frontmatter, embedded scripts, stylesheets, and any other magical patterns I choose to implement:

```typ
#let style(path)        = [#metadata(path)<style-src>]
#let script(path)       = [#metadata(path)<script-src>]
#let head(tag, ..attrs) = [#metadata((tag: tag, attrs: attrs.named()))<head-tag>]
```

== Components

I've defined some common components using the #link("https://typst.app/universe/package/elembic/")[Elembic] package, which allows me to conveniently style them with Typst's built-in `set` and `show` rules#annotation[Typst doesn't currently support applying `set` and `show` rules to user-defined functions out of the box, so the Elembic package provides a workaround. It is a planned feature though, and I'll probably replace the package with a native solution once it's available.].

=== Callouts

```typ
#note[A plain note for context.]
#warn(title: "Careful")[This one has a title.]
```

#note[A plain note for context.]

#warn(title: "Careful")[This one has a title.]

=== Collapsibles

```typ
#details("Implementation detail")[
  Uses the native `<details>` element, so it needs no JavaScript.
]
```

#details("Implementation detail")[
  Uses the native `<details>` element, so it needs no JavaScript.
]

=== Quotes

```typ
#blockquote(by: [Ada Lovelace])[
  The Analytical Engine weaves algebraic patterns.
]
```

#blockquote(by: [Ada Lovelace])[
  The Analytical Engine weaves algebraic patterns.
]

=== Popovers

```typ
Hover facts go in a #popover("pv-post", "popover")[This is just a native popover].
```

Hover facts go in a #popover("pv-post", "popover")[This is just a native popover].

== Scripts

A show rule in the template catches raw blocks tagged `inline-script` and passes them to the generator instead of rendering them:

```typ
show raw.where(lang: "inline-script"): it => [#metadata(it.text)<inline-script>]
```

This lets me write some HTML and companion JavaScript right next to each other within a Typst document. For example, this:

````typ
#button("demo-go")[Click me] #id("demo-count")[0]

```inline-script
const out = document.getElementById("demo-count") as HTMLElement;
let n: number = 0;
document.getElementById("demo-go")!.addEventListener("click", () => {
  out.textContent = String(++n);
});
```
````

produces this:

#button("demo-go")[Click me] #id("demo-count")[0]

```inline-script
const out = document.getElementById("demo-count") as HTMLElement;
let n: number = 0;
document.getElementById("demo-go")!.addEventListener("click", () => {
  out.textContent = String(++n);
});
```

Will I actually use this all that often? ¯\\\_(ツ)\_/¯

I mostly added this since I was already exploring how much I could control within the bounds of a Typst document. For what it's worth, this mechanism is how I implemented the scroll spy you see on the left if you're reading this on a desktop. The `#toc` function reads in the scroll spy's TypeScript file as an `inline-script` block...

```typ
raw(read("/lib/scrollspy.ts"), lang: "inline-script")
```

...which eventually gets rendered by the SSG. This allows me to reference it in my `#blog` template, denoting that all blog documents should have a table of contents.

```typ
#let blog(body) = {
  show: theme
  elem("main", { toc(); body; _annotation-flush() }) // notice `toc` gets added to main here
  site-footer()
}
```

Plus, the cute boat animation on my #page-link("/content/index.typ")[home page] was also implemented via this method.

== What the generator does

At the start of a build, there are two invocations of the Typst CLI:

+ `typst eval` to retrieve blog post documents and populate a `posts.json` file. The contents of this file are referenced on pages that render a list of posts.#annotation[This likely won't be necessary whenever Typst adds a function for directory walking.]
+ Another `typst eval` to verify that my internal links are all correct. I do some string transformation wherever necessary to make sure references to a `.typ` file correctly map to a URL.

For each `.typ` file, there are two more invocations of the CLI:

+ `typst compile --format html` to get HTML output.
+ `typst eval` to retrieve metadata tags.

Then the SSG takes the `<body>` out of the HTML output, resolves/copies any scripts and stylesheets, tacks on the `<head>`, and writes the rendered file.

That's really the crux of it. There are other minor details, like deduplicating stylesheet references as necessary, and overwriting Typst's default styling for syntax tokens in code blocks, but the overall process is straightforward. The whole build script is about 400 lines, so I'm reasonably impressed with how small it ended up being.

== Worth it?

I think making a custom SSG is a worthwhile endeavor for any personal site. It's just nice to be in complete control of a tool I know I'll use every day, and I'm happy that I can do just that for my own website.

That said, there are already things I'd like to improve. Although I was committed from the beginning to make a Typst-centric SSG, I was somewhat surprised at its current limitations. I'll have to keep experimenting with the boundary between Typst, the SSG, and just plain HTML.

A lot of the components I made are fun, but ultimately I just want writing these blog posts to be as frictionless as possible. That's why I intentionally made the SSG both small and extensible for my own needs. I'm sure I can grow or shrink it however I want as I get in the groove of actually writing blog posts (exciting!).

The #link("https://github.com/platformer/website")[repository] is public if you want to check it out.
