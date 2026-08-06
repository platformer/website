#import "/lib/site.typ": *
#show: base
#meta(title: "Home")

#elem("pre", [], id: "boat", class: "boat", aria-hidden: "true")

```inline-script
const el = document.getElementById("boat") as HTMLPreElement;

// Authored without leading padding; centred at render time.
const BOAT = [
  "   |\\",
  "   | \\",
  "   |  \\",
  "   |   \\",
  "   |    \\",
  "   |_____\\",
  "\\-----------/",
  " \\_________/",
];
const WAVE = "~^~ ~~-~ ~^~~ -~~ ~-~^ ~~ ";
const WIDTH = 46;
const SEA = 2; // wave rows, at the bottom
const HEIGHT = BOAT.length + SEA; // hull's last row can reach the water
const BOAT_X = Math.floor((WIDTH - Math.max(...BOAT.map((l) => l.length))) / 2);

// Waves travel right, so sample the pattern from a decreasing offset.
const waveChar = (x: number, t: number, speed: number): string => {
  const i = (((x - t * speed) % WAVE.length) + WAVE.length) % WAVE.length;
  return WAVE[Math.floor(i)];
};

const frame = (t: number): string => {
  const grid: string[][] = Array.from(
    { length: HEIGHT }, () => new Array(WIDTH).fill(" "),
  );
  // 0 or 1: down, and the water laps over the hull; up, and more hull shows.
  const bob = Math.round((Math.sin(t / 3) + 1) / 2);
  BOAT.forEach((line, i) => {
    for (let j = 0; j < line.length; j++) grid[bob + i][BOAT_X + j] = line[j];
  });
  // Only where the pattern isn't a gap, so the hull shows through between
  // crests.
  for (let k = 0; k < SEA; k++) {
    const row = HEIGHT - SEA + k;
    for (let x = 0; x < WIDTH; x++) {
      const c = waveChar(x, t, k === 0 ? 1 : 0.5);
      if (c !== " ") grid[row][x] = c;
    }
  }
  return grid.map((r) => r.join("")).join("\n");
};

let t = 0;
el.textContent = frame(0);
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  setInterval(() => { t += 1; el.textContent = frame(t); }, 160);
}
```

#title[Hello!]

I build things and occasionally write about them. Maybe you'll find something interesting!

= Recent posts

#let posts = json("blog/posts.json")

#if posts.len() == 0 [
  Nothing here yet.
] else {
  post-list(posts, limit: 5)
  if posts.len() > 5 {
    elem("p", page-link("/content/blog/index.typ")[More posts #sym.arrow.r], class: "more-posts")
  }
}
