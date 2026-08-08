#import "/lib/site.typ": *
#show: base
#meta(
  title: "Blog",
  desc: "My posts. Mostly about programming, projects, and any related curiosities.",
)

#title()

// Written by the SSG before any page compiles.
#let posts = json("posts.json")

#if posts.len() == 0 [
  Nothing here yet.
] else {
  post-list(posts)
}
