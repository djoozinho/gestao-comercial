/**
 * datetime-utils.js - Módulo centralizado de Data/Hora para o Sistema de Gestão Comercial
 * Fuso horário padrão: America/Sao_Paulo (Brasília - BRT/BRST)
 * 
 * IMPORTANTE: Todas as páginas devem usar estas funções para garantir
 * consistência de horários em cupons fiscais, relatórios e telas.
 */

(function(global) {
  'use strict';

  const TIMEZONE = 'America/Sao_Paulo';
  const LOCALE = 'pt-BR';

  /**
   * Retorna a data/hora atual no fuso de Brasília
   * @returns {Date} Objeto Date representando o momento atual
   */
  function now() {
    return new Date();
  }

  /**
   * Formata data/hora completa no padrão brasileiro (DD/MM/YYYY HH:mm:ss)
   * @param {Date|string|number} input - Data a ser formatada
   * @returns {string} Data formatada (ex: "21/01/2026 14:30:45")
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
   * @param {Date|string|number} input - Data a ser formatada
   * @returns {string} Data formatada (ex: "21/01/2026")
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
   * Formata apenas a hora no padrão brasileiro (HH:mm:ss)
   * @param {Date|string|number} input - Data/hora a ser formatada
   * @returns {string} Hora formatada (ex: "14:30:45")
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
   * Formata hora sem segundos (HH:mm)
   * @param {Date|string|number} input - Data/hora a ser formatada
   * @returns {string} Hora formatada (ex: "14:30")
   */
  function formatTimeShort(input) {
    const date = parseToDate(input);
    return new Intl.DateTimeFormat(LOCALE, {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  }

  /**
   * Retorna a data no formato ISO (YYYY-MM-DD) no fuso de Brasília
   * @param {Date|string|number} input - Data a ser formatada
   * @returns {string} Data ISO (ex: "2026-01-21")
   */
  function formatDateISO(input) {
    const date = parseToDate(input);
    // Usar en-CA que já retorna YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  }

  /**
   * Retorna data/hora no formato ISO (YYYY-MM-DD HH:mm:ss) no fuso de Brasília
   * Ideal para gravar no banco de dados
   * @param {Date|string|number} input - Data a ser formatada (default: agora)
   * @returns {string} Data/hora ISO (ex: "2026-01-21 14:30:45")
   */
  function formatDateTimeISO(input) {
    const date = input ? parseToDate(input) : new Date();
    const datePart = formatDateISO(date);
    const timePart = formatTime(date);
    return `${datePart} ${timePart}`;
  }

  /**
   * Retorna apenas a hora (0-23) no fuso de Brasília
   * @param {Date|string|number} input - Data/hora
   * @returns {number} Hora (0-23)
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

  /**
   * Retorna o dia da semana no fuso de Brasília
   * @param {Date|string|number} input - Data
   * @returns {string} Dia da semana abreviado (ex: "seg", "ter")
   */
  function getDayOfWeek(input) {
    const date = parseToDate(input);
    return new Intl.DateTimeFormat(LOCALE, {
      timeZone: TIMEZONE,
      weekday: 'short'
    }).format(date);
  }

  /**
   * Retorna o dia da semana completo no fuso de Brasília
   * @param {Date|string|number} input - Data
   * @returns {string} Dia da semana (ex: "segunda-feira")
   */
  function getDayOfWeekFull(input) {
    const date = parseToDate(input);
    return new Intl.DateTimeFormat(LOCALE, {
      timeZone: TIMEZONE,
      weekday: 'long'
    }).format(date);
  }

  /**
   * Converte string de data para objeto Date, tratando diferentes formatos
   * @param {Date|string|number} input - Data em qualquer formato
   * @returns {Date} Objeto Date
   */
  function parseToDate(input) {
    if (!input) return new Date();
    if (input instanceof Date) return input;
    if (typeof input === 'number') return new Date(input);
    
    const s = String(input).trim();
    
    // Formato: YYYY-MM-DD (data ISO simples) - interpretar como meia-noite em Brasília
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split('-').map(Number);
      // Brasília está em UTC-3, então meia-noite em Brasília = 03:00 UTC
      return new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
    }
    
    // Formato: YYYY-MM-DD HH:mm:ss (sem timezone) - interpretar como horário de Brasília
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(s)) {
      const normalized = s.replace('T', ' ');
      const [datePart, timePart] = normalized.split(' ');
      const [y, m, d] = datePart.split('-').map(Number);
      const timeComponents = timePart.split(':');
      const hh = parseInt(timeComponents[0], 10);
      const mm = parseInt(timeComponents[1], 10);
      const ss = parseFloat(timeComponents[2]) || 0;
      // O dado já está em Brasília, criar Date local diretamente
      // Usamos o construtor local para que toLocaleString com timezone Brasília retorne o mesmo valor
      return new Date(y, m - 1, d, hh, mm, Math.floor(ss));
    }
    
    // Formato: DD/MM/YYYY (brasileiro)
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [d, m, y] = s.split('/').map(Number);
      return new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
    }
    
    // Formato: DD/MM/YYYY HH:mm:ss (brasileiro com hora)
    if (/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(s)) {
      const [datePart, timePart] = s.split(' ');
      const [d, m, y] = datePart.split('/').map(Number);
      const [hh, mm, ss] = timePart.split(':').map(Number);
      return new Date(Date.UTC(y, m - 1, d, hh + 3, mm, ss));
    }
    
    // ISO com timezone (ex: 2026-01-21T14:30:00.000Z) - deixar o JS interpretar
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return parsed;
    
    // Fallback: substituir espaço por T e tentar novamente
    const parsed2 = new Date(s.replace(' ', 'T'));
    if (!isNaN(parsed2.getTime())) return parsed2;
    
    // Último recurso: retornar data atual
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
   * Retorna a data de hoje no formato ISO (YYYY-MM-DD) em Brasília
   * @returns {string}
   */
  function todayISO() {
    return formatDateISO(new Date());
  }

  /**
   * Adiciona dias a uma data
   * @param {Date|string|number} input - Data base
   * @param {number} days - Número de dias (pode ser negativo)
   * @returns {Date}
   */
  function addDays(input, days) {
    const date = parseToDate(input);
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * Formata data relativa (hoje, ontem, etc)
   * @param {Date|string|number} input 
   * @returns {string}
   */
  function formatRelative(input) {
    const date = parseToDate(input);
    const today = new Date();
    const todayStr = formatDateISO(today);
    const inputStr = formatDateISO(date);
    
    if (inputStr === todayStr) {
      return `Hoje às ${formatTimeShort(date)}`;
    }
    
    const yesterday = addDays(today, -1);
    if (inputStr === formatDateISO(yesterday)) {
      return `Ontem às ${formatTimeShort(date)}`;
    }
    
    const tomorrow = addDays(today, 1);
    if (inputStr === formatDateISO(tomorrow)) {
      return `Amanhã às ${formatTimeShort(date)}`;
    }
    
    return formatDateTime(date);
  }

  /**
   * Formata para cupom fiscal / recibo (formato compacto)
   * @param {Date|string|number} input 
   * @returns {string} (ex: "21/01/2026 14:30")
   */
  function formatForReceipt(input) {
    const date = parseToDate(input);
    return `${formatDate(date)} ${formatTimeShort(date)}`;
  }

  /**
   * Retorna timestamp atual no formato para o banco de dados
   * @returns {string} (ex: "2026-01-21 14:30:45")
   */
  function nowForDB() {
    return formatDateTimeISO(new Date());
  }

  /**
   * Formata mês/ano (ex: "Janeiro/2026")
   * @param {Date|string|number} input 
   * @returns {string}
   */
  function formatMonthYear(input) {
    const date = parseToDate(input);
    return new Intl.DateTimeFormat(LOCALE, {
      timeZone: TIMEZONE,
      month: 'long',
      year: 'numeric'
    }).format(date);
  }

  /**
   * Formata data extensa (ex: "21 de janeiro de 2026")
   * @param {Date|string|number} input 
   * @returns {string}
   */
  function formatDateLong(input) {
    const date = parseToDate(input);
    return new Intl.DateTimeFormat(LOCALE, {
      timeZone: TIMEZONE,
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  }

  // Exportar para uso global
  const DateTimeUtils = {
    TIMEZONE,
    LOCALE,
    now,
    formatDateTime,
    formatDate,
    formatTime,
    formatTimeShort,
    formatDateISO,
    formatDateTimeISO,
    getHour,
    getDayOfWeek,
    getDayOfWeekFull,
    parseToDate,
    isSameDay,
    isToday,
    todayISO,
    addDays,
    formatRelative,
    formatForReceipt,
    nowForDB,
    formatMonthYear,
    formatDateLong
  };

  // Expor globalmente
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DateTimeUtils;
  } else {
    global.DateTimeUtils = DateTimeUtils;
    // Aliases curtos para conveniência
    global.DTU = DateTimeUtils;
  }

})(typeof window !== 'undefined' ? window : this);
