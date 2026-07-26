// Static site generator. Per content/**/*.typ page: compile to HTML, lift the
// <body> into the shared shell, and read back its metadata (title, scripts,
// styles, head tags) to fill <head> and inject scripts. A first pass gathers
// blog frontmatter into posts.json for the index.
//
// Run via `npm run build`, which passes --disable-warning=ExperimentalWarning
// to quiet the notice from stripTypeScriptTypes below.

import { spawnSync } from "node:child_process";
import {
  readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, cpSync,
  existsSync, statSync,
} from "node:fs";
import { join, relative, dirname, resolve, basename, sep } from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");
const CONTENT = join(ROOT, "content");
const STATIC = join(ROOT, "static");
const DIST = join(ROOT, "dist");
const TYPST = process.env.TYPST_BIN || "typst";

// Written back into the source tree; the dev watcher ignores these to avoid a
// rebuild loop.
const BLOG_POSTS = join(CONTENT, "blog", "posts.json");
export const GENERATED: string[] = [BLOG_POSTS];

interface PageMeta {
  title?: string;
  date?: string;
  summary?: string;
  [key: string]: unknown;
}
interface HeadTag {
  tag: string;
  attrs?: Record<string, string>;
}
interface Post {
  page: string;  // source path; blog/index.typ turns it into a URL via page-url
  title: string;
  date: string;
  summary: string;
}
interface NavEntry {
  label: string;
  page: string;  // source path, e.g. /content/blog/index.typ
  href: string;  // derived from page by lib/config.typ
}
interface SiteConfig {
  name: string;
  nav: NavEntry[];
}
interface ShellOptions {
  title?: string;
  siteName: string;
  nav: NavEntry[];
  bodyHtml: string;
  headStyles?: string[];
  headTags?: string[];
  headScripts?: string[];
  scripts?: string[];
}

// --- typst helpers ----------------------------------------------------------

// The standing notice that HTML export is experimental. Everything else passes
// through: the paged-export warnings that used to be filtered here were a real
// symptom (eval running against the wrong target), not noise.
const NOISE: RegExp[] = [
  /html export is under active development/,
  /its behaviour may change/,
  /do not rely on this feature/,
  /issues\/5512/,
];

function filterDiagnostics(stderr: string): string {
  return stderr
    .split(/\n\s*\n/) // blank line separates diagnostic blocks
    .filter((block) => block.trim() && !NOISE.some((re) => re.test(block)))
    .join("\n\n");
}

