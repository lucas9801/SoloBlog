import crypto from "node:crypto";

export const categoryMotifs = {
  Unity: {
    label: "UNITY",
    subject: "modern game engine workstation, multiple monitors with code and scene views, cool glowing machine chassis"
  },
  工具链: {
    label: "TOOLCHAIN",
    subject: "automation pipeline, terminal command streams, abstract mechanical CI pipeline structure"
  },
  图形渲染: {
    label: "RENDERING",
    subject: "GPU chip close-up with ray-traced light paths, 3D wireframe shading spheres"
  },
  性能优化: {
    label: "PERFORMANCE",
    subject: "performance flame graph, frame time curves, hardware cooling fins and frequency diagnostics"
  },
  架构设计: {
    label: "ARCHITECTURE",
    subject: "modular node topology, circuit board traces, volumetric system blueprint"
  },
  游戏开发: {
    label: "GAME DEV",
    subject: "3D level blockout viewport, character wireframe, geometric props and engine editor panels"
  },
  随笔: {
    label: "NOTES",
    subject: "minimal technical desk, keyboard, quiet workstation with subtle micro lights"
  }
};

const tagKeywords = new Map([
  ["渲染", "rendering"],
  ["图形", "graphics"],
  ["性能", "performance"],
  ["优化", "optimization"],
  ["内存", "memory"],
  ["工具", "tooling"],
  ["工具链", "toolchain"],
  ["工程", "engineering"],
  ["架构", "architecture"],
  ["模块", "modules"],
  ["游戏", "game development"],
  ["随笔", "notes"],
  ["纹理", "textures"],
  ["光照", "lighting"],
  ["管线", "pipeline"],
  ["自动化", "automation"],
  ["构建", "build pipeline"],
  ["测试", "testing"],
  ["Unity", "Unity"],
  ["Shader", "shader"],
  ["CPU", "CPU"],
  ["GPU", "GPU"],
  ["Profiler", "profiler"],
  ["Draw Call", "draw calls"],
  ["Overdraw", "overdraw"]
]);

export function buildPrompt(article, config) {
  const motif = categoryMotifs[article.category] || {
    label: "DEV NOTES",
    subject: "abstract deep dark technology texture, precise hardware panels and subtle diagnostic lights"
  };
  const keywords = tagPromptKeywords(article.tags);
  const keywordLine = keywords.length ? `${keywords.join(", ")},` : "software engineering, technical diagnostics,";
  const prompt = [
    `${motif.subject}, ${keywordLine}`,
    `dark moody tech aesthetic, deep navy black background (${config.palette.bg}),`,
    `cyan teal accent lighting (${config.palette.brand}), subtle violet glow (${config.palette.accent}),`,
    "cinematic depth of field, high detail, photographic, realistic 3D rendered technology scene,",
    "clean composition with empty negative space on the left and lower-left for title overlay, main subject shifted center-right,",
    "16:9, no text, no watermark, no logo, no people faces, no gibberish letters"
  ].join("\n");
  const negativePrompt = "text, watermark, logo, people faces, gibberish letters, low contrast, blurry title area";

  return {
    prompt,
    negativePrompt,
    promptHash: crypto.createHash("sha1").update(`${prompt}\n${negativePrompt}`).digest("hex"),
    channelLabel: motif.label
  };
}

function tagPromptKeywords(tags) {
  const values = [];
  for (const tag of tags) {
    const mapped = tagKeywords.get(tag) || tagKeywords.get(String(tag).trim());
    const value = mapped || asciiKeyword(tag);
    if (value && !values.includes(value)) values.push(value);
    if (values.length === 4) break;
  }
  return values.length ? values : ["technical diagnostics", "software systems"];
}

function asciiKeyword(value) {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9#+.\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /[a-z0-9]/i.test(normalized) ? normalized.toLowerCase() : "";
}
