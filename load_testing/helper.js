import { sleep } from 'k6';

export function readPositiveInt(env, name, fallback) {
  const raw = env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

export function readDurationMs(env, name, fallback) {
  return parseDurationToMs(env[name] || fallback, name);
}

export function formatDurationMs(ms) {
  if (ms % 1000 === 0) {
    return `${ms / 1000}s`;
  }

  return `${ms}ms`;
}

export async function waitForLocatorText(locator, expectedParts, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const text = await locator.textContent().catch(() => '');
    if (text && expectedParts.every(part => text.includes(part))) {
      return;
    }

    sleep(0.25);
  }

  throw new Error(`expected locator text to contain: ${expectedParts.join(', ')}`);
}

export async function waitForLocatorCountAtLeast(locator, minimumCount, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const count = await locator.count();
    if (count >= minimumCount) {
      return;
    }

    sleep(0.5);
  }

  throw new Error(`expected at least ${minimumCount} matching element(s)`);
}

export async function isEnabled(locator) {
  const visible = await locator.isVisible().catch(() => false);
  if (!visible) {
    return false;
  }

  return !(await locator.isDisabled().catch(() => true));
}

function parseDurationToMs(input, name) {
  const value = String(input).trim();
  const match = value.match(/^(\d+)(ms|s|m|h)$/);

  if (!match) {
    throw new Error(`${name} must use a duration like 500ms, 30s, 5m, or 1h`);
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
  };

  return amount * multipliers[unit];
}
