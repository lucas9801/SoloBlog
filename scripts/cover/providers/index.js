import { openaiProvider } from "./openai.js";
import { lumioProvider } from "./lumio.js";
import { replicateProvider } from "./replicate.js";
import { jimengProvider } from "./jimeng.js";

const providers = new Map(
  [lumioProvider, openaiProvider, replicateProvider, jimengProvider].map((provider) => [provider.name, provider])
);

/**
 * @typedef {Object} ImageRequest
 * @property {string} prompt
 * @property {string} [negativePrompt]
 * @property {number} width
 * @property {number} height
 * @property {string} [size]
 *
 * @typedef {Object} ImageProvider
 * @property {string} name
 * @property {(req: ImageRequest) => Promise<Buffer>} generate
 */

export function getProvider(name) {
  const provider = providers.get(name);
  if (!provider) {
    throw new Error(`Unknown cover provider "${name}". Available providers: ${[...providers.keys()].join(", ")}`);
  }
  return provider;
}

export async function generateWithRetry(provider, request, retries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await provider.generate(request);
    } catch (error) {
      lastError = error;
      if (attempt === retries || error.retryable === false) break;
      const delay = 600 * 2 ** (attempt - 1);
      console.warn(`cover: provider ${provider.name} failed (${error.message}); retrying in ${delay}ms`);
      await wait(delay);
    }
  }
  throw lastError;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
