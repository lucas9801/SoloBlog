const endpoint = "https://api.openai.com/v1/images/generations";

export const openaiProvider = {
  name: "openai",
  async generate(request) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      const error = new Error("OPENAI_API_KEY is not set. Add it to .env or the shell environment before running without --dry-run.");
      error.retryable = false;
      throw error;
    }

    const model = process.env.COVER_OPENAI_MODEL || "gpt-image-1";
    const body = requestBody(model, request);
    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(openaiErrorMessage(response.status, payload));
      error.retryable = response.status === 429 || response.status >= 500;
      throw error;
    }

    const image = payload.data?.[0];
    if (image?.b64_json) return Buffer.from(image.b64_json, "base64");
    if (image?.url) {
      const imageResponse = await fetchWithTimeout(image.url);
      if (!imageResponse.ok) throw new Error(`OpenAI image URL download failed with HTTP ${imageResponse.status}`);
      return Buffer.from(await imageResponse.arrayBuffer());
    }

    throw new Error("OpenAI response did not include b64_json or url image data.");
  }
};

function requestBody(model, request) {
  const prompt = request.negativePrompt
    ? `${request.prompt}\n\nNegative constraints: ${request.negativePrompt}`
    : request.prompt;

  if (model.startsWith("dall-e")) {
    return {
      model,
      prompt,
      n: 1,
      size: process.env.COVER_OPENAI_SIZE || request.size || "1792x1024",
      quality: process.env.COVER_OPENAI_QUALITY || "standard",
      response_format: "b64_json"
    };
  }

  return {
    model,
    prompt,
    n: 1,
    size: process.env.COVER_OPENAI_SIZE || request.size || "1536x1024",
    quality: process.env.COVER_OPENAI_QUALITY || "medium",
    output_format: "png"
  };
}

async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = Number.parseInt(process.env.COVER_PROVIDER_TIMEOUT_MS || "120000", 10);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error(`OpenAI image request timed out after ${timeoutMs}ms`);
      timeoutError.retryable = true;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function openaiErrorMessage(status, payload) {
  const message = payload?.error?.message || payload?.message || "Unknown OpenAI image generation error.";
  return `OpenAI image generation failed with HTTP ${status}: ${message}`;
}
