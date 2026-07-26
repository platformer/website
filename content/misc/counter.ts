// Loaded by counter.typ via #script; transpiled to /misc/counter.js.

const val = document.getElementById("c-val") as HTMLElement;
let n: number = 0;

const render = (): void => {
  val.textContent = String(n);
};

const on = (id: string, step: number | "reset"): void => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("click", () => {
    n = step === "reset" ? 0 : n + step;
    render();
  });
};

on("c-inc", 1);
on("c-dec", -1);
on("c-reset", "reset");
