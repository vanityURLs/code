export const DEFAULT_RANDOM_SLUG_LENGTH = 3;
export const MAX_RANDOM_SLUG_LENGTH = 64;
export const DEFAULT_RANDOM_SLUG_ALPHABET = "34789abcdefghjkmnpqrstvwxy";

// Uses the Web Crypto `crypto.getRandomValues` global (available in both Node and the
// Workers runtime) instead of node:crypto's `randomInt`, so this module runs unchanged
// in scripts/v8s-lnk (Node) and scripts/workers/worker.mjs (Workers runtime).
function randomIndex(max) {
  const range = 256 - (256 % max);
  const bytes = new Uint8Array(1);
  let value;
  do {
    crypto.getRandomValues(bytes);
    value = bytes[0];
  } while (value >= range);
  return value % max;
}

export function randomSlug(length, alphabet) {
  const size = normalizeRandomSlugLength(length, "random slug length");
  const characters = normalizeRandomSlugAlphabet(alphabet);
  let slug = "";
  for (let index = 0; index < size; index += 1) {
    slug += characters[randomIndex(characters.length)];
  }
  return slug;
}

export function normalizeRandomSlugLength(value, label = "random slug length") {
  const number = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(number) || number < 1 || number > MAX_RANDOM_SLUG_LENGTH) {
    throw new Error(`${label} must be an integer from 1 to ${MAX_RANDOM_SLUG_LENGTH}.`);
  }
  return number;
}

export function normalizeRandomSlugAlphabet(value) {
  const alphabet = String(value || DEFAULT_RANDOM_SLUG_ALPHABET).trim();
  if (!alphabet) {
    throw new Error("random_slug_alphabet cannot be empty.");
  }

  const unique = [...new Set([...alphabet])].join("");
  if (unique !== alphabet) {
    throw new Error("random_slug_alphabet must not contain duplicate characters.");
  }

  for (const character of alphabet) {
    if (!/^[A-Za-z0-9._~-]$/.test(character)) {
      throw new Error(`Invalid random_slug_alphabet character: ${character}`);
    }
  }

  return alphabet;
}
