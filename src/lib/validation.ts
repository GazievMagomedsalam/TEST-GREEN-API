import type { Credentials } from '../types';

export function normalizePhone(value: string): string {
  if (/[^\d\s()+-]/.test(value))
    throw new Error('В номере могут быть только цифры, пробелы, +, скобки и дефисы.');
  let phone = value.replace(/\D/g, '');
  if (phone.length === 11 && phone.startsWith('8')) phone = `7${phone.slice(1)}`;
  if (!/^(7\d{10}|375\d{9})$/.test(phone)) {
    throw new Error('Укажи номер с кодом +7 или +375. Например: +7 999 123-45-67.');
  }
  return phone;
}

export function validateCredentials(value: Credentials): Credentials {
  const idInstance = value.idInstance.trim();
  const apiTokenInstance = value.apiTokenInstance.trim();
  if (!/^\d+$/.test(idInstance)) throw new Error('idInstance должен состоять из цифр.');
  if (!apiTokenInstance || /\s/.test(apiTokenInstance))
    throw new Error('Проверь apiTokenInstance: он не должен быть пустым или содержать пробелы.');
  let url: URL;
  try {
    url = new URL(value.apiUrl.trim());
  } catch {
    throw new Error('Скопируй полный apiUrl из кабинета GREEN-API, начиная с https://.');
  }
  if (
    url.protocol !== 'https:' ||
    !/^(?:[a-z0-9-]+\.)*api\.green-api\.com$/.test(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !/^\/(v3\/?)?$/.test(url.pathname)
  ) {
    throw new Error(
      'Нужен HTTPS-адрес сервера GREEN-API из поля apiUrl, без ключей и названия метода.',
    );
  }
  return { apiUrl: url.origin, idInstance, apiTokenInstance };
}

export function formatPhone(phone: string) {
  if (/^7\d{10}$/.test(phone))
    return `+7 ${phone.slice(1, 4)} ${phone.slice(4, 7)}-${phone.slice(7, 9)}-${phone.slice(9)}`;
  if (/^375\d{9}$/.test(phone))
    return `+375 ${phone.slice(3, 5)} ${phone.slice(5, 8)}-${phone.slice(8, 10)}-${phone.slice(10)}`;
  return `+${phone}`;
}

export const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
