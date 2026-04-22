import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { readFile, writeFile, chmod, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { CLAUDE_DIR } from './config.mjs';
import chalk from 'chalk';

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const AUTH_ENDPOINT = 'https://claude.com/cai/oauth/authorize';
const TOKEN_ENDPOINT = 'https://platform.claude.com/v1/oauth/token';
const SCOPES = ['user:profile', 'user:inference', 'user:sessions:claude_code', 'user:mcp_servers'];
const CREDENTIALS_FILE = join(CLAUDE_DIR, '.credentials.json');

// The manual redirect URI — Anthropic's server shows the code on this page
const MANUAL_REDIRECT_URL = 'https://platform.claude.com/oauth/code/callback';

/**
 * Load stored OAuth credentials.
 */
export async function loadCredentials() {
  try {
    const text = await readFile(CREDENTIALS_FILE, 'utf-8');
    const data = JSON.parse(text);
    return data.claudeAiOauth ?? null;
  } catch {
    return null;
  }
}

/**
 * Save OAuth credentials to disk (mode 0600).
 */
export async function saveCredentials(creds) {
  await mkdir(CLAUDE_DIR, { recursive: true });

  let existing = {};
  try {
    const text = await readFile(CREDENTIALS_FILE, 'utf-8');
    existing = JSON.parse(text);
  } catch { /* new file */ }

  existing.claudeAiOauth = creds;

  await writeFile(CREDENTIALS_FILE, JSON.stringify(existing, null, 2), 'utf-8');
  await chmod(CREDENTIALS_FILE, 0o600);
}

/**
 * Check if token is expired (with 5 min buffer).
 */
export function isTokenExpired(creds) {
  if (!creds?.expiresAt) return true;
  return Date.now() >= creds.expiresAt - 5 * 60 * 1000;
}

/**
 * Refresh the access token using the refresh token.
 */
export async function refreshAccessToken(creds) {
  if (!creds?.refreshToken) {
    throw new Error('No refresh token available. Run: ncc login');
  }

  const body = {
    grant_type: 'refresh_token',
    refresh_token: creds.refreshToken,
    client_id: CLIENT_ID,
  };

  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Token refresh failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();

  const updated = {
    ...creds,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? creds.refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };

  await saveCredentials(updated);
  return updated;
}

/**
 * Get a valid OAuth access token — loads from disk, refreshes if expired.
 * Returns the access token string or null if not logged in.
 */
export async function getAccessToken() {
  let creds = await loadCredentials();
  if (!creds) return null;

  if (isTokenExpired(creds)) {
    try {
      creds = await refreshAccessToken(creds);
    } catch (err) {
      process.stderr.write(chalk.red(`Token refresh failed: ${err.message}\n`));
      return null;
    }
  }

  return creds.accessToken;
}

const API_KEY_URL = 'https://api.anthropic.com/api/oauth/claude_cli/create_api_key';

/**
 * Exchange OAuth token for an API key.
 * Claude's API doesn't accept OAuth tokens directly on /v1/messages.
 * Instead, the OAuth token is exchanged for a real API key.
 */
export async function getApiKeyFromOAuth() {
  let creds = await loadCredentials();
  if (!creds) return null;

  // If we already have a derived API key and it's not too old, reuse it
  if (creds.derivedApiKey && creds.derivedApiKeyAt &&
      Date.now() - creds.derivedApiKeyAt < 50 * 60 * 1000) { // refresh every 50 min
    return creds.derivedApiKey;
  }

  // Ensure OAuth token is fresh
  if (isTokenExpired(creds)) {
    try {
      creds = await refreshAccessToken(creds);
    } catch (err) {
      process.stderr.write(chalk.red(`Token refresh failed: ${err.message}\n`));
      return null;
    }
  }

  // Exchange OAuth token for API key
  try {
    const resp = await fetch(API_KEY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({}),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`API key exchange failed (${resp.status}): ${errText}`);
    }

    const data = await resp.json();
    const apiKey = data.raw_key ?? data.api_key ?? data.key;

    if (!apiKey) {
      throw new Error('No API key in response');
    }

    // Cache the derived API key
    creds.derivedApiKey = apiKey;
    creds.derivedApiKeyAt = Date.now();
    await saveCredentials(creds);

    return apiKey;
  } catch (err) {
    process.stderr.write(chalk.red(`API key exchange failed: ${err.message}\n`));
    return null;
  }
}

/**
 * Generate PKCE code verifier and challenge.
 */
function generatePKCE() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/**
 * Run the OAuth login flow.
 *
 * Uses the manual redirect URI (https://platform.claude.com/oauth/code/callback).
 * After the user authorizes, the browser displays the code on that page.
 * The user copies the code and pastes it into the terminal.
 */
export async function login() {
  const { verifier, challenge } = generatePKCE();
  const state = randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: MANUAL_REDIRECT_URL,
    scope: SCOPES.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `${AUTH_ENDPOINT}?${params.toString()}`;

  process.stderr.write('\n');
  process.stderr.write(chalk.bold('  Step 1: Open this URL in your browser:\n\n'));
  process.stderr.write(chalk.cyan(`  ${authUrl}\n\n`));
  process.stderr.write(chalk.bold('  Step 2: Log in and click "Authorize"\n'));
  process.stderr.write(chalk.bold('  Step 3: Copy the code shown in the browser\n'));
  process.stderr.write(chalk.bold('  Step 4: Paste it below\n\n'));

  // Prompt user to paste the code
  const code = await askForCode();

  if (!code) {
    process.stderr.write(chalk.red('\n  Login cancelled — no code received.\n\n'));
    return null;
  }

  process.stderr.write(chalk.dim('\n  Exchanging code for token...\n'));

  // Exchange authorization code for tokens
  const body = {
    grant_type: 'authorization_code',
    code: code.trim(),
    redirect_uri: MANUAL_REDIRECT_URL,
    client_id: CLIENT_ID,
    code_verifier: verifier,
    state,
  };

  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();

  const creds = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    scopes: SCOPES,
  };

  await saveCredentials(creds);

  process.stderr.write(chalk.green('\n  ✓ Logged in successfully!\n'));
  process.stderr.write(chalk.dim(`  Credentials saved to ${CREDENTIALS_FILE}\n\n`));

  return creds;
}

/**
 * Prompt the user to paste the authorization code.
 */
function askForCode() {
  return new Promise((resolve) => {
    let resolved = false;
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true,
    });

    rl.on('line', (line) => {
      if (!resolved) {
        resolved = true;
        rl.close();
        const code = (line ?? '').trim();
        // The pasted value may contain #state suffix from the URL fragment
        const codePart = code.split('#')[0].trim();
        resolve(codePart || null);
      }
    });

    rl.on('close', () => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });

    // Show the prompt
    process.stderr.write(chalk.bold.blue('  Paste code here > '));
  });
}
