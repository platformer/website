// Static site generator. Compiles each content/**/*.typ to HTML, lifts the
// <body> into a shared shell, and reads back the metadata the page emitted to
// fill <head> and inject scripts.
//
// Run via `npm run build`; the script adds --disable-warning=ExperimentalWarning
// for stripTypeScriptTypes.

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

// Written back into the source tree; the dev watcher skips these to avoid a
// rebuild loop.
const BLOG_POSTS = join(CONTENT, "blog", "posts.json");
export const GENERATED: string[] = [BLOG_POSTS];

//#region types

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
interface PageData {
  meta: PageMeta;
  scripts: string[];
  scriptSrcs: string[];
  styleSrcs: string[];
  headTags: HeadTag[];
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

//#endregion

//#region typst

// The standing notice that HTML export is experimental. Everything else,
// warnings included, passes through.
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
// `compile` takes its target from --format; `eval` needs it spelled out, or it
// runs against the paged target and drops html.elem content and the metadata
// inside it.
const HTML = COMMON;
const EVAL = [...COMMON, "--target", "html"];

function compileHtml(file: string): string {
  return typst(["compile", ...HTML, "--format", "html", file, "-"]);
}

function evalQuery<T = unknown>(file: string, expr: string): T {
  const out = typst(["eval", ...EVAL, "--format", "json", "--in", file, expr]);
  return JSON.parse(out);
}

// Every channel in one query: a spawn costs far more than the compile, so
// splitting this up triples the build. Memoized for the second pass.
const PAGE_DATA = `(
  meta: query(<page-meta>).map(it => it.value).at(0, default: (:)),
  scripts: query(<inline-script>).map(it => it.value),
  scriptSrcs: query(<script-src>).map(it => it.value),
  styleSrcs: query(<style-src>).map(it => it.value),
  headTags: query(<head-tag>).map(it => it.value),
)`;

const dataCache = new Map<string, PageData>();
function pageData(file: string): PageData {
  let d = dataCache.get(file);
  if (!d) {
    d = evalQuery<PageData>(file, PAGE_DATA);
    dataCache.set(file, d);
  }
  return d;
}

// "/..." is root-absolute, otherwise relative to the referencing .typ.
function resolveAsset(fromFile: string, p: string): string {
  return p.startsWith("/") ? join(ROOT, p.slice(1)) : resolve(dirname(fromFile), p);
}

// Read once per build. Nav entries name a source file, so a rename or typo
// fails here instead of shipping a dead link.
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

// page-url and the output paths below express one rule twice; a mismatch is a
// build error rather than a 404.
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
    const target = url.endsWith("/") ? `${url.slice(1)}index.html` : url.slice(1); // dir URLs serve index.html
    if (target !== written) {
      throw new Error(
        `page-url("${sources[i]}") = "${url}", which needs ${target}, ` +
        `but the build writes ${written}`,
      );
    }
  });
}

//#endregion

//#region assets

// Types are blanked in place, so line numbers survive without a source map.
// Non-erasable syntax (enum, namespace) throws. Per-file, no bundling.
function transpile(code: string): string {
  return stripTypeScriptTypes(code);
}

// content/ mirrors its path (content/misc/x.ts -> /misc/x.js); anything else
// lands under /scripts/.
function scriptOutput(srcAbs: string): { outRel: string; url: string } {
  let rel = relative(ROOT, srcAbs).split(sep).join("/");
  if (rel.startsWith("content/")) rel = rel.slice("content/".length);
  else if (rel.startsWith("../")) rel = `scripts/${basename(srcAbs)}`;
  const outRel = rel.replace(/\.(m?ts|m?js)$/i, ".js");
  return { outRel, url: "/" + outRel };
}

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

// Same path mapping, but files outside content/ land under /styles/.
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

const VOID_TAGS = new Set(["link", "meta", "base", "br", "hr", "img", "input"]);
function renderHeadTag({ tag, attrs }: HeadTag): string {
  const a = Object.entries(attrs || {})
    .map(([k, v]) => ` ${k}="${String(v).replaceAll('"', "&quot;")}"`)
    .join("");
  return VOID_TAGS.has(tag) ? `<${tag}${a}>` : `<${tag}${a}></${tag}>`;
}

//#endregion

//#region page assembly

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

// Typst bakes its light-mode palette into each token as an inline style, which
// CSS can't restyle. Swap the known colours for classes; anything unmapped keeps
// Typst's own.
const TOKENS: Record<string, string> = {
  "#d73948": "kw",
  "#4b69c6": "fn",
  "#198810": "str",
  "#b60157": "num",
  "#74747c": "com",
  "#6b6b6f": "punct",
  "#1d6c76": "esc",
};

function classifyTokens(html: string): string {
  return html.replace(
    /style="color: (#[0-9a-f]{6})"/gi,
    (whole, hex) => {
      const name = TOKENS[hex.toLowerCase()];
      return name ? `class="tok-${name}"` : whole;
    },
  );
}

function extractBody(html: string): string {
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return (m ? m[1] : html).trim();
}

const uniq = <T>(arr: T[]): T[] => [...new Set(arr)];

// Templates emit <main> and the footer, so this contributes only <head> and the
// site header.
function shell({ title, siteName, nav: navItems, bodyHtml, headStyles = [], headTags = [], headScripts = [], scripts = [] }: ShellOptions): string {
  const nav = navItems.map((n) => `<a href="${n.href}">${n.label}</a>`).join("");
  const styleLinks = headStyles
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("\n");
  // type="module" is deferred: runs after DOM parse, in order, head before
  // body. Modules are isolated, so top-level const/let across toys don't clash.
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

//#endregion

export function build(): void {
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  const site = siteConfig();
  const pages = findTyp(CONTENT);
  verifyPageUrls(pages);

  // Blog frontmatter -> posts.json, which blog/index.typ and the home page read
  // at compile time, so it has to land before anything compiles.
  const blogDir = join(CONTENT, "blog");
  if (existsSync(blogDir)) {
    const posts: Post[] = [];
    for (const file of findTyp(blogDir)) {
      const slug = relative(blogDir, file).replace(/\.typ$/, "");
      if (slug === "index") continue; // the listing page itself
      const meta = pageData(file).meta;
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

  let count = 0;
  for (const file of pages) {
    const rel = relative(CONTENT, file).replace(/\.typ$/, ".html");
    const data = pageData(file);
    const bodyHtml = classifyTokens(extractBody(compileHtml(file)));

    const headStyles = uniq(data.styleSrcs.map((p) => emitStyle(resolveAsset(file, p))));
    const headTags = uniq(data.headTags.map(renderHeadTag));
    const headScripts = uniq(data.scriptSrcs.map((p) => emitScript(resolveAsset(file, p))));
    // #toc() ships its scroll-spy through this same channel, so there's no TOC
    // logic here.
    const scripts = data.scripts.map(transpile);
    const html = shell({
      title: data.meta.title, siteName: site.name, nav: site.nav,
      bodyHtml, headStyles, headTags, headScripts, scripts,
    });

    const outPath = join(DIST, rel);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html);
    console.log("  built", rel);
    count += 1;
  }

  if (existsSync(STATIC)) cpSync(STATIC, DIST, { recursive: true });

  console.log(`\nDone: ${count} page(s) -> ${relative(ROOT, DIST)}/`);
}

// Run when invoked directly; stay quiet when imported.
if (process.argv[1] === fileURLToPath(import.meta.url)) build();
