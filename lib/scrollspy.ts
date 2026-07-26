// Drives the #toc() highlight. Read at compile time by the toc element, so the
// SSG needs no TOC awareness of its own.
//
// Two refinements over "highlight the topmost visible heading": a click locks
// the highlight until the next real scroll, and near the bottom the trailing
// sections share out the remaining scroll, so short end sections still get a
// turn and the last one wins at the very bottom.
const links = [...document.querySelectorAll<HTMLAnchorElement>(".toc a")];
const heads = links.map((a) => document.getElementById((a.getAttribute("href") ?? "#").slice(1))!);
// The line a heading must reach to count as current. Reading back the
// scroll-margin-top that anchors already use keeps both on the same line;
// computed style resolves calc() and rem to pixels.
const offset = (): number => parseFloat(getComputedStyle(heads[0]).scrollMarginTop) || 0;
let locked = false;
let raf = 0;

const setActive = (i: number): void =>
  links.forEach((a, k) => a.classList.toggle("active", k === i));

const update = (): void => {
  raf = 0;
  if (locked) return;
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);
  // Scroll position at which each heading reaches the line.
  const line = offset();
  const acts = heads.map((h) => h.getBoundingClientRect().top + scrollY - line);
  // Headings that can't reach the line (the page ends first) share out the
  // remaining scroll instead.
  const over = acts.findIndex((a) => a > maxScroll);
  if (over > 0) {
    const start = acts[over - 1];
    const n = acts.length - (over - 1);
    for (let k = 0; k < n; k++) acts[over - 1 + k] = start + ((maxScroll - start) * k) / n;
  }
  let i = 0;
  for (let k = 0; k < acts.length; k++) if (scrollY >= acts[k]) i = k;
  if (maxScroll > 0 && scrollY >= maxScroll - 1) i = acts.length - 1;
  setActive(i);
};

const onScroll = (): void => { if (!raf) raf = requestAnimationFrame(update); };
addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", onScroll);
const unlock = (): void => { locked = false; };
addEventListener("wheel", unlock, { passive: true });
addEventListener("touchmove", unlock, { passive: true });
addEventListener("keydown", unlock);
links.forEach((a, i) => a.addEventListener("click", () => { locked = true; setActive(i); }));

update();
