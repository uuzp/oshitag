export const I18N_STORAGE_LANG = 'oshitag:i18n:lang';
export const I18N_STORAGE_USER_LOCALES = 'oshitag:i18n:userLocales:v1';

export const BUILTIN_LOCALES = [
  { code: 'zh-CN', path: './i18n/zh-CN.json' },
  { code: 'en', path: './i18n/en.json' },
  { code: 'ja', path: './i18n/ja.json' },
  { code: 'ko', path: './i18n/ko.json' }
];

export const i18n = {
  ready: false,
  locale: 'zh-CN',
  mode: 'auto',
  bundles: new Map(),
  strings: {},
  fallback: 'zh-CN'
};

function getBrowserLangCandidates() {
  const raw = String(navigator.language || '').trim();
  if (!raw) return ['zh-CN'];

  const lower = raw.toLowerCase();
  const base = lower.split('-')[0];
  const out = [raw, lower, base];
  if (base === 'zh') out.push('zh-CN');
  return Array.from(new Set(out));
}

export function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function loadUserLocales() {
  const raw = localStorage.getItem(I18N_STORAGE_USER_LOCALES);
  if (!raw) return {};
  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== 'object') return {};
  return parsed;
}

export function saveUserLocales(obj) {
  localStorage.setItem(I18N_STORAGE_USER_LOCALES, JSON.stringify(obj));
}

async function loadBuiltinLocale(def) {
  try {
    const res = await fetch(def.path, { cache: 'no-cache' });
    const data = await res.json();
    if (!data || typeof data !== 'object') throw new Error('invalid');
    const name = String(data['meta.name'] || def.code);
    return { code: def.code, name, strings: data };
  } catch {
    return { code: def.code, name: def.code, strings: {} };
  }
}

export function pickLocaleAuto() {
  const have = new Set(i18n.bundles.keys());
  for (const candidate of getBrowserLangCandidates()) {
    const normalized = String(candidate).trim();
    if (!normalized) continue;
    if (have.has(normalized)) return normalized;

    const found = Array.from(have).find((code) => code.toLowerCase() === normalized.toLowerCase());
    if (found) return found;

    const base = normalized.toLowerCase().split('-')[0];
    const baseFound = Array.from(have).find((code) => code.toLowerCase().split('-')[0] === base);
    if (baseFound) return baseFound;
  }
  return i18n.fallback;
}

export function t(key, vars) {
  const raw = i18n.strings?.[key];
  const base = raw == null ? '' : String(raw);
  if (!vars) return base;
  return base.replace(/\{(\w+)\}/g, (_, k) => {
    const value = vars[k];
    return value == null ? '' : String(value);
  });
}

export function applyI18n() {
  const fallback = i18n.bundles.get(i18n.fallback)?.strings || {};
  const current = i18n.bundles.get(i18n.locale)?.strings || {};
  i18n.strings = { ...fallback, ...current };

  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    if (!key) continue;
    const text = t(key);
    if (text) el.textContent = text;
  }

  document.title = t('app.title') || document.title;
}

export async function initI18n() {
  const builtins = await Promise.all(BUILTIN_LOCALES.map(loadBuiltinLocale));
  for (const bundle of builtins) {
    i18n.bundles.set(bundle.code, { name: bundle.name, strings: bundle.strings });
  }

  const user = loadUserLocales();
  for (const [code, bundle] of Object.entries(user)) {
    if (!bundle || typeof bundle !== 'object') continue;
    const name = String(bundle.name || code);
    const strings = bundle.strings && typeof bundle.strings === 'object' ? bundle.strings : {};
    i18n.bundles.set(code, { name, strings });
  }

  const saved = localStorage.getItem(I18N_STORAGE_LANG);
  if (saved && saved !== 'auto') {
    i18n.mode = 'manual';
    i18n.locale = saved;
  } else {
    i18n.mode = 'auto';
    i18n.locale = pickLocaleAuto();
  }

  if (!i18n.bundles.has(i18n.locale)) i18n.locale = i18n.fallback;

  i18n.ready = true;
  applyI18n();
}