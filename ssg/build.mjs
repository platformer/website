// Custom static site generator.
//
// Pipeline, per content/**/*.typ page:
//   1. `typst compile --format html`  -> a full HTML document
//   2. extract the <body> and wrap it in the shared shell (nav, <head>, footer)
//   3. `typst eval query(<page-meta>)` -> the page title (and blog frontmatter)
//   4. `typst eval query(<inline-script>)` -> embedded JS, injected as <script>
//
// Blog posts are collected in a first pass into content/blog/posts.json so that
// content/blog/index.typ can render the post list from data.

import { spawnSync } from "node:child_process";
import {
  readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, cpSync,
  existsSync, statSync,
} from "node:fs";
import { join, relative, dirname, resolve, basename, sep } from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

// stripTypeScriptTypes is experimental; silence only that warning.
const _emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  const type = typeof rest[0] === "string" ? rest[0] : rest[0]?.type;
  if (type === "ExperimentalWarning") return;
  return _emitWarning.call(process, warning, ...rest);
};

const ROOT = resolve(import.meta.dirname, "..");
const CONTENT = join(ROOT, "content");
const STATIC = join(ROOT, "static");
const DIST = join(ROOT, "dist");
const TYPST = process.env.TYPST_BIN || "typst";

// Files the build writes back into the source tree. The dev watcher ignores
// these so regenerating them doesn't trigger an endless rebuild loop.
const BLOG_POSTS = join(CONTENT, "blog", "posts.json");
export const GENERATED = [BLOG_POSTS];

const SITE_NAME = "Andrew Sen";
const NAV = [
  { label: "Home", href: "/" },
  { label: "Blog", href: "/blog/" },
  { label: "Misc", href: "/misc/" },
];

// --- typst helpers ----------------------------------------------------------

// Warnings that are inherent to Typst's experimental HTML export and to running
// introspection (`typst eval`) over pages that use html.elem. They don't affect
// output, so drop them; anything else (real errors and warnings) is passed on.
const NOISE = [
  /html export is under active development/,
  /its behaviour may change/,
  /do not rely on this feature/,
  /issues\/5512/,
  /elem may not occur inside of a paragraph/,
  /elem was ignored during paged export/,
];

function filterDiagnostics(stderr) {
  return stderr
    .split(/\n\s*\n/) // Typst separates diagnostic blocks with a blank line
    .filter((block) => block.trim() && !NOISE.some((re) => re.test(block)))
    .join("\n\n");
}

function typst(args) {
  const r = spawnSync(TYPST, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  const diagnostics = filterDiagnostics(r.stderr || "");
  if (diagnostics) process.stderr.write(diagnostics + "\n");
  if (r.status !== 0) throw new Error(`typst ${args[0]} exited with code ${r.status}`);
  return r.stdout;
}

const HTML = ["--features", "html", "--root", ROOT];

// Compile a page to a full HTML document (written to stdout via `-`).
function compileHtml(file) {
  return typst(["compile", ...HTML, "--format", "html", file, "-"]);
}

// Evaluate a query expression against a page and parse the JSON result.
function evalQuery(file, expr) {
  const out = typst(["eval", ...HTML, "--format", "json", "--in", file, expr]);
  return JSON.parse(out);
}

function pageMeta(file) {
  return evalQuery(file, "query(<page-meta>).map(it => it.value).at(0, default: (:))");
}

function pageScripts(file) {
  return evalQuery(file, "query(<inline-script>).map(it => it.value)");
}

// Paths (relative to the .typ file) passed to #script(...) in the source.
function pageScriptSrcs(file) {
  return evalQuery(file, "query(<script-src>).map(it => it.value)");
}

// --- script (TypeScript/JavaScript) helpers --------------------------------

// Transpile TypeScript to browser JavaScript. `transform` mode also lowers
// enums/namespaces. Note: this strips types per-file; it does NOT bundle
// cross-file imports.
function transpile(code) {
  return stripTypeScriptTypes(code, { mode: "transform" });
}

// Where a referenced script's compiled .js lands in dist, and its URL. Scripts
// under content/ mirror their path (content/misc/x.ts -> /misc/x.js); scripts
// elsewhere in the repo go under /scripts/, outside the repo under /scripts/.
function scriptOutput(srcAbs) {
  let rel = relative(ROOT, srcAbs).split(sep).join("/");
  if (rel.startsWith("content/")) rel = rel.slice("content/".length);
  else if (rel.startsWith("../")) rel = `scripts/${basename(srcAbs)}`;
  const outRel = rel.replace(/\.(m?ts|m?js)$/i, ".js");
  return { outRel, url: "/" + outRel };
}

// Compile a referenced script file to dist once, returning its public URL.
const scriptCache = new Map(); // srcAbs -> url
function emitScript(srcAbs) {
  if (scriptCache.has(srcAbs)) return scriptCache.get(srcAbs);
  if (!existsSync(srcAbs)) throw new Error(`#script: file not found: ${srcAbs}`);
  const source = readFileSync(srcAbs, "utf8");
  const code = /\.m?ts$/i.test(srcAbs) ? transpile(source) : source;
  const { outRel, url } = scriptOutput(srcAbs);
  const out = join(DIST, outRel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, code);
  scriptCache.set(srcAbs, url);
  return url;
}

// --- filesystem helpers -----------------------------------------------------

function findTyp(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || name.startsWith("_")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...findTyp(full));
    else if (name.endsWith(".typ")) out.push(full);
  }
  return out;
}

