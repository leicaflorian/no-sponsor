// Loads release.config.json (versioned) and release.local.json (private, optional) from a folder.
// Part of the self-contained scripts/release/ folder: it imports only node:* and its own files.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ReleaseConfig {
  mainBranch: string;
  devBranch: string;
  remote: string;
  checks: string[]; // shell commands, run in order
  zip: { command: string; output: string }; // output may use {name} and {version}
  changelog: string;
  versionPolicy: string; // plain-English rule given to Claude
  docs: string[]; // repo files Claude checks for outdated text (globs allowed)
  storeTexts: string[]; // absolute paths, from release.local.json only
  nodeVersionFile?: string;
  storeUploadUrl?: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function readJson(path: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new ConfigError(`Cannot read ${path}: ${(e as Error).message}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ConfigError(`${path} must contain a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function str(raw: Record<string, unknown>, field: string, fallback?: string): string {
  const value = raw[field];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || value === '') throw new ConfigError(`"${field}" must be a non-empty string`);
  return value;
}

function optionalStr(raw: Record<string, unknown>, field: string): string | undefined {
  return raw[field] === undefined ? undefined : str(raw, field);
}

function strList(raw: Record<string, unknown>, field: string, required: boolean): string[] {
  const value = raw[field];
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ConfigError(`"${field}" must be a list of strings`);
  }
  if (required && value.length === 0) throw new ConfigError(`"${field}" must not be empty`);
  return value as string[];
}

export function loadConfig(dir: string): ReleaseConfig {
  const raw = readJson(join(dir, 'release.config.json'));
  if ('storeTexts' in raw) throw new ConfigError('storeTexts belongs in release.local.json, not release.config.json');

  const localPath = join(dir, 'release.local.json');
  const local = existsSync(localPath) ? readJson(localPath) : {};

  const zip = raw.zip as Record<string, unknown> | undefined;
  if (typeof zip !== 'object' || zip === null)
    throw new ConfigError('"zip" must be an object with "command" and "output"');

  return {
    mainBranch: str(raw, 'mainBranch', 'main'),
    devBranch: str(raw, 'devBranch', 'dev'),
    remote: str(raw, 'remote', 'origin'),
    checks: strList(raw, 'checks', true),
    zip: { command: str(zip, 'command'), output: str(zip, 'output') },
    changelog: str(raw, 'changelog', 'CHANGELOG.md'),
    versionPolicy: str(raw, 'versionPolicy'),
    docs: strList(raw, 'docs', false),
    storeTexts: strList(local, 'storeTexts', false),
    nodeVersionFile: optionalStr(raw, 'nodeVersionFile'),
    storeUploadUrl: optionalStr(raw, 'storeUploadUrl'),
  };
}

export function resolveZipPath(template: string, vars: { name: string; version: string }): string {
  return template.replaceAll('{name}', vars.name).replaceAll('{version}', vars.version);
}
