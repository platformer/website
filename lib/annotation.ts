// Aligns each annotation in the right margin with the marker that refers to it,
// at the width where the CSS floats them out of the flow. Best effort: a note
// sits at its marker's height, then moves down enough to clear the note above.

const WIDE = matchMedia("(min-width: 1450px)");
const GAP = 12;

const main = document.querySelector("main");

// Collapsed, a panel opens below its tab strip. Scrolling the panel to just
// under the header would put that strip behind it, so the panel reserves the
// strip's height too. Measured because the tabs can wrap to a second row.
const reserveForTabs = (): void => {
  for (const group of document.querySelectorAll<HTMLElement>(".annotations")) {
    const tabs = group.querySelector<HTMLElement>(".ann-tabs");
    const h = tabs && tabs.offsetParent !== null ? tabs.offsetHeight : 0;
    group.style.setProperty("--ann-tabs-h", `${h}px`);
  }
};

const layout = (): void => {
  reserveForTabs();
  if (!main) return;
  const panels = [...document.querySelectorAll<HTMLElement>(".ann-panel")];
  if (!WIDE.matches) {
    for (const p of panels) p.style.top = "";
    return;
  }
  const origin = main.getBoundingClientRect().top + scrollY;
  let floor = 0;
  for (const panel of panels) {
    const ref = document.getElementById(panel.id.replace(/^ann-/, "ann-ref-"));
    if (!ref) continue;
    const wanted = ref.getBoundingClientRect().top + scrollY - origin;
    const top = Math.max(wanted, floor);
    panel.style.top = `${top}px`;
    floor = top + panel.offsetHeight + GAP;
  }
};

// Collapsed, one note is open at a time.
const groups = [...document.querySelectorAll<HTMLElement>(".annotations")];
const panels = () => document.querySelectorAll<HTMLElement>(".ann-panel");
const tabs = () => document.querySelectorAll<HTMLButtonElement>(".ann-tab");

const open = (id: string): void => {
  for (const p of panels()) p.toggleAttribute("data-open", p.id === id);
  for (const t of tabs()) t.setAttribute("aria-expanded", String(t.dataset.ann === id));
  layout();
};

for (const g of groups) g.classList.add("js");

// Tabs expand in place. They are buttons, not links, so nothing navigates and
// the strip stays where the reader is looking.
for (const tab of tabs()) {
  tab.addEventListener("click", () => {
    const id = tab.dataset.ann ?? "";
    const already = document.getElementById(id)?.hasAttribute("data-open");
    open(already ? "" : id);
  });
}

// A marker is a real link and should jump to its note. Open the panel during
// the click so the browser has something to scroll to; the navigation itself
// still happens, which is what leaves a history entry to come back by.
for (const ref of document.querySelectorAll<HTMLAnchorElement>(".ann-ref")) {
  ref.addEventListener("click", () => open((ref.getAttribute("href") ?? "").slice(1)));
}

// Only a note anchor drives the panels. Collapsing one for an unrelated jump,
// like a TOC link, would pull height out from under a scroll already aimed at
// the old offset and overshoot the heading.
addEventListener("hashchange", () => {
  const target = document.getElementById(location.hash.slice(1));
  if (target?.classList.contains("ann-panel")) open(target.id);
});

// Arriving on a link to a note: the browser has already tried to scroll to a
// panel that was still hidden, so place it again once it is open.
const landed = document.getElementById(location.hash.slice(1));
if (landed?.classList.contains("ann-panel")) {
  open(landed.id);
  landed.scrollIntoView();
}

layout();
addEventListener("resize", layout);
WIDE.addEventListener("change", layout);
// Late layout shifts (fonts, images, an opened <details>) move the markers.
if (document.fonts) document.fonts.ready.then(layout);
new ResizeObserver(layout).observe(document.body);