function extractBody(html) {
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return (m ? m[1] : html).trim();
}

// --- page shell -------------------------------------------------------------

function shell({ title, bodyHtml, headScripts = [], scripts = [] }) {
  const nav = NAV.map((n) => `<a href="${n.href}">${n.label}</a>`).join("");
  // All scripts are type="module", which is deferred by default: they execute
  // after the DOM is parsed, in document order (head scripts before body ones).
  // Modules are also isolated, so per-toy top-level `const`/`let` never collide.
  const headTags = headScripts
    .map((src) => `<script type="module" src="${src}"></script>`)
    .join("\n");
  const scriptTags = scripts
    .map((s) => `<script type="module">\n${s}\n</script>`)
    .join("\n");
  const pageTitle = title ? `${title} · ${SITE_NAME}` : SITE_NAME;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${pageTitle}</title>
<link rel="stylesheet" href="/styles.css">
${headTags}
</head>
<body>
<header class="site-nav"><nav>${nav}</nav></header>
<main>
${bodyHtml}
</main>
<footer class="site-footer">© ${new Date().getFullYear()} ${SITE_NAME}</footer>
${scriptTags}
</body>
</html>
`;
}

// --- build ------------------------------------------------------------------

export function build() {
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  // Pass 1: collect blog frontmatter into posts.json (consumed by blog/index.typ).
  const blogDir = join(CONTENT, "blog");
  if (existsSync(blogDir)) {
    const posts = [];
    for (const file of findTyp(blogDir)) {
      const slug = relative(blogDir, file).replace(/\.typ$/, "");
      if (slug === "index") continue; // the listing page itself
      const meta = pageMeta(file);
      posts.push({
        slug,
        title: meta.title ?? slug,
        date: meta.date ?? "",
        summary: meta.summary ?? "",
      });
    }
    posts.sort((a, b) => (a.date < b.date ? 1 : -1));
    writeFileSync(BLOG_POSTS, JSON.stringify(posts, null, 2));
  }

  // Pass 2: compile every page.
  let count = 0;
  for (const file of findTyp(CONTENT)) {
    const rel = relative(CONTENT, file).replace(/\.typ$/, ".html");
    const meta = pageMeta(file);
    const bodyHtml = extractBody(compileHtml(file));
    // External files loaded via #script(...) -> compiled to dist, linked in <head>.
    const headScripts = pageScriptSrcs(file)
      .map((rel) => emitScript(resolve(dirname(file), rel)));
    // Embedded ```inline-script blocks -> transpiled, inlined before </body>.
    const scripts = pageScripts(file).map(transpile);
    const html = shell({ title: meta.title, bodyHtml, headScripts, scripts });

    const outPath = join(DIST, rel);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html);
    console.log("  built", rel);
    count += 1;
  }

  // Static assets (styles.css, images, ...) copied to the site root.
  if (existsSync(STATIC)) cpSync(STATIC, DIST, { recursive: true });

  console.log(`\nDone: ${count} page(s) -> ${relative(ROOT, DIST)}/`);
}

// Run when invoked directly (`node ssg/build.mjs`); stay quiet when imported.
if (process.argv[1] === fileURLToPath(import.meta.url)) build();
