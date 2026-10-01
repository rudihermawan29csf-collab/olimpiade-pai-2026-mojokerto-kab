import { Participant, ExamResult, ViolationLog, Question, School, Exam, QuestionType } from '../types';
import { storageService } from './storageService';

export const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbxef0cMx4Uts99tztut9p2_XksOEwmJlCU74lJ66LIlNdoZyGVXb_0-CCEjAYCVk6gQ1Q/exec';

const PREV_APPS_SCRIPT_URLS = [
  'https://script.google.com/macros/s/AKfycbx_InSTl85DNt0EauMtqEXmXXwIkEcxVAuTfxtLCmKvA_CbiarWzKr8Tu3cikgo4pELPg/exec',
  'https://script.google.com/macros/s/AKfycbzqWOwYOggXLgLmlCi_Gqm8DReSPxwEgKUtsJGoLgrkWn3o5cak9nhiXPB0YVJ-TP1Drg/exec',
];

const STORAGE_KEY_APPS_SCRIPT_URL = 'PAI_APPS_SCRIPT_URL';

// Helper: Extract Spreadsheet ID
export function extractSpreadsheetId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  const matchU = trimmed.match(/\/spreadsheets\/u\/\d+\/d\/([a-zA-Z0-9-_]+)/);
  if (matchU && matchU[1]) return matchU[1];
  if (/^[a-zA-Z0-9-_]{25,60}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

// Helper: Normalize Question Type
export function normalizeQuestionType(raw: string): QuestionType {
  const clean = String(raw || '').trim().toUpperCase();
  if (clean === 'PGK' || clean.includes('KOMPLEKS') || clean.includes('COMPLEX')) {
    return 'PGK';
  }
  if (clean === 'BS' || clean === 'B/S' || clean === 'B-S' || clean.includes('BENAR') || clean.includes('SALAH') || clean.includes('TRUE')) {
    return 'BS';
  }
  return 'PG';
}

// Helper: Parse BS Statements & Correct Answers
export function parseBSStatements(optA: string, optB: string, optC: string, optD: string, rawKey: string) {
  const rawList = [optA, optB, optC, optD];
  const texts = rawList.filter((t) => Boolean(t && t.trim().length > 0));
  const validTexts = texts.length > 0 ? texts : ['Pernyataan 1', 'Pernyataan 2'];

  const parts = String(rawKey || '')
    .split(/[,;\s/]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const statements: { id: string; text: string; correct: 'BENAR' | 'SALAH' }[] = [];
  const correctAnswers: string[] = [];

  validTexts.forEach((text, idx) => {
    const sId = `S${idx + 1}`;
    const letter = String.fromCharCode(65 + idx);
    const num = String(idx + 1);

    const explicitBenar = parts.some(
      (p) =>
        p === `${sId}:BENAR` ||
        p === `${sId}:B` ||
        p === `${letter}:BENAR` ||
        p === `${letter}:B` ||
        p === `${num}:BENAR` ||
        p === `${num}:B` ||
        p === `${sId}=BENAR` ||
        p === `${letter}=BENAR`
    );
    const explicitSalah = parts.some(
      (p) =>
        p === `${sId}:SALAH` ||
        p === `${sId}:S` ||
        p === `${letter}:SALAH` ||
        p === `${letter}:S` ||
        p === `${num}:SALAH` ||
        p === `${num}:S` ||
        p === `${sId}=SALAH` ||
        p === `${letter}=SALAH`
    );

    let isBenar = false;
    if (explicitBenar) {
      isBenar = true;
    } else if (explicitSalah) {
      isBenar = false;
    } else {
      const valAtIdx = parts[idx];
      if (valAtIdx) {
        isBenar = ['BENAR', 'B', 'TRUE', 'T', '1', 'YA'].includes(valAtIdx);
      } else {
        isBenar = idx % 2 === 0;
      }
    }

    const correctVal = isBenar ? 'BENAR' : 'SALAH';
    statements.push({ id: sId, text, correct: correctVal });
    correctAnswers.push(`${sId}:${correctVal}`);
  });

  return { statements, correctAnswers };
}

// Convert GViz table to Question[]
export function parseGvizTableToQuestions(table: any): Question[] {
  if (!table || !Array.isArray(table.rows) || table.rows.length === 0) {
    return [];
  }

  const cols = Array.isArray(table.cols) ? table.cols : [];
  const colLabels = cols.map((c: any) => String(c?.label || '').toLowerCase().trim());

  function findCol(keywords: string[], fallback: number): number {
    for (let c = 0; c < colLabels.length; c++) {
      for (const kw of keywords) {
        if (colLabels[c].includes(kw)) return c;
      }
    }
    return fallback;
  }

  const cId = findCol(['id', 'nomor', 'no'], 0);
  const cType = findCol(['tipe', 'type', 'jenis', 'bentuk'], 1);
  const cTopic = findCol(['topik', 'materi', 'submateri', 'kompetensi'], 2);
  const cDiff = findCol(['kesulitan', 'tingkat', 'level'], 3);
  const cQ = findCol(['pertanyaan', 'soal', 'stimulus', 'teks'], 4);
  const cA = findCol(['opsi a', 'pilihan a', 'opt a', 'a'], 5);
  const cB = findCol(['opsi b', 'pilihan b', 'opt b', 'b'], 6);
  const cC = findCol(['opsi c', 'pilihan c', 'opt c', 'c'], 7);
  const cD = findCol(['opsi d', 'pilihan d', 'opt d', 'd'], 8);
  const cKey = findCol(['kunci', 'jawaban', 'key', 'correct'], 9);
  const cExp = findCol(['pembahasan', 'penjelasan', 'alasan'], 10);

  const questions: Question[] = [];

  table.rows.forEach((rowObj: any, index: number) => {
    const cells = rowObj.c || [];
    const getVal = (idx: number): string => {
      const cell = cells[idx];
      if (!cell || cell.v === null || cell.v === undefined) return '';
      return String(cell.v).trim();
    };

    const qText = getVal(cQ) || getVal(4) || getVal(0);
    if (!qText) return;

    const qTypeRaw = getVal(cType) || getVal(1) || 'PG';
    const qType = normalizeQuestionType(qTypeRaw);

    const optA = getVal(cA) || getVal(5);
    const optB = getVal(cB) || getVal(6);
    const optC = getVal(cC) || getVal(7);
    const optD = getVal(cD) || getVal(8);
    const rawKey = getVal(cKey) || getVal(9) || 'A';
    const explanation = getVal(cExp) || getVal(10) || '';
    const rawTopic = getVal(cTopic) || getVal(2) || 'Aqidah';
    const rawDiff = getVal(cDiff) || getVal(3) || 'Sedang';

    let difficulty: 'Mudah' | 'Sedang' | 'Sukar' = 'Sedang';
    const diffLower = rawDiff.toLowerCase();
    if (diffLower.includes('mudah') || diffLower.includes('easy')) difficulty = 'Mudah';
    else if (diffLower.includes('sukar') || diffLower.includes('sulit') || diffLower.includes('hard')) difficulty = 'Sukar';

    let subject: any = 'Aqidah';
    const topLower = rawTopic.toLowerCase();
    if (topLower.includes("qur'an") || topLower.includes('hadis') || topLower.includes('quran')) subject = "Al-Qur'an Hadis";
    else if (topLower.includes('fiq') || topLower.includes('fikih')) subject = 'Fiqih';
    else if (topLower.includes('akhlak') || topLower.includes('budi')) subject = 'Akhlak';
    else if (topLower.includes('sejarah') || topLower.includes('ski') || topLower.includes('kebudayaan')) subject = 'Sejarah Kebudayaan Islam';

    let options: { id: 'A' | 'B' | 'C' | 'D'; text: string }[] = [];
    let statements: any = undefined;
    let correctAnswers: string[] = [];

    if (qType === 'BS') {
      const bsResult = parseBSStatements(optA, optB, optC, optD, rawKey);
      statements = bsResult.statements;
      correctAnswers = bsResult.correctAnswers;
      options = [
        { id: 'A', text: optA || 'Pernyataan 1' },
        { id: 'B', text: optB || 'Pernyataan 2' },
        ...(optC ? [{ id: 'C' as const, text: optC }] : []),
        ...(optD ? [{ id: 'D' as const, text: optD }] : []),
      ];
    } else if (qType === 'PGK') {
      options = [
        { id: 'A' as const, text: optA },
        { id: 'B' as const, text: optB },
        { id: 'C' as const, text: optC },
        { id: 'D' as const, text: optD },
      ].filter((o) => Boolean(o.text));
      correctAnswers = rawKey
        .split(/[,;\s]+/)
        .map((k) => k.trim().toUpperCase())
        .filter(Boolean);
      if (correctAnswers.length === 0) correctAnswers = ['A'];
    } else {
      // PG
      options = [
        { id: 'A' as const, text: optA },
        { id: 'B' as const, text: optB },
        { id: 'C' as const, text: optC },
        { id: 'D' as const, text: optD },
      ].filter((o) => Boolean(o.text));
      const firstKey = rawKey.split(/[,;\s]+/)[0]?.trim().toUpperCase() || 'A';
      correctAnswers = [firstKey];
    }

    questions.push({
      id: getVal(cId) || `q-gviz-${index + 1}`,
      type: qType,
      subject,
      topic: rawTopic,
      difficulty,
      question: qText,
      options,
      statements,
      correctAnswers,
      explanation,
      isActive: true,
      createdAt: new Date().toISOString(),
    });
  });

  return questions;
}

export const sheetsSyncService = {
  getUrl(): string {
    const saved = localStorage.getItem(STORAGE_KEY_APPS_SCRIPT_URL);
    if (saved !== null && saved !== undefined && saved.trim() !== '') {
      const clean = saved.trim();
      if (PREV_APPS_SCRIPT_URLS.includes(clean)) {
        localStorage.setItem(STORAGE_KEY_APPS_SCRIPT_URL, DEFAULT_APPS_SCRIPT_URL);
        return DEFAULT_APPS_SCRIPT_URL;
      }
      return clean;
    }
    return DEFAULT_APPS_SCRIPT_URL;
  },

  setUrl(url: string): void {
    localStorage.setItem(STORAGE_KEY_APPS_SCRIPT_URL, url.trim());
  },

  isConfigured(): boolean {
    const url = this.getUrl();
    if (!url) return false;
    return (
      url.startsWith('https://script.google.com/macros/s/') ||
      url.includes('docs.google.com/spreadsheets') ||
      Boolean(extractSpreadsheetId(url))
    );
  },

  /**
   * Mengirim payload ke Google Apps Script Web App
   */
  async sendPayload(action: string, data: any): Promise<boolean> {
    const url = this.getUrl();
    if (!url || !url.startsWith('https://script.google.com/macros/s/')) return false;

    const payload = {
      action,
      timestamp: new Date().toISOString(),
      data,
    };
    const jsonString = JSON.stringify(payload);

    // 1. Kirim via Fetch text/plain
    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: jsonString,
        mode: 'no-cors',
      });
    } catch (err) {
      console.warn('Sync via fetch warning:', err);
    }

    // 2. Kirim via Hidden HTML Form Submit
    try {
      if (typeof document !== 'undefined') {
        let iframe = document.getElementById('gscript_sync_iframe') as HTMLIFrameElement;
        if (!iframe) {
          iframe = document.createElement('iframe');
          iframe.id = 'gscript_sync_iframe';
          iframe.name = 'gscript_sync_iframe';
          iframe.style.display = 'none';
          document.body.appendChild(iframe);
        }

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = url;
        form.target = 'gscript_sync_iframe';
        form.style.display = 'none';

        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'payload';
        input.value = jsonString;
        form.appendChild(input);

        document.body.appendChild(form);
        form.submit();
        setTimeout(() => form.remove(), 2500);
      }
    } catch (err) {
      console.warn('Sync via form submit warning:', err);
    }

    return true;
  },

  /**
   * Mengambil data dari Google Apps Script secara aman via Fetch
   */
  async fetchFromSheets<T>(action: string): Promise<T | null> {
    const url = this.getUrl();
    if (!url || typeof window === 'undefined') return null;

    const sep = url.includes('?') ? '&' : '?';

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${url}${sep}action=${action}&_t=${Date.now()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().startsWith('{')) {
          try {
            return JSON.parse(text) as T;
          } catch {
            return null;
          }
        }
      }
    } catch {
      // Safe fallback
    }

    return null;
  },

  async fetchViaJsonp<T>(action: string): Promise<T | null> {
    const url = this.getUrl();
    if (!url || typeof window === 'undefined') return null;

    return new Promise((resolve) => {
      const callbackName = `cbt_cb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      let resolved = false;

      const cleanup = () => {
        try {
          delete (window as any)[callbackName];
          const el = document.getElementById(callbackName);
          if (el && el.parentNode) {
            el.parentNode.removeChild(el);
          }
        } catch {}
      };

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          this.fetchFromSheets<T>(action).then(resolve).catch(() => resolve(null));
        }
      }, 7000);

      (window as any)[callbackName] = (data: T) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          cleanup();
          resolve(data);
        }
      };

      try {
        const sep = url.includes('?') ? '&' : '?';
        const script = document.createElement('script');
        script.id = callbackName;
        script.src = `${url}${sep}action=${action}&callback=${callbackName}&_t=${Date.now()}`;
        script.onerror = () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            cleanup();
            this.fetchFromSheets<T>(action).then(resolve).catch(() => resolve(null));
          }
        };
        document.head.appendChild(script);
      } catch {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          cleanup();
          this.fetchFromSheets<T>(action).then(resolve).catch(() => resolve(null));
        }
      }
    });
  },

  /**
   * Tarik Data Detail dari Spreadsheet (Full-Stack Backend + Client GViz JSONP Fallback)
   */
  async pullSpreadsheetDetailed(targetUrl?: string): Promise<{
    success: boolean;
    questions?: Question[];
    count?: number;
    source?: string;
    error?: string;
    hint?: string;
    requiresAuth?: boolean;
  }> {
    const urlToUse = (targetUrl || this.getUrl() || '').trim();
    if (!urlToUse) {
      return {
        success: false,
        error: 'URL Google Spreadsheet atau Web App belum dimasukkan.',
      };
    }

    // 1. Coba lewat backend proxy endpoint `/api/pull-spreadsheet`
    try {
      const resp = await fetch('/api/pull-spreadsheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToUse, sheetName: 'BANK_SOAL' }),
      });

      const data = await resp.json();
      if (resp.ok && data.success && data.questions && Array.isArray(data.questions)) {
        return {
          success: true,
          questions: data.questions,
          count: data.questions.length,
          source: data.source || 'Server Engine',
        };
      } else if (data.requiresAuth || data.error) {
        // Return exact error from server
        return {
          success: false,
          error: data.error,
          hint: data.hint,
          requiresAuth: data.requiresAuth,
        };
      }
    } catch {
      // Backend route might not be active, continue to direct client fallback
    }

    // 2. Fallback Client-Side: Jika berupa Google Spreadsheet ID / Link
    const spreadsheetId = extractSpreadsheetId(urlToUse);
    if (spreadsheetId) {
      const candidates = ['BANK_SOAL', 'BANK SOAL', 'SOAL', 'Sheet1', ''];

      for (const sheetName of candidates) {
        try {
          const gvizRes = await this.fetchGvizJsonp(spreadsheetId, sheetName);
          if (gvizRes && gvizRes.table) {
            const questions = parseGvizTableToQuestions(gvizRes.table);
            if (questions.length > 0) {
              return {
                success: true,
                questions,
                count: questions.length,
                source: `Google Sheets GViz (Tab: ${sheetName || 'Utama'})`,
              };
            }
          }
        } catch {
          // Continue to next sheet name
        }
      }

      return {
        success: false,
        error:
          'Spreadsheet Google belum dapat dibaca. Pastikan status Berbagi (Share) spreadsheet diatur ke "Siapa saja yang memiliki link dapat melihat" (Anyone with the link can view).',
      };
    }

    // 3. Fallback Client-Side: Jika berupa Google Apps Script Web App
    if (urlToUse.includes('script.google.com/macros/s/')) {
      try {
        const resp = await this.fetchViaJsonp<{ status: string; questions?: Question[] }>('GET_QUESTIONS');
        if (resp && resp.questions && Array.isArray(resp.questions) && resp.questions.length > 0) {
          return {
            success: true,
            questions: resp.questions,
            count: resp.questions.length,
            source: 'Google Apps Script Web App (JSONP)',
          };
        }
      } catch (err: any) {
        return {
          success: false,
          error: 'Web App Google Apps Script tidak merespons atau meminta otorisasi akun.',
          hint: 'Ubah deployment Apps Script menjadi "Siapa saja (Anyone)" atau masukkan Link Google Spreadsheet Anda langsung.',
        };
      }
    }

    return {
      success: false,
      error: 'Format URL tidak dikenali. Masukkan Link Google Spreadsheet atau Web App Apps Script.',
    };
  },

  /**
   * Helper: Client-side GViz JSONP reader for public/shared Google Sheets
   */
  async fetchGvizJsonp(spreadsheetId: string, sheetName?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const callbackName = `gviz_cb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      let resolved = false;

      const cleanup = () => {
        try {
          delete (window as any)[callbackName];
          const el = document.getElementById(callbackName);
          if (el && el.parentNode) el.parentNode.removeChild(el);
        } catch {}
      };

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error('Timeout membaca Google Spreadsheet'));
        }
      }, 8000);

      (window as any)[callbackName] = (data: any) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          cleanup();
          resolve(data);
        }
      };

      try {
        const script = document.createElement('script');
        script.id = callbackName;
        const sheetParam = sheetName ? `&sheet=${encodeURIComponent(sheetName)}` : '';
        script.src = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=responseHandler:${callbackName}${sheetParam}&_t=${Date.now()}`;
        script.onerror = () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            cleanup();
            reject(new Error('Gagal memuat Google Spreadsheet'));
          }
        };
        document.head.appendChild(script);
      } catch (err) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          cleanup();
          reject(err);
        }
      }
    });
  },

  /**
   * Tarik Bank Soal terbaru dari Google Spreadsheet ke perangkat siswa/admin
   */
  async pullQuestionsFromSheets(customUrl?: string): Promise<Question[] | null> {
    if (!this.isConfigured() && !customUrl) return null;

    try {
      const detailed = await this.pullSpreadsheetDetailed(customUrl);
      if (detailed.success && detailed.questions && detailed.questions.length > 0) {
        storageService.saveQuestions(detailed.questions, true);
        return detailed.questions;
      }
    } catch (err) {
      console.warn('Gagal menarik soal dari Google Spreadsheet:', err);
    }
    return null;
  },

  async syncSchools(schools: School[]): Promise<boolean> {
    if (!this.isConfigured()) return false;
    return this.sendPayload('SYNC_SCHOOLS', schools);
  },

  async pullSchoolsFromSheets(): Promise<School[] | null> {
    if (!this.isConfigured()) return null;
    try {
      const resp = await this.fetchViaJsonp<{ status: string; schools?: School[] }>('GET_SCHOOLS');
      if (resp && resp.schools && Array.isArray(resp.schools) && resp.schools.length > 0) {
        storageService.saveSchools(resp.schools);
        return resp.schools;
      }
    } catch (err) {
      console.warn('Gagal menarik sekolah dari Google Spreadsheet:', err);
    }
    return null;
  },

  async syncExams(exams: Exam[]): Promise<boolean> {
    if (!this.isConfigured()) return false;
    return this.sendPayload('SYNC_EXAMS', exams);
  },

  async pullExamsFromSheets(): Promise<Exam[] | null> {
    if (!this.isConfigured()) return null;
    try {
      const resp = await this.fetchViaJsonp<{ status: string; exams?: Exam[] }>('GET_EXAMS');
      if (resp && resp.exams && Array.isArray(resp.exams) && resp.exams.length > 0) {
        storageService.saveExams(resp.exams);
        return resp.exams;
      }
    } catch (err) {
      console.warn('Gagal menarik sesi ujian dari Google Spreadsheet:', err);
    }
    return null;
  },

  async pullResultsFromSheets(): Promise<ExamResult[] | null> {
    if (!this.isConfigured()) return null;
    try {
      const resp = await this.fetchViaJsonp<{ status: string; results?: ExamResult[] }>('GET_RESULTS');
      if (resp && resp.results && Array.isArray(resp.results)) {
        storageService.saveResults(resp.results);
        return resp.results;
      }
    } catch (err) {
      console.warn('Gagal menarik hasil dari Google Spreadsheet:', err);
    }
    return null;
  },

  async syncResults(results: ExamResult[]): Promise<boolean> {
    if (!this.isConfigured()) return false;
    return this.sendPayload('SYNC_RESULTS', results);
  },

  async syncViolation(violation: ViolationLog): Promise<boolean> {
    if (!this.isConfigured()) return false;
    return this.sendPayload('SYNC_VIOLATION', violation);
  },

  async syncViolations(violations: ViolationLog[]): Promise<boolean> {
    if (!this.isConfigured()) return false;
    return this.sendPayload('SYNC_VIOLATIONS', violations);
  },

  async pullViolationsFromSheets(): Promise<ViolationLog[] | null> {
    if (!this.isConfigured()) return null;
    try {
      const resp = await this.fetchViaJsonp<{ status: string; violations?: ViolationLog[] }>('GET_VIOLATIONS');
      if (resp && resp.violations && Array.isArray(resp.violations) && resp.violations.length > 0) {
        storageService.saveViolations(resp.violations);
        return resp.violations;
      }
    } catch (err) {
      console.warn('Gagal menarik log pelanggaran dari Google Spreadsheet:', err);
    }
    return null;
  },

  async pullAllFromSheets(): Promise<{
    schoolsCount: number;
    examsCount: number;
    questionsCount: number;
    resultsCount: number;
    violationsCount: number;
  }> {
    if (!this.isConfigured()) {
      return { schoolsCount: 0, examsCount: 0, questionsCount: 0, resultsCount: 0, violationsCount: 0 };
    }
    try {
      const detailed = await this.pullSpreadsheetDetailed();
      let qCount = 0;
      if (detailed.success && detailed.questions && detailed.questions.length > 0) {
        storageService.saveQuestions(detailed.questions, true);
        qCount = detailed.questions.length;
      }

      const resp = await this.fetchViaJsonp<{
        status: string;
        schools?: School[];
        exams?: Exam[];
        questions?: Question[];
        results?: ExamResult[];
        violations?: ViolationLog[];
      }>('GET_ALL');

      let sCount = 0;
      let eCount = 0;
      let rCount = 0;
      let vCount = 0;

      if (resp?.schools && resp.schools.length > 0) {
        storageService.saveSchools(resp.schools);
        sCount = resp.schools.length;
      }

      if (resp?.exams && resp.exams.length > 0) {
        storageService.saveExams(resp.exams);
        eCount = resp.exams.length;
      }

      if (resp?.questions && resp.questions.length > 0 && qCount === 0) {
        storageService.saveQuestions(resp.questions, true);
        qCount = resp.questions.length;
      }

      if (resp?.results && resp.results.length > 0) {
        storageService.saveResults(resp.results);
        rCount = resp.results.length;
      }

      if (resp?.violations && resp.violations.length > 0) {
        storageService.saveViolations(resp.violations);
        vCount = resp.violations.length;
      }

      return {
        schoolsCount: sCount,
        examsCount: eCount,
        questionsCount: qCount,
        resultsCount: rCount,
        violationsCount: vCount,
      };
    } catch (err) {
      console.warn('Pull all error:', err);
      return { schoolsCount: 0, examsCount: 0, questionsCount: 0, resultsCount: 0, violationsCount: 0 };
    }
  },

  async testConnection(testUrl: string): Promise<boolean> {
    if (!testUrl || testUrl.trim() === '') {
      throw new Error('Masukkan URL Google Spreadsheet atau Web App Apps Script.');
    }

    const clean = testUrl.trim();

    // If Google Spreadsheet
    const spreadsheetId = extractSpreadsheetId(clean);
    if (spreadsheetId) {
      const res = await this.pullSpreadsheetDetailed(clean);
      if (res.success) {
        return true;
      }
      throw new Error(res.error || 'Gagal membaca spreadsheet. Pastikan hak akses "Siapa saja yang memiliki link dapat melihat".');
    }

    // If Apps Script
    if (clean.startsWith('https://script.google.com/macros/s/')) {
      try {
        await fetch(clean, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify({
            action: 'PING',
            data: { message: 'Tes koneksi CBT MGMP PAI Mojokerto' },
          }),
          mode: 'no-cors',
        });
        return true;
      } catch (err: any) {
        throw new Error(err.message || 'Koneksi ke Web App gagal.');
      }
    }

    throw new Error('URL harus berupa Link Google Spreadsheet (https://docs.google.com/spreadsheets/d/...) atau Web App Apps Script.');
  },

  async syncParticipant(participant: Participant) {
    if (!this.isConfigured()) return;
    return this.sendPayload('SYNC_PARTICIPANT', participant);
  },

  async syncResult(result: ExamResult, participant?: Participant) {
    if (!this.isConfigured()) return;
    return this.sendPayload('SYNC_RESULT', {
      result,
      participant,
    });
  },

  async syncQuestions(questions: Question[]) {
    if (!this.isConfigured()) return false;
    return this.sendPayload('SYNC_QUESTIONS', questions);
  },

  async exportAll(payloadData: {
    participants: Participant[];
    results: ExamResult[];
    exams: Exam[];
    questions: Question[];
    schools?: School[];
    violations?: ViolationLog[];
  }) {
    if (!this.isConfigured()) return false;
    return this.sendPayload('EXPORT_ALL', payloadData);
  },
};
