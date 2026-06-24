export const coverConfig = {
  provider: process.env.COVER_PROVIDER || "lumio",
  size: { width: 1200, height: 675 },
  palette: {
    bg: "#090d12",
    brand: "#22d3ee",
    accent: "#a78bfa",
    text: "#eef6ff",
    muted: "#9aa7b8"
  },
  cacheDir: ".cache/covers",
  outDir: "assets/posts",
  manifest: ".cache/covers/manifest.json"
};
