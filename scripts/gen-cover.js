#!/usr/bin/env node
/*
 * Offline post cover CLI.
 *
 * Configure secrets in .env or the shell, for example:
 *   LUMIO_API_KEY=...
 *   COVER_PROVIDER=lumio
 *   COVER_LUMIO_MODEL=gpt-image-2
 *
 * Useful commands:
 *   npm run cover -- --slug render-optimization-checklist --dry-run
 *   npm run cover -- --slug render-optimization-checklist
 *   npm run cover -- --all
 *   npm run cover -- --slug render-optimization-checklist --recomposite
 */
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { coverConfig } from "./cover/config.js";
import { findArticles, writeArticleCover } from "./cover/article.js";
import { buildPrompt } from "./cover/prompt.js";
import { compositeCover } from "./cover/composite.js";
import { getProvider, generateWithRetry } from "./cover/providers/index.js";
import { manifestEntry, readManifest, setManifestEntry, writeManifest } from "./cover/manifest.js";

const root = process.cwd();

await loadEnv();

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printUsage();
  process.exit(0);
}

validateSelection(options);

const config = {
  ...coverConfig,
  provider: options.provider || coverConfig.provider
};
const manifestPath = path.resolve(root, config.manifest);
const cacheDir = path.resolve(root, config.cacheDir);
const outDir = path.resolve(root, config.outDir);
const manifest = await readManifest(manifestPath);
const provider = getProvider(config.provider);
const articles = await findArticles(options);

let failed = false;
for (const article of articles) {
  try {
    if (options.all && article.data.cover && !options.force) {
      console.log(`skip: ${article.slug} already has cover ${article.data.cover}`);
      continue;
    }
    await processArticle(article);
  } catch (error) {
    failed = true;
    console.error(`failed: ${article.slug}: ${error.message}`);
  }
}

if (failed) process.exit(1);

async function processArticle(article) {
  const promptInfo = buildPrompt(article, config);
  const outputPath = path.join(outDir, `${article.slug}.webp`);
  const outputUrl = `/assets/posts/${article.slug}.webp`;
  const sourcePath = path.join(cacheDir, `${article.slug}.src.png`);
  const entry = manifestEntry(manifest, article.slug);
  const upToDate =
    !options.force &&
    !options.recomposite &&
    entry?.promptHash === promptInfo.promptHash &&
    entry?.provider === provider.name &&
    (await exists(outputPath));

  if (options.dryRun) {
    printDryRun(article, promptInfo, outputUrl);
    return;
  }

  if (upToDate) {
    if (article.data.cover !== outputUrl) {
      await writeArticleCover(article, outputUrl);
      console.log(`ok: ${article.slug} frontmatter -> ${outputUrl}`);
      return;
    }
    console.log(`skip: ${article.slug} up to date`);
    return;
  }

  await mkdir(cacheDir, { recursive: true });
  await mkdir(outDir, { recursive: true });

  if (options.recomposite) {
    if (!(await exists(sourcePath))) {
      throw new Error(`Cannot recomposite without cached source image: ${path.relative(root, sourcePath)}`);
    }
  } else {
    const image = await generateWithRetry(provider, {
      prompt: promptInfo.prompt,
      negativePrompt: promptInfo.negativePrompt,
      width: config.size.width,
      height: config.size.height,
      size: process.env.COVER_PROVIDER_SIZE
    });
    const tempSource = `${sourcePath}.tmp`;
    await writeFile(tempSource, image);
    await rename(tempSource, sourcePath);
  }

  await compositeCover({
    sourcePath,
    outputPath,
    article,
    promptInfo,
    config
  });
  await writeArticleCover(article, outputUrl);
  setManifestEntry(manifest, {
    slug: article.slug,
    promptHash: promptInfo.promptHash,
    provider: provider.name,
    output: outputUrl,
    source: path.relative(root, sourcePath).replaceAll("\\", "/"),
    generatedAt: new Date().toISOString()
  });
  await writeManifest(manifestPath, manifest);
  console.log(`ok: ${article.slug} -> ${outputUrl}`);
}

function printDryRun(article, promptInfo, outputUrl) {
  console.log(`post: ${path.relative(root, article.filePath)}`);
  console.log(`output: ${outputUrl}`);
  console.log(`provider: ${provider.name}`);
  console.log(`promptHash: ${promptInfo.promptHash}`);
  console.log("prompt:");
  console.log(promptInfo.prompt);
  console.log("negativePrompt:");
  console.log(promptInfo.negativePrompt);
}

function parseArgs(args) {
  const parsed = {
    slug: "",
    file: "",
    all: false,
    force: false,
    dryRun: false,
    recomposite: false,
    provider: "",
    help: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--slug") parsed.slug = requireValue(args, ++index, arg);
    else if (arg === "--file") parsed.file = requireValue(args, ++index, arg);
    else if (arg === "--provider") parsed.provider = requireValue(args, ++index, arg);
    else if (arg === "--all") parsed.all = true;
    else if (arg === "--force") parsed.force = true;
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--recomposite") parsed.recomposite = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function validateSelection(options) {
  const selected = [Boolean(options.slug), Boolean(options.file), options.all].filter(Boolean).length;
  if (selected !== 1) {
    printUsage();
    throw new Error("Choose exactly one of --slug, --file, or --all.");
  }
  if (options.force && options.dryRun) {
    throw new Error("--force has no effect with --dry-run.");
  }
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

async function loadEnv() {
  const envPath = path.join(root, ".env");
  try {
    const source = await readFile(envPath, "utf8");
    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function exists(filePath) {
  return access(filePath).then(
    () => true,
    () => false
  );
}

function printUsage() {
  console.log(`Usage:
  npm run cover -- --slug <slug> [--force] [--dry-run] [--recomposite] [--provider <name>]
  npm run cover -- --file <path> [--force] [--dry-run] [--recomposite] [--provider <name>]
  npm run cover -- --all [--force] [--dry-run] [--provider <name>]
`);
}
