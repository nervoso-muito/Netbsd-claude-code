import { createInterface } from "node:readline";
import { readFile, writeFile, chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { CLAUDE_DIR } from "./config.mjs";
import chalk from "chalk";

const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTH_ENDPOINT = "https://claude.com/cai/oauth/authorize";
const TOKEN_ENDPOINT = "https://platform.claude.com/v1/oauth/token";
const SCOPES = ["user:profile", "user:inference", "user:sessions:claude_code", "user:mcp_servers"];
const CREDENTIALS_FILE = join(CLAUDE_DIR, ".credentials.json");
const MANUAL_REDIRECT_URL = "https://platform.claude.com/oauth/code/callback";

/**
 * Load stored credentials (OAuth or API key).
 */
export async function loadCredentials() {
  try {
    const text = await readFile(CREDENTIALS_FILE, "utf-8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Save credentials to disk (mode 0600).
 */
export async function saveCredentials(data) {
  await mkdir(CLAUDE_DIR, { recursive: true });
  await writeFile(CREDENTIALS_FILE, JSON.stringify(data, null, 2), "utf-8");
  await chmod(CREDENTIALS_FILE, 0o600);
}

/**
 * Get the auth method: "oauth", "apikey", or null.
 */
export function getAuthMethod(creds) {
  if (!creds) return null;
  if (creds.apiKey) return "apikey";
  if (creds.claudeAiOauth) return "oauth";
  return null;
}

/**
 * Get the API key from credentials (env var or stored).
 */
export function getStoredApiKey(creds) {
  return creds?.apiKey ?? null;
}

/**
 * Check if OAuth token is expired (with 5 min buffer).
 */
export function isTokenExpired(creds) {
  if (!creds?.expiresAt) return true;
  return Date.now() >= creds.expiresAt - 5 * 60 * 1000;
}

/**
 * Refresh the OAuth access token.
 */
export async function refreshAccessToken(oauth) {
  if (!oauth?.refreshToken) {
    throw new Error("No refresh token available. Run: ncc login");
  }

  const body = {
    grant_type: "refresh_token",
    refresh_token: oauth.refreshToken,
    client_id: CLIENT_ID,
  };

  const resp = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error("Token refresh failed (" + resp.status + "): " + errText);
  }

  const data = await resp.json();

  const updated = {
    ...oauth,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? oauth.refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };

  const allCreds = await loadCredentials() ?? {};
  allCreds.claudeAiOauth = updated;
  await saveCredentials(allCreds);
  return updated;
}

/**
 * Get a valid OAuth access token — loads from disk, refreshes if expired.
 */
export async function getAccessToken() {
  const allCreds = await loadCredentials();
  let oauth = allCreds?.claudeAiOauth ?? null;
  if (!oauth) return null;

  if (isTokenExpired(oauth)) {
    try {
      oauth = await refreshAccessToken(oauth);
    } catch (err) {
      process.stderr.write(chalk.red("Token refresh failed: " + err.message + "\n"));
      return null;
    }
  }

  return oauth.accessToken;
}

/**
 * Generate PKCE code verifier and challenge.
 */
function generatePKCE() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/**
 * Prompt helper — ask a question and return the answer.
 */
function askQuestion(prompt) {
  return new Promise((resolve) => {
    let resolved = false;
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true,
    });

    rl.on("line", (line) => {
      if (!resolved) {
        resolved = true;
        rl.close();
        resolve((line ?? "").trim());
      }
    });

    rl.on("close", () => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });

    process.stderr.write(prompt);
  });
}

/**
 * Run the login flow — user chooses OAuth or API key.
 */
export async function login() {
  process.stderr.write("\n");
  process.stderr.write(chalk.bold("  How would you like to authenticate?\n\n"));
  process.stderr.write("  1) OAuth (use your claude.ai Pro/Team account)\n");
  process.stderr.write("  2) API Key (use an Anthropic API key)\n\n");

  const choice = await askQuestion(chalk.bold.blue("  Choose [1/2] > "));

  if (choice === "2") {
    return loginWithApiKey();
  }
  return loginWithOAuth();
}

/**
 * Login with API key.
 */
async function loginWithApiKey() {
  process.stderr.write("\n");
  process.stderr.write(chalk.bold("  Get your API key from: https://console.anthropic.com/settings/keys\n\n"));

  const key = await askQuestion(chalk.bold.blue("  Paste API key > "));

  if (!key || !key.startsWith("sk-")) {
    process.stderr.write(chalk.red("\n  Invalid API key. Keys start with sk-\n\n"));
    return null;
  }

  process.stderr.write(chalk.dim("\n  Validating key...\n"));

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    if (!resp.ok && resp.status !== 429) {
      const errText = await resp.text();
      throw new Error("API key validation failed (" + resp.status + "): " + errText);
    }
  } catch (err) {
    if (err.message.includes("validation failed")) {
      process.stderr.write(chalk.red("\n  " + err.message + "\n\n"));
      return null;
    }
  }

  const allCreds = await loadCredentials() ?? {};
  allCreds.apiKey = key;
  await saveCredentials(allCreds);

  process.stderr.write(chalk.green("\n  ✓ API key saved!\n"));
  process.stderr.write(chalk.dim("  Credentials saved to " + CREDENTIALS_FILE + "\n\n"));

  return { apiKey: key };
}

/**
 * Login with OAuth (claude.ai account).
 */
async function loginWithOAuth() {
  const { verifier, challenge } = generatePKCE();
  const state = randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: MANUAL_REDIRECT_URL,
    scope: SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  const authUrl = AUTH_ENDPOINT + "?" + params.toString();

  process.stderr.write("\n");
  process.stderr.write(chalk.bold("  Step 1: Open this URL in your browser:\n\n"));
  process.stderr.write(chalk.cyan("  " + authUrl + "\n\n"));
  process.stderr.write(chalk.bold("  Step 2: Log in and click \"Authorize\"\n"));
  process.stderr.write(chalk.bold("  Step 3: Copy the code shown in the browser\n"));
  process.stderr.write(chalk.bold("  Step 4: Paste it below\n\n"));

  const code = await askQuestion(chalk.bold.blue("  Paste code here > "));

  if (!code) {
    process.stderr.write(chalk.red("\n  Login cancelled — no code received.\n\n"));
    return null;
  }

  process.stderr.write(chalk.dim("\n  Exchanging code for token...\n"));

  const codePart = code.split("#")[0].trim();

  const body = {
    grant_type: "authorization_code",
    code: codePart,
    redirect_uri: MANUAL_REDIRECT_URL,
    client_id: CLIENT_ID,
    code_verifier: verifier,
    state,
  };

  const resp = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error("Token exchange failed (" + resp.status + "): " + errText);
  }

  const data = await resp.json();

  const oauth = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    scopes: SCOPES,
  };

  const allCreds = await loadCredentials() ?? {};
  allCreds.claudeAiOauth = oauth;
  await saveCredentials(allCreds);

  process.stderr.write(chalk.green("\n  ✓ Logged in successfully!\n"));
  process.stderr.write(chalk.dim("  Credentials saved to " + CREDENTIALS_FILE + "\n\n"));

  return oauth;
}
