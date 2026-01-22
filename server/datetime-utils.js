/**
 * datetime-utils.js - Módulo centralizado de Data/Hora para o Backend
 * Fuso horário padrão: America/Sao_Paulo (Brasília - BRT/BRST)
 * 
 * Este módulo garante que todas as datas gravadas no banco de dados
 * estejam no fuso horário correto de Brasília.
 */

const TIMEZONE = 'America/Sao_Paulo';
const LOCALE = 'pt-BR';

/**
 * Retorna a data/hora atual formatada para o banco de dados (YYYY-MM-DD HH:mm:ss)
 * no fuso horário de Brasília
 * @returns {string}
 */
function nowForDB() {
  const now = new Date();
  return formatDateTimeISO(now);
}

/**
 * Retorna apenas a data atual no formato ISO (YYYY-MM-DD) em Brasília
 * @returns {string}
 */
function todayISO() {
  return formatDateISO(new Date());
}

/**
 * Formata uma data no formato ISO (YYYY-MM-DD) no fuso de Brasília
 * @param {Date|string|number} input 
 * @returns {string}
 */
function formatDateISO(input) {
  const date = parseToDate(input);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

/**
 * Formata data/hora no formato ISO para banco de dados (YYYY-MM-DD HH:mm:ss)
 * @param {Date|string|number} input 
 * @returns {string}
 */
function formatDateTimeISO(input) {
  const date = parseToDate(input);
  const datePart = formatDateISO(date);
  const timePart = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
  return `${datePart} ${timePart}`;
}

/**
 * Formata data/hora completa no padrão brasileiro (DD/MM/YYYY HH:mm:ss)
 * @param {Date|string|number} input 
 * @returns {string}
 */
function formatDateTime(input) {
  const date = parseToDate(input);
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

/**
 * Formata apenas a data no padrão brasileiro (DD/MM/YYYY)
 * @param {Date|string|number} input 
 * @returns {string}
 */
function formatDate(input) {
  const date = parseToDate(input);
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

/**
 * Formata apenas a hora (HH:mm:ss)
 * @param {Date|string|number} input 
 * @returns {string}
 */
function formatTime(input) {
  const date = parseToDate(input);
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

/**
 * Converte string de data para objeto Date, tratando diferentes formatos
 * @param {Date|string|number} input 
 * @returns {Date}
 */
function parseToDate(input) {
  if (!input) return new Date();
  if (input instanceof Date) return input;
  if (typeof input === 'number') return new Date(input);
  
  const s = String(input).trim();
  
  // YYYY-MM-DD (data ISO simples) - interpretar como meia-noite em Brasília
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    // Brasília está em UTC-3, então meia-noite em Brasília = 03:00 UTC
    return new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
  }
  
  // YYYY-MM-DD HH:mm:ss (sem timezone) - interpretar como horário de Brasília
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(s)) {
    const normalized = s.replace('T', ' ');
    const [datePart, timePart] = normalized.split(' ');
    const [y, m, d] = datePart.split('-').map(Number);
    const timeComponents = timePart.split(':');
    const hh = parseInt(timeComponents[0], 10);
    const mm = parseInt(timeComponents[1], 10);
    const ss = parseFloat(timeComponents[2]) || 0;
    // Converter de Brasília para UTC: adicionar 3 horas
    return new Date(Date.UTC(y, m - 1, d, hh + 3, mm, Math.floor(ss)));
  }
  
  // ISO com timezone - deixar o JS interpretar
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed;
  
  // Fallback
  const parsed2 = new Date(s.replace(' ', 'T'));
  if (!isNaN(parsed2.getTime())) return parsed2;
  
  console.warn('DateTimeUtils: Não foi possível interpretar a data:', input);
  return new Date();
}

/**
 * Verifica se duas datas são do mesmo dia (no fuso de Brasília)
 * @param {Date|string|number} date1 
 * @param {Date|string|number} date2 
 * @returns {boolean}
 */
function isSameDay(date1, date2) {
  return formatDateISO(date1) === formatDateISO(date2);
}

/**
 * Verifica se a data é hoje (no fuso de Brasília)
 * @param {Date|string|number} input 
 * @returns {boolean}
 */
function isToday(input) {
  return isSameDay(input, new Date());
}

/**
 * Adiciona dias a uma data
 * @param {Date|string|number} input 
 * @param {number} days 
 * @returns {Date}
 */
function addDays(input, days) {
  const date = parseToDate(input);
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Retorna a hora (0-23) no fuso de Brasília
 * @param {Date|string|number} input 
 * @returns {number}
 */
function getHour(input) {
  const date = parseToDate(input);
  const hourStr = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    hour: '2-digit',
    hour12: false
  }).format(date);
  return parseInt(hourStr, 10);
}

module.exports = {
  TIMEZONE,
  LOCALE,
  nowForDB,
  todayISO,
  formatDateISO,
  formatDateTimeISO,
  formatDateTime,
  formatDate,
  formatTime,
  parseToDate,
  isSameDay,
  isToday,
  addDays,
  getHour
};
