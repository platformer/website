// Static site generator. Per content/**/*.typ page: compile to HTML, lift the
// <body> into the shared shell, and read back its metadata (title, scripts,
// styles, head tags) to fill <head> and inject scripts. A first pass gathers
// blog frontmatter into posts.json for the index.

import { spawnSync } from "node:child_process";
import {
  readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, cpSync,
  existsSync, statSync,
} from "node:fs";
import { join, relative, dirname, resolve, basename, sep } from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

// Silence the experimental-feature warning from stripTypeScriptTypes.
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

// Written back into the source tree; the dev watcher ignores these to avoid a
// rebuild loop.
const BLOG_POSTS = join(CONTENT, "blog", "posts.json");
export const GENERATED = [BLOG_POSTS];

const SITE_NAME = "Andrew Sen";
const NAV = [
  { label: "Blog", href: "/blog/" },
  { label: "Misc", href: "/misc/" },
];

// --- typst helpers ----------------------------------------------------------

// Diagnostics inherent to experimental HTML export and to html.elem
// introspection. Harmless, so drop them; everything else passes through.
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
    .split(/\n\s*\n/) // blank line separates diagnostic blocks
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

// Full HTML document, to stdout.
function compileHtml(file) {
  return typst(["compile", ...HTML, "--format", "html", file, "-"]);
}

// Run a query against a page, parse the JSON result.
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

// #script(...) paths, relative to the .typ.
function pageScriptSrcs(file) {
  return evalQuery(file, "query(<script-src>).map(it => it.value)");
}

// #style(...) sheets and #head(...) tags.
function pageStyleSrcs(file) {
  return evalQuery(file, "query(<style-src>).map(it => it.value)");
}
function pageHeadTags(file) {
  return evalQuery(file, "query(<head-tag>).map(it => it.value)");
}

// "/..." is root-absolute; otherwise relative to the referencing .typ.
function resolveAsset(fromFile, p) {
  return p.startsWith("/") ? join(ROOT, p.slice(1)) : resolve(dirname(fromFile), p);
}

// --- script (TypeScript/JavaScript) helpers --------------------------------

// Strip TS types to browser JS (transform mode also lowers enums). Per-file:
// no cross-file bundling.
function transpile(code) {
  return stripTypeScriptTypes(code, { mode: "transform" });
}

// Public URL/path for a compiled script: content/ mirrors its path
// (content/misc/x.ts -> /misc/x.js); anything else lands under /scripts/.
function scriptOutput(srcAbs) {
  let rel = relative(ROOT, srcAbs).split(sep).join("/");
  if (rel.startsWith("content/")) rel = rel.slice("content/".length);
  else if (rel.startsWith("../")) rel = `scripts/${basename(srcAbs)}`;
  const outRel = rel.replace(/\.(m?ts|m?js)$/i, ".js");
  return { outRel, url: "/" + outRel };
}

// Compile a script to dist once; return its URL.
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

// Copy a stylesheet to dist once; return its URL. Files outside content/ land
// under /styles/.
const styleCache = new Map(); // srcAbs -> url
function emitStyle(srcAbs) {
  if (styleCache.has(srcAbs)) return styleCache.get(srcAbs);
  if (!existsSync(srcAbs)) throw new Error(`#style: file not found: ${srcAbs}`);
  let rel = relative(ROOT, srcAbs).split(sep).join("/");
  if (rel.startsWith("content/")) rel = rel.slice("content/".length);
  else if (rel.startsWith("../")) rel = `styles/${basename(srcAbs)}`;
  const url = "/" + rel;
  const out = join(DIST, rel);
  mkdirSync(dirname(out), { recursive: true });
  cpSync(srcAbs, out);
  styleCache.set(srcAbs, url);
  return url;
}

// A #head(...) marker as a head tag; void tags have no closer.
const VOID_TAGS = new Set(["link", "meta", "base", "br", "hr", "img", "input"]);
function renderHeadTag({ tag, attrs }) {
  const a = Object.entries(attrs || {})
    .map(([k, v]) => ` ${k}="${String(v).replaceAll('"', "&quot;")}"`)
    .join("");
  return VOID_TAGS.has(tag) ? `<${tag}${a}>` : `<${tag}${a}></${tag}>`;
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

const uniq = (arr) => [...new Set(arr)];

// --- page shell -------------------------------------------------------------

function shell({ title, bodyHtml, headStyles = [], headTags = [], headScripts = [], scripts = [] }) {
  const nav = NAV.map((n) => `<a href="${n.href}">${n.label}</a>`).join("");
  const styleLinks = headStyles
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("\n");
  // type="module" is deferred: runs after DOM parse, in order (head before
  // body). Modules are isolated, so top-level const/let across toys don't clash.
  const headScriptTags = headScripts
    .map((src) => `<script type="module" src="${src}"></script>`)
    .join("\n");
  const scriptTags = scripts
    .map((s) => `<script type="module">\n${s}\n</script>`)
    .join("\n");
  const pageTitle = title ? `${title} · ${SITE_NAME}` : SITE_NAME;
  const headExtras = [styleLinks, headTags.join("\n"), headScriptTags]
    .filter(Boolean)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${pageTitle}</title>
<link rel="stylesheet" href="/styles.css">
${headExtras}
</head>
<body>
<header class="site-header">
<div class="site-header-inner">
<a class="brand" href="/">${SITE_NAME}</a>
<nav>${nav}</nav>
</div>
</header>
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

  // Pass 1: blog frontmatter -> posts.json (read by blog/index.typ).
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

  // Pass 2: compile pages.
  let count = 0;
  for (const file of findTyp(CONTENT)) {
    const rel = relative(CONTENT, file).replace(/\.typ$/, ".html");
    const meta = pageMeta(file);
    const bodyHtml = extractBody(compileHtml(file));
    // Head channel, deduplicated: #style sheets, #head tags, #script files.
    const headStyles = uniq(pageStyleSrcs(file).map((p) => emitStyle(resolveAsset(file, p))));
    const headTags = uniq(pageHeadTags(file).map(renderHeadTag));
    const headScripts = uniq(pageScriptSrcs(file).map((p) => emitScript(resolveAsset(file, p))));
    // Inline blocks: transpile, inject before </body>.
    const scripts = pageScripts(file).map(transpile);
    const html = shell({ title: meta.title, bodyHtml, headStyles, headTags, headScripts, scripts });

    const outPath = join(DIST, rel);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html);
    console.log("  built", rel);
    count += 1;
  }

  // Static assets copied to the site root.
  if (existsSync(STATIC)) cpSync(STATIC, DIST, { recursive: true });

  console.log(`\nDone: ${count} page(s) -> ${relative(ROOT, DIST)}/`);
}

// Run when invoked directly; stay quiet when imported.
if (process.argv[1] === fileURLToPath(import.meta.url)) build();
