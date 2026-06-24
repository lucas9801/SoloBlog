const defaultBaseUrl = "https://api.lumio.games";

export const lumioProvider = {
  name: "lumio",
  async generate(request) {
    const key = process.env.LUMIO_API_KEY || process.env.COVER_LUMIO_API_KEY;
    if (!key) {
      const error = new Error("LUMIO_API_KEY is not set. Add it to .env or the shell environment before running without --dry-run.");
      error.retryable = false;
      throw error;
    }

    const baseUrl = (process.env.LUMIO_API_BASE_URL || defaultBaseUrl).replace(/\/+$/, "");
    const response = await fetchWithTimeout(`${baseUrl}/v1/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.COVER_LUMIO_MODEL || "gpt-image-2",
        prompt: request.prompt,
        size: process.env.COVER_LUMIO_SIZE || request.size || "1792x1024"
      })
    });

    const contentType = response.headers.get("content-type") || "";
    if (contentType.startsWith("image/")) {
      if (!response.ok) throw httpError(response.status, "Lumio returned an image error response.");
      return Buffer.from(await response.arrayBuffer());
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || "Unknown Lumio image generation error.";
      throw httpError(response.status, message);
    }

    const image = payload.data?.[0] || payload.data || payload;
    const b64 = image?.b64_json || image?.base64 || image?.image_base64 || image?.image;
    if (typeof b64 === "string" && isBase64Image(b64)) {
      return Buffer.from(stripDataUrl(b64), "base64");
    }

    const url = image?.url || image?.image_url || image?.output_url;
    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
      const imageResponse = await fetchWithTimeout(url);
      if (!imageResponse.ok) throw new Error(`Lumio image URL download failed with HTTP ${imageResponse.status}`);
      return Buffer.from(await imageResponse.arrayBuffer());
    }

    throw new Error("Lumio response did not include image bytes, base64 image data, or an image URL.");
  }
};

async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = Number.parseInt(process.env.COVER_PROVIDER_TIMEOUT_MS || "180000", 10);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error(`Lumio image request timed out after ${timeoutMs}ms`);
      timeoutError.retryable = true;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function httpError(status, message) {
  const error = new Error(`Lumio image generation failed with HTTP ${status}: ${message}`);
  error.retryable = status === 429 || status >= 500;
  return error;
}

function stripDataUrl(value) {
  return value.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
}

function isBase64Image(value) {
  const stripped = stripDataUrl(value).trim();
  return stripped.length > 100 && /^[A-Za-z0-9+/=\r\n]+$/.test(stripped);
}
