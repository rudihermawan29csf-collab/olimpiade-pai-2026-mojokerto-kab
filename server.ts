import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '10mb' }));

// Helper: Normalize Question Type
function normalizeQuestionType(raw: string): 'PG' | 'PGK' | 'BS' {
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
function parseBSStatements(optA: string, optB: string, optC: string, optD: string, rawKey: string) {
  const rawList = [optA, optB, optC, optD];
  // Filter out completely empty trailing options
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

// Helper: Extract Spreadsheet ID
function extractSpreadsheetId(input: string): string | null {
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

// Parse Google Visualization JSON table to Question[]
function parseGvizTableToQuestions(table: any): any[] {
  if (!table || !Array.isArray(table.rows) || table.rows.length === 0) {
    return [];
  }

  // Find column indices
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

  const questions: any[] = [];

  table.rows.forEach((rowObj: any, index: number) => {
    const cells = rowObj.c || [];
    const getVal = (idx: number): string => {
      const cell = cells[idx];
      if (!cell || cell.v === null || cell.v === undefined) return '';
      return String(cell.v).trim();
    };

    const qText = getVal(cQ) || getVal(4) || getVal(0);
    if (!qText) return; // Skip empty row

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
      // PG (Pilihan Ganda)
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
      id: getVal(cId) || `q-srv-${index + 1}`,
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

// API Health
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'CBT MGMP PAI Mojokerto Server Engine',
    timestamp: new Date().toISOString(),
  });
});

// API: Pull Questions from Google Spreadsheet or Apps Script
app.post('/api/pull-spreadsheet', async (req, res) => {
  try {
    const { url, sheetName } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'URL spreadsheet atau Web App wajib diisi.',
      });
    }

    const cleanUrl = url.trim();
    const sheetTarget = sheetName || 'BANK_SOAL';

    // 1. Check if input is a Google Spreadsheet Link or ID
    const spreadsheetId = extractSpreadsheetId(cleanUrl);

    if (spreadsheetId) {
      // Try to fetch via Google Visualization API (GViz)
      const sheetCandidates = [sheetTarget, 'BANK_SOAL', 'BANK SOAL', 'SOAL', 'Sheet1', ''];
      let fetchedJson: any = null;
      let matchedSheet = '';

      for (const candidate of sheetCandidates) {
        try {
          const gvizUrl = candidate
            ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(candidate)}`
            : `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json`;

          const resp = await fetch(gvizUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          });

          if (resp.ok) {
            const rawText = await resp.text();
            // Google GViz response starts with "/*O_o*/\ngoogle.visualization.Query.setResponse({...});"
            const match = rawText.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
            if (match && match[1]) {
              const parsed = JSON.parse(match[1]);
              if (parsed && parsed.status === 'ok' && parsed.table && parsed.table.rows && parsed.table.rows.length > 0) {
                fetchedJson = parsed;
                matchedSheet = candidate || 'Sheet Utama';
                break;
              }
            }
          }
        } catch (e) {
          // Continue to next candidate
        }
      }

      if (fetchedJson && fetchedJson.table) {
        const questions = parseGvizTableToQuestions(fetchedJson.table);
        if (questions.length > 0) {
          return res.json({
            success: true,
            source: 'Google Spreadsheet GViz API',
            spreadsheetId,
            sheetName: matchedSheet,
            count: questions.length,
            questions,
          });
        }
      }

      // If GViz failed, try CSV export
      try {
        const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&sheet=${encodeURIComponent(sheetTarget)}`;
        const csvResp = await fetch(csvUrl);
        if (csvResp.ok) {
          const csvText = await csvResp.text();
          if (csvText && !csvText.includes('<!DOCTYPE html>')) {
            // Can be parsed on frontend or return text
            return res.json({
              success: true,
              source: 'Google Spreadsheet CSV Export',
              spreadsheetId,
              csvData: csvText,
            });
          }
        }
      } catch (csvErr) {
        // Continue
      }

      return res.status(404).json({
        success: false,
        error:
          'Spreadsheet ditemukan namun belum dapat dibaca secara publik. Pastikan pengaturan Berbagi (Share) spreadsheet telah diatur ke "Siapa saja yang memiliki link dapat melihat" (Anyone with link can view).',
        spreadsheetId,
      });
    }

    // 2. Check if input is a Google Apps Script Web App URL
    if (cleanUrl.includes('script.google.com/macros/s/')) {
      const sep = cleanUrl.includes('?') ? '&' : '?';
      const fetchUrl = `${cleanUrl}${sep}action=GET_QUESTIONS&_t=${Date.now()}`;

      const resp = await fetch(fetchUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: { Accept: 'application/json' },
      });

      const text = await resp.text();

      // Check if redirected to Google Accounts login page
      if (text.includes('ServiceLogin') || text.includes('accounts.google.com') || text.includes('Sign in - Google Accounts')) {
        return res.status(403).json({
          success: false,
          error:
            'Web App Google Apps Script memerlukan otorisasi login Google. Pada menu Deploy Apps Script, ubah "Who has access" menjadi "Anyone" (Siapa saja), bukan "Only myself" atau akun terbatas.',
          hint: 'Alternatif cepat: Anda juga dapat langsung memasukkan Link Google Spreadsheet di kolom input.',
          requiresAuth: true,
        });
      }

      try {
        const data = JSON.parse(text);
        if (data && data.questions && Array.isArray(data.questions)) {
          return res.json({
            success: true,
            source: 'Google Apps Script Web App',
            count: data.questions.length,
            questions: data.questions,
          });
        }
      } catch {
        // Fall through
      }

      return res.status(400).json({
        success: false,
        error: 'Respons dari Google Apps Script tidak berformat JSON yang valid.',
        rawPreview: text.substring(0, 300),
      });
    }

    return res.status(400).json({
      success: false,
      error: 'Format URL tidak dikenali. Masukkan Link Google Spreadsheet (https://docs.google.com/spreadsheets/d/...) atau URL Web App Apps Script (https://script.google.com/macros/s/.../exec).',
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Terjadi kesalahan saat memproses spreadsheet.',
    });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server CBT MGMP PAI running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
