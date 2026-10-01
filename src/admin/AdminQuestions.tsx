import React, { useState, useEffect, useRef } from 'react';
import { Question, MateriPAI, Difficulty, QuestionType, QuestionOption } from '../types';
import { storageService, subscribeToStore } from '../services/storageService';
import {
  sheetsSyncService,
  normalizeQuestionType,
  parseBSStatements,
  extractSpreadsheetId
} from '../services/sheetsSyncService';
import { sheetsExportService } from '../services/sheetsExportService';
import { excelUtils } from '../utils/excelUtils';
import { AdminQuestionForm } from './AdminQuestionForm';
import { useToast } from '../components/Toast';
import {
  BookOpen,
  Plus,
  Search,
  Copy,
  Trash2,
  Edit3,
  Send,
  RefreshCw,
  CheckCircle2,
  Check,
  FileSpreadsheet,
  ClipboardPaste,
  X,
  AlertCircle,
  Info,
  CircleDot,
  CheckSquare,
  ListChecks,
  Upload,
  Download,
  ExternalLink,
  Sparkles,
  Globe,
  Database
} from 'lucide-react';

const MATERI_LIST = [
  'SEMUA',
  'Aqidah',
  "Al-Qur'an Hadis",
  'Fiqih',
  'Akhlak',
  'Sejarah Kebudayaan Islam',
];

