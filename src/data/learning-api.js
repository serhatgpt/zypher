const TOKEN_KEY = 'zypher_auth_token';
const EMAIL_KEY = 'zypher_auth_email';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthEmail() {
  return localStorage.getItem(EMAIL_KEY);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
}

async function requestJson(path, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || 'Request failed');
  }
  return data;
}

export async function registerOrLogin(email, password, mode = 'login') {
  const data = await requestJson(`/api/user/${mode}`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(EMAIL_KEY, data.user.email);
  return data;
}

export async function createWordInDb(term, level = 'A2') {
  return requestJson('/api/learning/words', {
    method: 'POST',
    body: JSON.stringify({ term, level }),
  });
}

export async function getLearningMe() {
  return requestJson('/api/learning/me');
}

export async function recordPracticeInDb(payload) {
  return requestJson('/api/learning/practice-sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