function typst(args: string[]): string {
  const r = spawnSync(TYPST, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  const diagnostics = filterDiagnostics(r.stderr || "");
  if (diagnostics) process.stderr.write(diagnostics + "\n");
  if (r.status !== 0) throw new Error(`typst ${args[0]} exited with code ${r.status}`);
  return r.stdout;
}

const COMMON = ["--features", "html", "--root", ROOT];
// `compile` takes the target from --format; `eval` needs it spelled out. Under
// the default paged target eval drops html.elem content, taking the metadata
// inside it (frontmatter, script and style markers) with it.
const HTML = COMMON;
const EVAL = [...COMMON, "--target", "html"];

// Full HTML document, to stdout.
function compileHtml(file: string): string {
  return typst(["compile", ...HTML, "--format", "html", file, "-"]);
}

// Run a query against a page, parse the JSON result.
function evalQuery<T = unknown>(file: string, expr: string): T {
  const out = typst(["eval", ...EVAL, "--format", "json", "--in", file, expr]);
  return JSON.parse(out);
}

function pageMeta(file: string): PageMeta {
  return evalQuery<PageMeta>(file, "query(<page-meta>).map(it => it.value).at(0, default: (:))");
}

function pageScripts(file: string): string[] {
  return evalQuery<string[]>(file, "query(<inline-script>).map(it => it.value)");
}

// #script(...) paths, relative to the .typ.
function pageScriptSrcs(file: string): string[] {
  return evalQuery<string[]>(file, "query(<script-src>).map(it => it.value)");
}

// #style(...) sheets and #head(...) tags.
function pageStyleSrcs(file: string): string[] {
  return evalQuery<string[]>(file, "query(<style-src>).map(it => it.value)");
}
function pageHeadTags(file: string): HeadTag[] {
  return evalQuery<HeadTag[]>(file, "query(<head-tag>).map(it => it.value)");
}

// "/..." is root-absolute; otherwise relative to the referencing .typ.
function resolveAsset(fromFile: string, p: string): string {
  return p.startsWith("/") ? join(ROOT, p.slice(1)) : resolve(dirname(fromFile), p);
}

// lib/config.typ is the single source for site-wide settings; read it once.
// Nav entries name a source file, so a rename or typo fails here rather than
// shipping a dead link.
function siteConfig(): SiteConfig {
  const out = typst([
    "eval", ...EVAL, "--format", "json",
    '{ import "/lib/config.typ": site; site }',
  ]);
  const site: SiteConfig = JSON.parse(out);
  for (const entry of site.nav) {
    if (!existsSync(resolveAsset(ROOT, entry.page))) {
      throw new Error(`nav entry "${entry.label}": no such page ${entry.page}`);
    }
  }
  return site;
}

// page-url (lib/config.typ) and the output paths below are two expressions of
// one rule. Check them against each other so a divergence is a build error
// rather than a 404 nobody notices.
function verifyPageUrls(files: string[]): void {
  if (files.length === 0) return;
  const sources = files.map((f) => "/" + relative(ROOT, f).split(sep).join("/"));
  const list = sources.map((s) => JSON.stringify(s)).join(", ");
  const urls = JSON.parse(typst([
    "eval", ...EVAL, "--format", "json",
    `{ import "/lib/config.typ": page-url; (${list},).map(page-url) }`,
  ])) as string[];

  files.forEach((file, i) => {
    const written = relative(CONTENT, file).replace(/\.typ$/, ".html").split(sep).join("/");
    const url = urls[i];
    // A URL ending in "/" is served by that directory's index.html.
    const target = url.endsWith("/") ? `${url.slice(1)}index.html` : url.slice(1);
    if (target !== written) {
      throw new Error(
        `page-url("${sources[i]}") = "${url}", which needs ${target}, ` +
        `but the build writes ${written}`,
      );
    }
  });
}

// --- script (TypeScript/JavaScript) helpers --------------------------------

// Strip TS types to browser JS. Strip-only, which is all Node still exposes:
// types are blanked in place, so line numbers survive and no source map is
// needed. Non-erasable syntax (enum, namespace) throws; tsconfig's
// erasableSyntaxOnly flags it in the editor first. Per-file, no bundling.
function transpile(code: string): string {
  return stripTypeScriptTypes(code);
}

// Public URL/path for a compiled script: content/ mirrors its path
// (content/misc/x.ts -> /misc/x.js); anything else lands under /scripts/.
function scriptOutput(srcAbs: string): { outRel: string; url: string } {
  let rel = relative(ROOT, srcAbs).split(sep).join("/");
  if (rel.startsWith("content/")) rel = rel.slice("content/".length);
  else if (rel.startsWith("../")) rel = `scripts/${basename(srcAbs)}`;
  const outRel = rel.replace(/\.(m?ts|m?js)$/i, ".js");
  return { outRel, url: "/" + outRel };
}

// Compile a script to dist once; return its URL.
const scriptCache = new Map<string, string>(); // srcAbs -> url
function emitScript(srcAbs: string): string {
  if (scriptCache.has(srcAbs)) return scriptCache.get(srcAbs)!;
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
const styleCache = new Map<string, string>(); // srcAbs -> url
function emitStyle(srcAbs: string): string {
  if (styleCache.has(srcAbs)) return styleCache.get(srcAbs)!;
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
function renderHeadTag({ tag, attrs }: HeadTag): string {
  const a = Object.entries(attrs || {})
    .map(([k, v]) => ` ${k}="${String(v).replaceAll('"', "&quot;")}"`)
    .join("");
  return VOID_TAGS.has(tag) ? `<${tag}${a}>` : `<${tag}${a}></${tag}>`;
}

// --- filesystem helpers -----------------------------------------------------

function findTyp(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || name.startsWith("_")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...findTyp(full));
    else if (name.endsWith(".typ")) out.push(full);
  }
  return out;
}

function extractBody(html: string): string {
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return (m ? m[1] : html).trim();
}

const uniq = <T>(arr: T[]): T[] => [...new Set(arr)];

// --- page shell -------------------------------------------------------------

function shell({ title, siteName, nav: navItems, bodyHtml, headStyles = [], headTags = [], headScripts = [], scripts = [] }: ShellOptions): string {
  const nav = navItems.map((n) => `<a href="${n.href}">${n.label}</a>`).join("");
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
  const pageTitle = title ? `${title} · ${siteName}` : siteName;
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
<a class="brand" href="/">${siteName}</a>
<nav>${nav}</nav>
</div>
</header>
${bodyHtml}
${scriptTags}
</body>
</html>
`;
}

// --- build ------------------------------------------------------------------

export function build(): void {
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  const site = siteConfig();
  const pages = findTyp(CONTENT);
  verifyPageUrls(pages);

  // Pass 1: blog frontmatter -> posts.json (read by blog/index.typ).
  const blogDir = join(CONTENT, "blog");
  if (existsSync(blogDir)) {
    const posts: Post[] = [];
    for (const file of findTyp(blogDir)) {
      const slug = relative(blogDir, file).replace(/\.typ$/, "");
      if (slug === "index") continue; // the listing page itself
      const meta = pageMeta(file);
      posts.push({
        page: "/" + relative(ROOT, file).split(sep).join("/"),
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
  for (const file of pages) {
    const rel = relative(CONTENT, file).replace(/\.typ$/, ".html");
    const meta = pageMeta(file);
    const bodyHtml = extractBody(compileHtml(file));

    // Head channel, deduplicated: #style sheets, #head tags, #script files.
    const headStyles = uniq(pageStyleSrcs(file).map((p) => emitStyle(resolveAsset(file, p))));
    const headTags = uniq(pageHeadTags(file).map(renderHeadTag));
    const headScripts = uniq(pageScriptSrcs(file).map((p) => emitScript(resolveAsset(file, p))));
    // Inline blocks: transpile, inject before </body>. (#toc() ships its own
    // scroll-spy through this same channel, so the SSG needs no TOC logic.)
    const scripts = pageScripts(file).map(transpile);
    const html = shell({
      title: meta.title, siteName: site.name, nav: site.nav,
      bodyHtml, headStyles, headTags, headScripts, scripts,
    });

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