export const AdminQuestions: React.FC = () => {
  const { showToast } = useToast();
  const [questions, setQuestions] = useState<Question[]>(() =>
    storageService.getQuestions()
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMateri, setSelectedMateri] = useState('SEMUA');
  const [selectedDifficulty, setSelectedDifficulty] = useState('SEMUA');
  const [selectedType, setSelectedType] = useState('SEMUA');

  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [copied, setCopied] = useState(false);

  // Pull / Sync from Spreadsheet & Server Engine Modal state
  const [isPullModalOpen, setIsPullModalOpen] = useState(false);
  const [pullUrl, setPullUrl] = useState(() => sheetsSyncService.getUrl());
  const [isPullLoading, setIsPullLoading] = useState(false);
  const [pullDetailedResult, setPullDetailedResult] = useState<{
    success: boolean;
    questions?: Question[];
    count?: number;
    source?: string;
    error?: string;
    hint?: string;
    requiresAuth?: boolean;
    spreadsheetId?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Paste / Import from Spreadsheet modal state
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [parsedList, setParsedList] = useState<Question[]>([]);

  useEffect(() => {
    const unsub = subscribeToStore(() => {
      setQuestions(storageService.getQuestions());
    });
    return () => unsub();
  }, []);

  // Otomatis tarik Bank Soal terbaru dari Google Spreadsheet saat halaman dibuka
  useEffect(() => {
    if (sheetsSyncService.isConfigured()) {
      sheetsSyncService.pullQuestionsFromSheets().then((pulled) => {
        if (pulled && pulled.length > 0) {
          setQuestions(storageService.getQuestions());
        }
      }).catch(() => {});
    }
  }, []);

  const refreshData = () => {
    setQuestions(storageService.getQuestions());
  };

  const handleDuplicate = (id: string) => {
    const dup = storageService.duplicateQuestion(id);
    if (dup) {
      showToast('Soal berhasil digandakan dan disinkronkan ke Google Spreadsheet!', 'success');
      refreshData();
    }
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus butir soal ini dari bank soal?')) {
      storageService.deleteQuestion(id);
      showToast('Soal telah dihapus dan disinkronkan.', 'info');
      refreshData();
    }
  };

  const handleSyncToSheets = async () => {
    setIsSyncing(true);
    try {
      const current = storageService.getQuestions();
      await sheetsSyncService.syncQuestions(current);
      showToast(`${current.length} butir soal berhasil dikirim ke Google Spreadsheet (Sheet: BANK_SOAL)!`, 'success');
    } catch {
      showToast('Gagal mengirim soal ke Google Spreadsheet.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenPullModal = () => {
    setPullUrl(sheetsSyncService.getUrl());
    setPullDetailedResult(null);
    setIsPullModalOpen(true);
  };

  const handleExecutePullModal = async (overrideUrl?: string) => {
    const targetUrl = (overrideUrl || pullUrl).trim();
    if (!targetUrl) {
      showToast('Masukkan Link Google Spreadsheet atau URL Web App Apps Script.', 'error');
      return;
    }

    setIsPullLoading(true);
    setPullDetailedResult(null);

    try {
      // Simpan URL agar tersimpan untuk seterusnya
      sheetsSyncService.setUrl(targetUrl);
      const res = await sheetsSyncService.pullSpreadsheetDetailed(targetUrl);
      setPullDetailedResult(res);

      if (res.success && res.questions && res.questions.length > 0) {
        showToast(`Alhamdulillah! Berhasil menemukan ${res.questions.length} butir soal dari ${res.source || 'server'}. Silakan klik "Terapkan" di bawah.`, 'success');
      } else if (res.requiresAuth) {
        showToast('Google Apps Script meminta otorisasi login akun.', 'warning');
      } else {
        showToast(res.error || 'Data soal di spreadsheet belum terbaca.', 'error');
      }
    } catch (err: any) {
      setPullDetailedResult({
        success: false,
        error: err.message || 'Terjadi kesalahan jaringan saat menarik soal.',
      });
      showToast('Terjadi kesalahan saat memuat spreadsheet.', 'error');
    } finally {
      setIsPullLoading(false);
    }
  };

  const handleApplyPulledQuestions = (replace: boolean) => {
    if (!pullDetailedResult?.questions || pullDetailedResult.questions.length === 0) {
      showToast('Tidak ada butir soal untuk diterapkan.', 'error');
      return;
    }

    const list = pullDetailedResult.questions;
    storageService.saveQuestions(list, replace);
    showToast(
      replace
        ? `Alhamdulillah! Berhasil menggantikan seluruh bank soal dengan ${list.length} butir soal dari ${pullDetailedResult.source || 'spreadsheet'}.`
        : `Alhamdulillah! Berhasil menambahkan ${list.length} butir soal baru ke bank soal.`,
      'success'
    );
    setIsPullModalOpen(false);
    setPullDetailedResult(null);
    refreshData();
  };

  const handlePullFromSheets = async () => {
    setIsPulling(true);
    try {
      const detailed = await sheetsSyncService.pullSpreadsheetDetailed();
      if (detailed.success && detailed.questions && detailed.questions.length > 0) {
        storageService.saveQuestions(detailed.questions, true);
        setQuestions(storageService.getQuestions());
        showToast(`Alhamdulillah! Berhasil memuat ${detailed.questions.length} butir soal dari ${detailed.source || 'server'}. Bank soal aplikasi kini 100% sama dengan spreadsheet.`, 'success');
      } else {
        // Buka modal secara otomatis agar admin bisa melihat diagnosa & mengubah link
        setPullDetailedResult(detailed);
        setPullUrl(sheetsSyncService.getUrl());
        setIsPullModalOpen(true);
        if (detailed.requiresAuth) {
          showToast('Web App Google meminta login akun. Silakan cek solusi mudah di pop-up.', 'warning');
        } else {
          showToast(detailed.error || 'Data soal dari spreadsheet belum terbaca.', 'warning');
        }
      }
    } catch {
      setIsPullModalOpen(true);
      showToast('Gagal menarik soal dari Google Spreadsheet. Cek konfigurasi link.', 'error');
    } finally {
      setIsPulling(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const items = await excelUtils.parseQuestionFile(file);
      const validItems = items.filter((i) => i.isValid);

      if (validItems.length === 0) {
        showToast('Tidak ada butir soal valid yang dapat diimpor dari file tersebut.', 'error');
        return;
      }

      const questionsToImport = validItems.map((item) => {
        const isBS = item.type === 'BS';
        const statements = isBS
          ? [
              {
                id: 'S1',
                text: item.optionA,
                correct: item.correctAnswers.some((a) => a.includes('S1:BENAR') || a === 'A:BENAR' || a === 'BENAR')
                  ? ('BENAR' as const)
                  : ('SALAH' as const),
              },
              {
                id: 'S2',
                text: item.optionB,
                correct: item.correctAnswers.some((a) => a.includes('S2:BENAR') || a === 'B:BENAR')
                  ? ('BENAR' as const)
                  : ('SALAH' as const),
              },
              {
                id: 'S3',
                text: item.optionC,
                correct: item.correctAnswers.some((a) => a.includes('S3:BENAR') || a === 'C:BENAR')
                  ? ('BENAR' as const)
                  : ('SALAH' as const),
              },
              {
                id: 'S4',
                text: item.optionD,
                correct: item.correctAnswers.some((a) => a.includes('S4:BENAR') || a === 'D:BENAR')
                  ? ('BENAR' as const)
                  : ('SALAH' as const),
              },
            ].filter((s) => Boolean(s.text))
          : undefined;

        return {
          subject: item.subject,
          topic: item.topic,
          difficulty: item.difficulty,
          type: item.type,
          stimulus: item.stimulus || undefined,
          question: item.question,
          options: [
            { id: 'A' as const, text: item.optionA },
            { id: 'B' as const, text: item.optionB },
            { id: 'C' as const, text: item.optionC },
            { id: 'D' as const, text: item.optionD },
          ],
          statements,
          correctAnswers: item.correctAnswers,
          explanation: item.explanation || undefined,
          isActive: true,
        };
      });

      storageService.importQuestions(questionsToImport);
      showToast(`Alhamdulillah! Berhasil mengimpor ${questionsToImport.length} butir soal dari file ${file.name}.`, 'success');
      refreshData();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch {
      showToast('Gagal memproses file Excel/CSV.', 'error');
    }
  };

  const handleCopyQuestions = () => {
    if (navigator.clipboard) {
      const text = sheetsExportService.copyQuestionsToClipboard();
      navigator.clipboard.writeText(text);
      setCopied(true);
      showToast('Data Bank Soal berhasil disalin! Buka Google Sheets tab BANK_SOAL lalu tekan Ctrl+V', 'success');
      setTimeout(() => setCopied(false), 3000);
    }
  };

  // Parsing teks tabel hasil copy dari spreadsheet (Tab-Separated)
  const parsePastedSpreadsheetText = (text: string) => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
      setParsedList([]);
      return;
    }

    let startIndex = 0;
    const firstCols = lines[0].split('\t').map((c) => c.toLowerCase().trim());
    const isHeader = firstCols.some((c) =>
      c.includes('soal') || c.includes('pertanyaan') || c.includes('opsi') || c.includes('tipe') || c.includes('kunci')
    );

    let cId = 0, cType = 1, cTopic = 2, cDiff = 3, cQ = 4;
    let cA = 5, cB = 6, cC = 7, cD = 8, cKey = 9, cExp = 10;

    if (isHeader) {
      startIndex = 1;
      firstCols.forEach((col, idx) => {
        if (col.includes('id') || col.includes('nomor') || col === 'no') cId = idx;
        if (col.includes('tipe') || col.includes('jenis')) cType = idx;
        if (col.includes('topik') || col.includes('materi')) cTopic = idx;
        if (col.includes('kesulitan') || col.includes('tingkat')) cDiff = idx;
        if (col.includes('pertanyaan') || col.includes('soal')) cQ = idx;
        if (col === 'opsi a' || col === 'pilihan a' || col === 'a') cA = idx;
        if (col === 'opsi b' || col === 'pilihan b' || col === 'b') cB = idx;
        if (col === 'opsi c' || col === 'pilihan c' || col === 'c') cC = idx;
        if (col === 'opsi d' || col === 'pilihan d' || col === 'd') cD = idx;
        if (col.includes('kunci') || col.includes('jawaban')) cKey = idx;
        if (col.includes('pembahasan') || col.includes('penjelasan')) cExp = idx;
      });
    }

    const parsed: Question[] = [];
    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i].split('\t');
      if (parts.length < 3) continue;

      const qText = (parts[cQ] || parts[4] || parts[0] || '').trim();
      if (!qText) continue;

      const qTypeRaw = (parts[cType] || parts[1] || 'PG').trim();
      const qType = normalizeQuestionType(qTypeRaw);

      const optA = (parts[cA] || parts[5] || '').trim();
      const optB = (parts[cB] || parts[6] || '').trim();
      const optC = (parts[cC] || parts[7] || '').trim();
      const optD = (parts[cD] || parts[8] || '').trim();
      const rawKey = (parts[cKey] || parts[9] || 'A').trim();

      let options: QuestionOption[] = [];
      let statements: { id: string; text: string; correct: 'BENAR' | 'SALAH' }[] | undefined = undefined;
      let correctAnswers: string[] = [];

      if (qType === 'BS') {
        const bsResult = parseBSStatements(optA, optB, optC, optD, rawKey);
        statements = bsResult.statements;
        correctAnswers = bsResult.correctAnswers;
        options = [
          { id: 'A' as const, text: optA || 'Pernyataan 1' },
          { id: 'B' as const, text: optB || 'Pernyataan 2' },
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
        correctAnswers = rawKey.split(/[,;\s]+/).map((k) => k.trim().toUpperCase()).filter(Boolean);
        if (correctAnswers.length === 0) correctAnswers = ['A'];
      } else {
        options = [
          { id: 'A' as const, text: optA },
          { id: 'B' as const, text: optB },
          { id: 'C' as const, text: optC },
          { id: 'D' as const, text: optD },
        ].filter((o) => Boolean(o.text));
        const firstKey = rawKey.split(/[,;\s]+/)[0]?.trim().toUpperCase() || 'A';
        correctAnswers = [firstKey];
      }

      const rawTopic = (parts[cTopic] || parts[2] || 'Aqidah').trim();
      const rawTopicLower = rawTopic.toLowerCase();
      let subj: MateriPAI = 'Aqidah';
      if (rawTopicLower.includes("qur'an") || rawTopicLower.includes('hadis') || rawTopicLower.includes('quran')) {
        subj = "Al-Qur'an Hadis";
      } else if (rawTopicLower.includes('fiq') || rawTopicLower.includes('fikih')) {
        subj = 'Fiqih';
      } else if (rawTopicLower.includes('akhlak') || rawTopicLower.includes('budi')) {
        subj = 'Akhlak';
      } else if (rawTopicLower.includes('sejarah') || rawTopicLower.includes('ski') || rawTopicLower.includes('kebudayaan')) {
        subj = 'Sejarah Kebudayaan Islam';
      } else if (rawTopicLower.includes('aqidah') || rawTopicLower.includes('akidah')) {
        subj = 'Aqidah';
      }

      const rawDiff = (parts[cDiff] || parts[3] || 'Sedang').trim().toLowerCase();
      let diff: Difficulty = 'Sedang';
      if (rawDiff.includes('mudah') || rawDiff === 'easy') diff = 'Mudah';
      else if (rawDiff.includes('sukar') || rawDiff.includes('sulit') || rawDiff === 'hard') diff = 'Sukar';

      parsed.push({
        id: (parts[cId] || `q-imp-${Date.now()}-${i}`).trim(),
        type: qType,
        subject: subj,
        topic: rawTopic || 'Materi PAI',
        difficulty: diff,
        question: qText,
        options,
        statements,
        correctAnswers,
        explanation: (parts[cExp] || parts[10] || '-').trim(),
        isActive: true,
        createdAt: new Date().toISOString(),
      });
    }

    setParsedList(parsed);
  };

  const handleApplyPasted = (replace: boolean) => {
    if (parsedList.length === 0) {
      showToast('Tidak ada data butir soal yang valid untuk diterapkan.', 'error');
      return;
    }
    storageService.saveQuestions(parsedList, replace);
    showToast(
      replace
        ? `Berhasil menggantikan seluruh bank soal dengan ${parsedList.length} butir soal dari spreadsheet!`
        : `Berhasil menambahkan ${parsedList.length} butir soal baru ke bank soal!`,
      'success'
    );
    setIsPasteOpen(false);
    setPastedText('');
    setParsedList([]);
    refreshData();
  };

  const filtered = questions.filter((q) => {
    const matchSearch =
      q.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.topic.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (q.stimulus && q.stimulus.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchMateri =
      selectedMateri === 'SEMUA' || q.subject === selectedMateri;

    const matchDiff =
      selectedDifficulty === 'SEMUA' || q.difficulty === selectedDifficulty;

    const matchType =
      selectedType === 'SEMUA' || q.type === selectedType;

    return matchSearch && matchMateri && matchDiff && matchType;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#087443]" />
              <span>Bank Soal PAI</span>
            </h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-[#EAF8F0] text-emerald-900 border border-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
              <span>Terkoneksi Sheet: BANK_SOAL</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Kelola {questions.length} butir soal pilihan ganda, PGK, dan benar/salah. Terkoneksi langsung ke Google Spreadsheet & ujian siswa.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          {/* Input file tersembunyi untuk upload langsung dari bank soal */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx, .xls, .csv"
            className="hidden"
          />

          <button
            type="button"
            onClick={handleOpenPullModal}
            className="flex items-center gap-1.5 bg-emerald-800 hover:bg-emerald-900 text-white px-3.5 py-2 rounded-lg font-bold text-xs shadow-xs transition cursor-pointer"
            title="Buka panel tarik soal dari Google Spreadsheet atau Apps Script Server"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPulling || isPullLoading ? 'animate-spin' : ''}`} />
            <span>Tarik dari Server / Sheets</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-3 py-2 rounded-lg font-semibold text-xs shadow-2xs transition cursor-pointer"
            title="Upload file Excel (.xlsx / .csv) butir soal langsung"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-700" />
            <span>Upload Excel</span>
          </button>

          <button
            type="button"
            onClick={() => setIsPasteOpen(true)}
            className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 px-3 py-2 rounded-lg font-semibold text-xs shadow-2xs transition cursor-pointer"
            title="Tempel baris data soal langsung dari Google Sheets atau Excel"
          >
            <ClipboardPaste className="w-3.5 h-3.5 text-emerald-700" />
            <span>Tempel Soal (Ctrl+V)</span>
          </button>

          <button
            type="button"
            onClick={handleSyncToSheets}
            disabled={isSyncing}
            className="flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-3 py-2 rounded-lg font-semibold text-xs shadow-2xs transition cursor-pointer disabled:opacity-50"
            title="Kirim seluruh butir soal ke Google Spreadsheet via Web App"
          >
            <Send className="w-3.5 h-3.5 text-emerald-700" />
            <span>{isSyncing ? 'Mengirim...' : 'Kirim ke Sheets'}</span>
          </button>

          <button
            type="button"
            onClick={handleCopyQuestions}
            className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3 py-2 rounded-lg font-medium text-xs shadow-2xs transition cursor-pointer"
            title="Salin semua butir soal ke clipboard untuk di-paste langsung (Ctrl+V) ke Google Sheets"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
            <span>{copied ? 'Disalin!' : 'Salin (Ctrl+V)'}</span>
          </button>

          {questions.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Kosongkan seluruh bank soal lokal? Butir soal versi demo akan dihapus sehingga Anda dapat menarik soal murni dari server spreadsheet.')) {
                  storageService.clearQuestions();
                  showToast('Seluruh butir soal lokal & demo telah dikosongkan.', 'info');
                  refreshData();
                }
              }}
              className="flex items-center gap-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 px-3 py-2 rounded-lg font-medium text-xs shadow-2xs transition cursor-pointer"
              title="Hapus seluruh butir soal lokal / demo"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Bersihkan Soal</span>
            </button>
          )}

          <button
            onClick={() => {
              setEditingQuestion(null);
              setIsFormOpen(true);
            }}
            className="flex items-center gap-2 bg-[#087443] hover:bg-[#065b34] text-white px-4 py-2 rounded-lg font-bold text-xs shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Soal Baru</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-emerald-950/10 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari materi, pertanyaan, atau stimulus..."
              className="w-full pl-9 pr-3.5 py-1.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:border-[#087443]"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            <select
              value={selectedMateri}
              onChange={(e) => setSelectedMateri(e.target.value)}
              className="py-1.5 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white focus:outline-none focus:border-[#087443]"
            >
              {MATERI_LIST.map((m) => (
                <option key={m} value={m}>
                  {m === 'SEMUA' ? 'Semua Materi Pokok' : m}
                </option>
              ))}
            </select>

            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="py-1.5 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white focus:outline-none focus:border-[#087443]"
            >
              <option value="SEMUA">Semua Tingkat</option>
              <option value="Mudah">Mudah</option>
              <option value="Sedang">Sedang</option>
              <option value="Sukar">Sukar</option>
            </select>

            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="py-1.5 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white focus:outline-none focus:border-[#087443]"
            >
              <option value="SEMUA">Semua Jenis Soal</option>
              <option value="PG">Pilihan Ganda (PG)</option>
              <option value="PGK">PG Kompleks (PGK)</option>
              <option value="BS">Benar / Salah (BS)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-4">
        {questions.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-emerald-300 shadow-2xs space-y-4">
            <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-[#087443]">
              <BookOpen className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-base font-bold text-slate-800">
                Bank Soal Masih Kosong (0 Butir Soal)
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Seluruh butir soal versi demo bawaan telah dibersihkan. Silakan sinkronkan dengan Google Spreadsheet server Anda atau tempel baris soal langsung.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
              <button
                type="button"
                onClick={handlePullFromSheets}
                disabled={isPulling}
                className="flex items-center gap-2 bg-[#087443] hover:bg-[#065b34] text-white px-4 py-2.5 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isPulling ? 'animate-spin' : ''}`} />
                <span>{isPulling ? 'Menarik Soal...' : 'Tarik Soal dari Sheets'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsPasteOpen(true)}
                className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 px-4 py-2.5 rounded-lg text-xs font-bold shadow-2xs transition cursor-pointer"
              >
                <ClipboardPaste className="w-4 h-4 text-emerald-700" />
                <span>Tempel Soal (Ctrl+V)</span>
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border border-slate-200 text-slate-400 text-xs sm:text-sm">
            Tidak ada butir soal yang sesuai dengan kriteria filter pencarian.
          </div>
        ) : (
          filtered.map((q, idx) => (
            <div
              key={q.id}
              className="bg-white rounded-xl p-5 border border-emerald-950/10 shadow-xs hover:border-emerald-700/40 transition-colors"
            >
              {/* Question Header meta */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-medium text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                    #{idx + 1}
                  </span>
                  <span className="text-xs font-semibold text-[#087443] bg-[#EAF8F0] px-2.5 py-0.5 rounded border border-emerald-200">
                    {q.subject}
                  </span>
                  <span className="text-xs text-slate-600 font-medium">
                    {q.topic}
                  </span>
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded uppercase ${
                      q.difficulty === 'Mudah'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : q.difficulty === 'Sedang'
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {q.difficulty}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                      q.type === 'PG'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : q.type === 'PGK'
                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-300'
                    }`}
                  >
                    {q.type === 'BS' ? 'Benar / Salah' : q.type}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleDuplicate(q.id)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition cursor-pointer"
                    title="Duplikasi Soal"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setEditingQuestion(q);
                      setIsFormOpen(true);
                    }}
                    className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-800 transition cursor-pointer"
                    title="Edit Soal"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(q.id)}
                    className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600 transition cursor-pointer"
                    title="Hapus Soal"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Stimulus text */}
              {q.stimulus && (
                <div className="bg-[#F8FAF8] p-3.5 rounded-lg border border-emerald-950/10 text-xs sm:text-sm text-slate-700 mb-3 whitespace-pre-line leading-relaxed">
                  <span className="font-semibold text-emerald-900 block mb-1 text-[11px] uppercase tracking-wide">
                    Stimulus:
                  </span>
                  {q.stimulus}
                </div>
              )}

              {/* Question text */}
              <div className="text-sm font-semibold text-slate-900 mb-3 leading-relaxed">
                {q.question}
              </div>

              {/* Options or Statements Preview according to Question Type */}
              {(() => {
                if (q.type === 'BS') {
                  const stmts = (q.statements && q.statements.length > 0)
                    ? q.statements
                    : (q.options && q.options.length > 0)
                    ? q.options.map((opt, i) => ({
                        id: `S${i + 1}`,
                        text: opt.text,
                        correct: (q.correctAnswers.includes(opt.id) || q.correctAnswers.includes(`S${i + 1}:BENAR`) ? 'BENAR' : 'SALAH') as 'BENAR' | 'SALAH',
                      }))
                    : [];

                  return (
                    <div className="border border-amber-200/80 rounded-xl overflow-hidden mb-3 text-xs bg-amber-50/20">
                      <div className="bg-amber-100/60 px-3 py-1.5 border-b border-amber-200/80 flex items-center justify-between text-[11px] font-bold text-amber-950">
                        <span className="flex items-center gap-1.5">
                          <ListChecks className="w-3.5 h-3.5 text-amber-800" />
                          <span>Pernyataan Benar / Salah ({stmts.length} Butir)</span>
                        </span>
                        <span className="font-mono text-[10px] text-amber-800 bg-white px-2 py-0.5 rounded border border-amber-300">
                          Matriks BS
                        </span>
                      </div>
                      <table className="w-full text-left">
                        <thead className="bg-[#FAFDFB] border-b border-slate-200 text-slate-700 font-bold text-[11px]">
                          <tr>
                            <th className="py-2 px-3 w-8 text-center">No</th>
                            <th className="py-2 px-3">Teks Pernyataan</th>
                            <th className="py-2 px-3 w-28 text-center border-l border-slate-200">Kunci Jawaban</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {stmts.map((st, sIdx) => {
                            const isCorrectBenar = q.correctAnswers.includes(`${st.id}:BENAR`) || st.correct === 'BENAR';
                            return (
                              <tr key={st.id} className="hover:bg-slate-50/70">
                                <td className="py-2 px-3 text-slate-400 font-bold text-center">{sIdx + 1}</td>
                                <td className="py-2 px-3 text-slate-800 font-medium leading-relaxed">{st.text}</td>
                                <td className="py-2 px-3 text-center border-l border-slate-100">
                                  <span
                                    className={`px-2.5 py-0.5 rounded-md text-[10px] font-black inline-flex items-center gap-1 ${
                                      isCorrectBenar
                                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                        : 'bg-rose-100 text-rose-900 border border-rose-300'
                                    }`}
                                  >
                                    {isCorrectBenar ? 'BENAR ✓' : 'SALAH ✗'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                }

                if (q.type === 'PGK') {
                  const opts = (q.options && q.options.length > 0)
                    ? q.options
                    : (q.statements && q.statements.length > 0)
                    ? q.statements.map((st, i) => ({
                        id: String.fromCharCode(65 + i) as 'A' | 'B' | 'C' | 'D',
                        text: st.text,
                      }))
                    : [];

                  return (
                    <div className="space-y-1.5 mb-3">
                      <div className="flex items-center justify-between text-[11px] text-indigo-950 font-bold px-1 mb-1">
                        <span className="flex items-center gap-1.5">
                          <CheckSquare className="w-3.5 h-3.5 text-indigo-700" />
                          <span>Pilihan Ganda Kompleks (Checkbox Multi-Kunci)</span>
                        </span>
                        <span className="text-[10px] font-mono text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          Kunci: [{q.correctAnswers.join(', ')}]
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {opts.map((opt) => {
                          const isKey = q.correctAnswers.includes(opt.id);
                          return (
                            <div
                              key={opt.id}
                              className={`p-2.5 rounded-xl border flex items-start gap-2.5 transition-colors ${
                                isKey
                                  ? 'border-indigo-500 bg-indigo-50/50 font-medium text-indigo-950 ring-1 ring-indigo-400/40'
                                  : 'border-slate-200 text-slate-600 bg-white'
                              }`}
                            >
                              <span
                                className={`w-5 h-5 rounded-md flex items-center justify-center font-black text-[11px] shrink-0 border ${
                                  isKey
                                    ? 'bg-indigo-700 border-indigo-700 text-white shadow-2xs'
                                    : 'bg-white border-slate-300 text-slate-700'
                                }`}
                              >
                                {isKey ? '✓' : opt.id}
                              </span>
                              <span className="flex-1 leading-snug">{opt.text}</span>
                              {isKey && (
                                <span className="text-[10px] font-extrabold text-indigo-800 bg-indigo-100 px-1.5 py-0.5 rounded shrink-0">
                                  Kunci PGK
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                // Default: PG (Pilihan Ganda Tunggal)
                const opts = (q.options && q.options.length > 0)
                  ? q.options
                  : (q.statements && q.statements.length > 0)
                  ? q.statements.map((st, i) => ({
                      id: String.fromCharCode(65 + i) as 'A' | 'B' | 'C' | 'D',
                      text: st.text,
                    }))
                  : [];

                return (
                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center justify-between text-[11px] text-emerald-950 font-bold px-1 mb-1">
                      <span className="flex items-center gap-1.5">
                        <CircleDot className="w-3.5 h-3.5 text-[#087443]" />
                        <span>Pilihan Ganda Tunggal (Radio Bulat)</span>
                      </span>
                      <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Kunci Utama: Opsi {q.correctAnswers[0] || 'A'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {opts.map((opt) => {
                        const isKey = q.correctAnswers.includes(opt.id);
                        return (
                          <div
                            key={opt.id}
                            className={`p-2.5 rounded-xl border flex items-start gap-2.5 transition-colors ${
                              isKey
                                ? 'border-emerald-600 bg-[#EAF8F0] font-medium text-emerald-950 ring-1 ring-emerald-500/40'
                                : 'border-slate-200 text-slate-600 bg-white'
                            }`}
                          >
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-[11px] shrink-0 border ${
                                isKey
                                  ? 'bg-[#087443] border-[#087443] text-white shadow-2xs'
                                  : 'bg-white border-slate-300 text-slate-700'
                              }`}
                            >
                              {opt.id}
                            </span>
                            <span className="flex-1 leading-snug">{opt.text}</span>
                            {isKey && (
                              <span className="text-[10px] font-extrabold text-emerald-800 bg-white px-1.5 py-0.5 rounded border border-emerald-300 shrink-0">
                                Kunci Jawaban ✓
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Explanation preview */}
              {q.explanation && (
                <div className="text-[11px] text-slate-600 bg-[#F8FAF8] p-2.5 rounded-lg border border-slate-200">
                  <strong className="text-slate-800 font-semibold">Pembahasan: </strong>
                  {q.explanation}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Modal Tarik Bank Soal dari Server & Google Spreadsheet */}
      {isPullModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-[#087443] text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-700/50 flex items-center justify-center border border-emerald-500/50">
                  <RefreshCw className={`w-4 h-4 text-emerald-200 ${isPullLoading ? 'animate-spin' : ''}`} />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base leading-tight">
                    Tarik Bank Soal dari Google Spreadsheet / Server
                  </h3>
                  <p className="text-[11px] text-emerald-100 font-normal">
                    Muat butir soal PG, PGK, dan Benar/Salah (BS) secara online ke aplikasi CBT
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPullModalOpen(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs sm:text-sm">
              {/* Petunjuk format input */}
              <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 text-emerald-950 space-y-1 text-xs leading-relaxed">
                <span className="font-bold flex items-center gap-1.5 text-[#087443]">
                  <Sparkles className="w-4 h-4" />
                  <span>Mendukung 2 Cara Mudah Pengambilan Data Online:</span>
                </span>
                <ul className="list-disc pl-4 space-y-0.5 text-slate-700 text-[11px] pt-1">
                  <li>
                    <strong>Link Google Spreadsheet (Rekomendasi Tercepat):</strong> Cukup tempel link spreadsheet (misal: <code className="bg-white px-1 py-0.5 rounded border border-emerald-200 font-mono text-emerald-800">https://docs.google.com/spreadsheets/d/...</code>) dan pastikan hak aksesnya <em>&quot;Siapa saja yang memiliki link dapat melihat&quot;</em>.
                  </li>
                  <li>
                    <strong>Web App Google Apps Script:</strong> Gunakan URL Web App (<code className="bg-white px-1 py-0.5 rounded border border-emerald-200 font-mono text-emerald-800">https://script.google.com/macros/s/.../exec</code>) dengan deployment akses <em>&quot;Anyone / Siapa Saja&quot;</em>.
                  </li>
                </ul>
              </div>

              {/* Input URL */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>URL Google Spreadsheet atau Web App Apps Script:</span>
                  <span className="text-[11px] text-slate-400 font-normal">Sheet tab: BANK_SOAL / SOAL</span>
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={pullUrl}
                    onChange={(e) => setPullUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/1.../edit atau https://script.google.com/macros/s/.../exec"
                    className="flex-1 p-2.5 rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:border-[#087443] focus:ring-1 focus:ring-[#087443] bg-white text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => handleExecutePullModal()}
                    disabled={isPullLoading || !pullUrl.trim()}
                    className="py-2.5 px-5 bg-[#087443] hover:bg-[#065b34] text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPullLoading ? 'animate-spin' : ''}`} />
                    <span>{isPullLoading ? 'Sedang Menarik...' : 'Tarik Soal Sekarang'}</span>
                  </button>
                </div>
              </div>

              {/* Status & Hasil Analisis */}
              {pullDetailedResult && (
                <div className="space-y-3 pt-2">
                  {pullDetailedResult.success && pullDetailedResult.questions ? (
                    <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-300 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="font-bold text-xs sm:text-sm text-emerald-950 flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                          <span>
                            Ditemukan {pullDetailedResult.questions.length} Butir Soal ({pullDetailedResult.source})
                          </span>
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(() => {
                            const qList = pullDetailedResult.questions;
                            const pg = qList.filter((q) => q.type === 'PG').length;
                            const pgk = qList.filter((q) => q.type === 'PGK').length;
                            const bs = qList.filter((q) => q.type === 'BS').length;
                            return (
                              <>
                                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-white text-emerald-800 border border-emerald-200">
                                  {pg} PG
                                </span>
                                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-white text-indigo-800 border border-indigo-200">
                                  {pgk} PGK
                                </span>
                                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-white text-amber-800 border border-amber-200">
                                  {bs} Benar/Salah
                                </span>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Preview Daftar Soal */}
                      <div className="max-h-56 overflow-y-auto border border-emerald-200 rounded-lg divide-y divide-slate-100 bg-white">
                        {pullDetailedResult.questions.slice(0, 5).map((q, idx) => (
                          <div key={q.id || idx} className="p-2.5 text-xs space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-800">#{idx + 1}</span>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] font-black ${
                                  q.type === 'PG'
                                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                    : q.type === 'PGK'
                                    ? 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                                }`}
                              >
                                {q.type}
                              </span>
                              <span className="text-[11px] text-slate-600 font-semibold">{q.topic}</span>
                              <span className="text-[10px] text-slate-400">({q.difficulty})</span>
                            </div>
                            <p className="text-slate-900 line-clamp-1 font-medium">{q.question}</p>
                            <p className="text-[11px] text-slate-500">
                              Kunci: <strong className="text-emerald-800">{q.correctAnswers.join(', ')}</strong> •{' '}
                              {q.type === 'BS'
                                ? `${q.statements?.length || 0} Pernyataan`
                                : `${q.options?.length || 0} Opsi Pilihan`}
                            </p>
                          </div>
                        ))}
                        {pullDetailedResult.questions.length > 5 && (
                          <div className="p-2 text-center text-[11px] text-slate-500 font-medium bg-slate-50">
                            ...dan {pullDetailedResult.questions.length - 5} butir soal lainnya siap diterapkan
                          </div>
                        )}
                      </div>

                      {/* Tombol Terapkan */}
                      <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleApplyPulledQuestions(false)}
                          className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-semibold rounded-lg text-xs shadow-2xs transition cursor-pointer"
                        >
                          Tambahkan ke Bank Soal
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyPulledQuestions(true)}
                          className="px-4 py-2 bg-[#087443] hover:bg-[#065b34] text-white font-bold rounded-lg text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Terapkan & Gantikan Bank Soal (100% Sinkron)</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Error / Auth Required Card */
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-300 text-xs text-amber-950 space-y-2">
                      <div className="flex items-center gap-2 font-bold text-amber-900">
                        <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>Koneksi Server / Spreadsheet Membutuhkan Penyesuaian</span>
                      </div>
                      <p className="text-slate-700 leading-relaxed">
                        {pullDetailedResult.error || 'Data soal di spreadsheet belum terbaca.'}
                      </p>

                      {pullDetailedResult.requiresAuth && (
                        <div className="p-3 bg-white rounded-lg border border-amber-200 space-y-2 text-[11px] leading-relaxed">
                          <span className="font-bold text-amber-950 block">
                            💡 2 Solusi Cepat untuk Memasukkan Bank Soal:
                          </span>
                          <div className="space-y-1 text-slate-700">
                            <p>
                              <strong>Solusi 1 (Paling Mudah):</strong> Buka file Google Spreadsheet Anda di Google Drive, klik tombol biru <strong>Bagikan (Share)</strong> di pojok kanan atas, lalu ubah <em>Akses umum</em> menjadi <strong>&quot;Siapa saja yang memiliki link dapat melihat&quot;</strong>. Salin link spreadsheet-nya lalu tempelkan di kotak input atas.
                            </p>
                            <p>
                              <strong>Solusi 2:</strong> Atau cukup blok dan copy baris soal Anda di Google Sheets, lalu klik tombol <strong>Tempel Soal (Ctrl+V)</strong> di bawah ini!
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Opsi Tambahan Cepat */}
              <div className="pt-3 border-t border-slate-200">
                <span className="block text-xs font-bold text-slate-700 mb-2">
                  Metode Alternatif Lainnya:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPullModalOpen(false);
                      setIsPasteOpen(true);
                    }}
                    className="p-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-left flex items-center gap-2 transition cursor-pointer"
                  >
                    <ClipboardPaste className="w-4 h-4 text-emerald-700 shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Tempel (Ctrl+V)</span>
                      <span className="text-[10px] text-slate-500">Paste baris spreadsheet</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsPullModalOpen(false);
                      fileInputRef.current?.click();
                    }}
                    className="p-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-left flex items-center gap-2 transition cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-indigo-700 shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Upload File Excel</span>
                      <span className="text-[10px] text-slate-500">Impor file .xlsx / .csv</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => excelUtils.downloadQuestionTemplate()}
                    className="p-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-left flex items-center gap-2 transition cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-[#087443] shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Download Template</span>
                      <span className="text-[10px] text-slate-500">Format kolom resmi MGMP</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-3.5 bg-slate-50 border-t border-slate-200">
              <span className="text-[11px] text-slate-500">
                Penyimpanan otomatis sinkron ke perangkat penguji & peserta CBT.
              </span>
              <button
                type="button"
                onClick={() => setIsPullModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg text-xs transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {isFormOpen && (
        <AdminQuestionForm
          initialData={editingQuestion}
          onClose={() => setIsFormOpen(false)}
          onSaved={() => {
            refreshData();
          }}
        />
      )}

      {/* Modal Tempel Soal dari Spreadsheet */}
      {isPasteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-[#087443] text-white">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-200" />
                <h3 className="font-bold text-sm sm:text-base">Tempel Data Soal dari Spreadsheet / Excel</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPasteOpen(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs sm:text-sm">
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-2.5 text-xs leading-relaxed">
                <Info className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <strong>Cara Mudah & Instan:</strong> Buka spreadsheet Anda, pilih dan blok baris butir soal (misal dari baris judul atau data soal), lalu tekan <strong>Ctrl+C</strong> (Copy). Setelah itu klik kotak teks di bawah dan tekan <strong>Ctrl+V</strong> (Paste).
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tempel Baris Data Spreadsheet di Bawah Ini:
                </label>
                <textarea
                  rows={6}
                  value={pastedText}
                  onChange={(e) => {
                    setPastedText(e.target.value);
                    parsePastedSpreadsheetText(e.target.value);
                  }}
                  placeholder="ID / No&#9;Tipe&#9;Topik&#9;Kesulitan&#9;Pertanyaan&#9;Opsi A&#9;Opsi B&#9;Opsi C&#9;Opsi D&#9;Kunci&#9;Pembahasan"
                  className="w-full p-3 font-mono text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-[#087443] focus:ring-1 focus:ring-[#087443] bg-slate-50 text-slate-800 placeholder:text-slate-400"
                />
              </div>

              {/* Preview */}
              {parsedList.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1.5 text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Terdeteksi {parsedList.length} butir soal valid siap diproses</span>
                    </span>
                  </div>

                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                    {parsedList.slice(0, 10).map((q, idx) => (
                      <div key={q.id || idx} className="p-3 text-xs flex items-start justify-between gap-3">
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-800">#{idx + 1}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {q.type}
                            </span>
                            <span className="text-[11px] text-slate-500 font-medium truncate">
                              {q.topic}
                            </span>
                          </div>
                          <p className="text-slate-900 line-clamp-1 font-medium">{q.question}</p>
                          <p className="text-[11px] text-emerald-700 font-medium">
                            Kunci: {q.correctAnswers.join(', ')} • {q.options?.length || q.statements?.length || 0} pilihan
                          </p>
                        </div>
                      </div>
                    ))}
                    {parsedList.length > 10 && (
                      <div className="p-2.5 text-center text-xs text-slate-500 font-medium bg-slate-50">
                        ...dan {parsedList.length - 10} butir soal lainnya
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200 gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setIsPasteOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                Batal
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={parsedList.length === 0}
                  onClick={() => handleApplyPasted(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
                >
                  Tambahkan ke Bank Soal
                </button>
                <button
                  type="button"
                  disabled={parsedList.length === 0}
                  onClick={() => handleApplyPasted(true)}
                  className="px-4 py-2 bg-[#087443] hover:bg-[#065b34] text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Gantikan Bank Soal (Sinkron 100%)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
