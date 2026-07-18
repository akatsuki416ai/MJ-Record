// localStorage 讀寫包一層 try/catch（避免無痕模式/配額問題直接讓 app 掛掉）。

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[storage] load "${key}" failed`, e);
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn(`[storage] save "${key}" failed`, e);
    return false;
  }
}

export function removeKey(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn(`[storage] remove "${key}" failed`, e);
  }
}
