// The user's own API key. By default it lives only until the tab closes (sessionStorage);
// "remember" keeps it in this browser (localStorage). Never part of a backup file.
export const KEY_NAME = 'barbuilder.aikey';

export function getKey(local, session) {
  try {
    return session?.getItem(KEY_NAME) || local?.getItem(KEY_NAME) || '';
  } catch (e) {
    return '';
  }
}
export function keyWhere(local, session) {
  try {
    if (session?.getItem(KEY_NAME)) return 'tab';
    if (local?.getItem(KEY_NAME)) return 'browser';
  } catch (e) {}
  return '';
}
export const looksLikeKey = (k) => /^sk-ant-[A-Za-z0-9_-]{10,}$/.test(String(k).trim());
export function clearKey(local, session) {
  try {
    session?.removeItem(KEY_NAME);
    local?.removeItem(KEY_NAME);
  } catch (e) {}
}
export function saveKey(key, remember, local, session) {
  clearKey(local, session);
  try {
    (remember ? local : session)?.setItem(KEY_NAME, String(key).trim());
    return true;
  } catch (e) {
    return false;
  }
}
