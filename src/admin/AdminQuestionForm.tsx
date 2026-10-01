import React, { useState } from 'react';
import { Question, MateriPAI, Difficulty, QuestionType, QuestionStatement } from '../types';
import { storageService } from '../services/storageService';
import { useToast } from '../components/Toast';
import {
  X,
  Check,
  Save,
  Plus,
  HelpCircle,
  BookOpen,
  Trash2,
  Layers,
  CheckCircle2,
  CheckSquare,
  ListChecks,
  CircleDot,
  Info
} from 'lucide-react';

interface AdminQuestionFormProps {
  initialData?: Question | null;
  onClose: () => void;
  onSaved: () => void;
}

const MATERI_LIST: MateriPAI[] = [
  'Aqidah',
  "Al-Qur'an Hadis",
  'Fiqih',
  'Akhlak',
  'Sejarah Kebudayaan Islam',
];

const DIFFICULTY_LIST: Difficulty[] = ['Mudah', 'Sedang', 'Sukar'];

export const AdminQuestionForm: React.FC<AdminQuestionFormProps> = ({
  initialData,
  onClose,
  onSaved,
}) => {
  const { showToast } = useToast();

  const [subject, setSubject] = useState<MateriPAI>(initialData?.subject || 'Aqidah');
  const [topic, setTopic] = useState(initialData?.topic || '');
  const [difficulty, setDifficulty] = useState<Difficulty>(initialData?.difficulty || 'Sedang');
  const [type, setType] = useState<QuestionType>(initialData?.type || 'PG');
  const [stimulus, setStimulus] = useState(initialData?.stimulus || '');
  const [question, setQuestion] = useState(initialData?.question || '');

  // Options for PG / PGK
  const [optionA, setOptionA] = useState(
    initialData?.options?.find((o) => o.id === 'A')?.text || ''
  );
  const [optionB, setOptionB] = useState(
    initialData?.options?.find((o) => o.id === 'B')?.text || ''
  );
  const [optionC, setOptionC] = useState(
    initialData?.options?.find((o) => o.id === 'C')?.text || ''
  );
  const [optionD, setOptionD] = useState(
    initialData?.options?.find((o) => o.id === 'D')?.text || ''
  );

  const [correctAnswers, setCorrectAnswers] = useState<string[]>(
    initialData?.correctAnswers && initialData.correctAnswers.length > 0
      ? initialData.correctAnswers
      : ['A']
  );

  // Statements for BS (Benar / Salah)
  const [statements, setStatements] = useState<QuestionStatement[]>(() => {
    if (initialData?.statements && initialData.statements.length > 0) {
      return initialData.statements;
    }
    // If initialData has options, convert them as default statements for BS
    if (initialData?.options && initialData.options.length > 0) {
      return initialData.options.map((opt, i) => ({
        id: `S${i + 1}`,
        text: opt.text,
        correct: (initialData.correctAnswers?.includes(opt.id) ? 'BENAR' : 'SALAH') as 'BENAR' | 'SALAH',
      }));
    }
    return [
      { id: 'S1', text: '', correct: 'BENAR' },
      { id: 'S2', text: '', correct: 'SALAH' },
      { id: 'S3', text: '', correct: 'BENAR' },
    ];
  });

  const [explanation, setExplanation] = useState(initialData?.explanation || '');
  const [isActive, setIsActive] = useState(initialData ? initialData.isActive : true);
  const [error, setError] = useState<string | null>(null);

  // Switch question type with smart migration of entered data
  const handleTypeChange = (newType: QuestionType) => {
    if (newType === type) return;

    if (newType === 'BS') {
      // Switching to Benar / Salah: if statements text is empty, migrate from options A-D
      const hasOptionText = optionA.trim() || optionB.trim() || optionC.trim() || optionD.trim();
      const statementsEmpty = statements.every((s) => !s.text.trim());
      if (hasOptionText && statementsEmpty) {
        const migrated: QuestionStatement[] = [];
        if (optionA.trim()) migrated.push({ id: 'S1', text: optionA.trim(), correct: correctAnswers.includes('A') ? 'BENAR' : 'SALAH' });
        if (optionB.trim()) migrated.push({ id: 'S2', text: optionB.trim(), correct: correctAnswers.includes('B') ? 'BENAR' : 'SALAH' });
        if (optionC.trim()) migrated.push({ id: 'S3', text: optionC.trim(), correct: correctAnswers.includes('C') ? 'BENAR' : 'SALAH' });
        if (optionD.trim()) migrated.push({ id: 'S4', text: optionD.trim(), correct: correctAnswers.includes('D') ? 'BENAR' : 'SALAH' });
        if (migrated.length >= 2) {
          setStatements(migrated);
        }
      }
    } else {
      // Switching to PG or PGK: if options are empty, migrate from statements
      const optionsEmpty = !optionA.trim() && !optionB.trim() && !optionC.trim() && !optionD.trim();
      if (optionsEmpty && statements.length > 0) {
        if (statements[0]?.text) setOptionA(statements[0].text);
        if (statements[1]?.text) setOptionB(statements[1].text);
        if (statements[2]?.text) setOptionC(statements[2].text);
        if (statements[3]?.text) setOptionD(statements[3].text);
      }

      if (newType === 'PG' && correctAnswers.length > 1) {
        setCorrectAnswers([correctAnswers[0] || 'A']);
      }
      if (correctAnswers.length === 0 || !['A', 'B', 'C', 'D'].includes(correctAnswers[0])) {
        setCorrectAnswers(['A']);
      }
    }

    setType(newType);
  };

  const handleToggleAnswer = (optId: string) => {
    if (type === 'PG') {
      // Single choice radio behavior
      setCorrectAnswers([optId]);
    } else {
      // Multiple choice checkbox behavior
      if (correctAnswers.includes(optId)) {
        if (correctAnswers.length === 1) {
          setError('Minimal harus ada 1 kunci jawaban yang dipilih.');
          return;
        }
        setCorrectAnswers(correctAnswers.filter((a) => a !== optId));
      } else {
        setCorrectAnswers([...correctAnswers, optId].sort());
      }
    }
  };

  const handleAddStatement = () => {
    const nextNum = statements.length + 1;
    setStatements([...statements, { id: `S${nextNum}`, text: '', correct: 'BENAR' }]);
  };

  const handleRemoveStatement = (index: number) => {
    if (statements.length <= 2) {
      setError('Minimal harus ada 2 butir pernyataan untuk soal Benar / Salah.');
      return;
    }
    setStatements(statements.filter((_, i) => i !== index));
  };

  const handleStatementTextChange = (index: number, text: string) => {
    const updated = [...statements];
    updated[index].text = text;
    setStatements(updated);
  };

  const handleStatementCorrectChange = (index: number, correct: 'BENAR' | 'SALAH') => {
    const updated = [...statements];
    updated[index].correct = correct;
    setStatements(updated);
  };

  const handleSave = (addAnother = false) => {
    setError(null);

    if (!topic.trim()) {
      setError('Submateri / Topik soal wajib diisi.');
      return;
    }
    if (!question.trim()) {
      setError('Pertanyaan soal wajib diisi.');
      return;
    }

    let finalCorrectAnswers: string[] = [];
    let finalOptions = undefined;
    let finalStatements = undefined;

    if (type === 'BS') {
      if (!stimulus.trim()) {
        setError('Untuk jenis soal Benar / Salah, narasi wacana stimulus disarankan diisi agar siswa dapat menganalisis pernyataan.');
        return;
      }
      // Check statements
      for (let i = 0; i < statements.length; i++) {
        if (!statements[i].text.trim()) {
          setError(`Teks pernyataan nomor ${i + 1} masih kosong.`);
          return;
        }
      }
      finalStatements = statements.map((st, idx) => ({
        id: `S${idx + 1}`,
        text: st.text.trim(),
        correct: st.correct,
      }));
      finalCorrectAnswers = finalStatements.map((st) => `${st.id}:${st.correct}`);
    } else {
      if (!optionA.trim() || !optionB.trim() || !optionC.trim() || !optionD.trim()) {
        setError('Seluruh pilihan jawaban A, B, C, dan D wajib diisi.');
        return;
      }
      if (correctAnswers.length === 0) {
        setError('Pilih minimal satu kunci jawaban yang benar.');
        return;
      }
      finalOptions = [
        { id: 'A' as const, text: optionA.trim() },
        { id: 'B' as const, text: optionB.trim() },
        { id: 'C' as const, text: optionC.trim() },
        { id: 'D' as const, text: optionD.trim() },
      ];
      finalCorrectAnswers = correctAnswers;
    }

    try {
      storageService.saveQuestion({
        id: initialData?.id,
        subject,
        topic: topic.trim(),
        difficulty,
        type,
        stimulus: stimulus.trim() || undefined,
        question: question.trim(),
        options: finalOptions,
        statements: finalStatements,
        correctAnswers: finalCorrectAnswers,
        explanation: explanation.trim() || undefined,
        isActive,
      });

      showToast('Soal berhasil disimpan ke Bank Soal & disinkronkan ke Google Spreadsheet!', 'success');
      onSaved();

      if (addAnother) {
        // Reset form for next question
        setQuestion('');
        setStimulus('');
        setOptionA('');
        setOptionB('');
        setOptionC('');
        setOptionD('');
        setExplanation('');
        setCorrectAnswers(['A']);
        setStatements([
          { id: 'S1', text: '', correct: 'BENAR' },
          { id: 'S2', text: '', correct: 'SALAH' },
          { id: 'S3', text: '', correct: 'BENAR' },
        ]);
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Gagal menyimpan soal.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EAF8F0] text-[#087443] flex items-center justify-center font-bold">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {initialData ? 'Ubah Butir Soal' : 'Tambah Butir Soal Baru'}
              </h3>
              <p className="text-xs text-slate-500">
                Pilih jenis soal (PG, PGK, atau BS) untuk menampilkan input butir soal yang sesuai.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
            {error}
          </div>
        )}

        <div className="space-y-4 text-xs sm:text-sm">
          
          {/* Pilihan Jenis Soal (Segmented Tab Bar Khas CBT Kemendikdasmen) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Pilih Jenis Butir Soal <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              
              {/* Option 1: PG */}
              <button
                type="button"
                onClick={() => handleTypeChange('PG')}
                className={`p-3 rounded-xl border-2 text-left transition cursor-pointer flex flex-col justify-between ${
                  type === 'PG'
                    ? 'border-[#087443] bg-[#EAF8F0] text-[#087443] shadow-xs ring-1 ring-emerald-500'
                    : 'border-slate-200 hover:border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-extrabold text-xs sm:text-sm flex items-center gap-1.5">
                    <CircleDot className="w-4 h-4" />
                    <span>Pilihan Ganda (PG)</span>
                  </span>
                  {type === 'PG' && <Check className="w-4 h-4 text-[#087443]" />}
                </div>
                <p className="text-[11px] text-slate-500 font-normal leading-tight">
                  1 jawaban benar. Format radio button bulat (A, B, C, D).
                </p>
              </button>

              {/* Option 2: PGK */}
              <button
                type="button"
                onClick={() => handleTypeChange('PGK')}
                className={`p-3 rounded-xl border-2 text-left transition cursor-pointer flex flex-col justify-between ${
                  type === 'PGK'
                    ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 shadow-xs ring-1 ring-indigo-500'
                    : 'border-slate-200 hover:border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-extrabold text-xs sm:text-sm flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-indigo-700" />
                    <span>PG Kompleks (PGK)</span>
                  </span>
                  {type === 'PGK' && <Check className="w-4 h-4 text-indigo-700" />}
                </div>
                <p className="text-[11px] text-slate-500 font-normal leading-tight">
                  Lebih dari 1 jawaban benar. Format checkbox kotak centang.
                </p>
              </button>

              {/* Option 3: BS */}
              <button
                type="button"
                onClick={() => handleTypeChange('BS')}
                className={`p-3 rounded-xl border-2 text-left transition cursor-pointer flex flex-col justify-between ${
                  type === 'BS'
                    ? 'border-amber-600 bg-amber-50/70 text-amber-950 shadow-xs ring-1 ring-amber-500'
                    : 'border-slate-200 hover:border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-extrabold text-xs sm:text-sm flex items-center gap-1.5">
                    <ListChecks className="w-4 h-4 text-amber-700" />
                    <span>Benar / Salah (BS)</span>
                  </span>
                  {type === 'BS' && <Check className="w-4 h-4 text-amber-700" />}
                </div>
                <p className="text-[11px] text-slate-500 font-normal leading-tight">
                  Matriks tabel pernyataan dengan pilihan BENAR atau SALAH.
                </p>
              </button>

            </div>
          </div>

          {/* Metadata Grid: Materi, Topik, Tingkat Kesulitan */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Materi Pokok
              </label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value as MateriPAI)}
                className="w-full p-2.5 rounded-xl border border-slate-300 font-medium bg-white focus:outline-none focus:border-[#087443]"
              >
                {MATERI_LIST.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Submateri / Topik
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Contoh: Zakat Mal, Toleransi"
                className="w-full p-2.5 rounded-xl border border-slate-300 font-medium focus:outline-none focus:border-[#087443]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Tingkat Kesulitan
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                className="w-full p-2.5 rounded-xl border border-slate-300 font-medium bg-white focus:outline-none focus:border-[#087443]"
              >
                {DIFFICULTY_LIST.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Stimulus Narasi */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Narasi / Stimulus Bacaan / Kutipan Ayat {type === 'BS' ? '(Sangat Dianjurkan untuk BS)' : '(Opsional)'}
              </label>
              {type === 'BS' && (
                <span className="text-[10px] font-bold text-[#087443] bg-[#EAF8F0] px-2 py-0.5 rounded border border-emerald-200">
                  Wacana Analisis Siswa
                </span>
              )}
            </div>
            <textarea
              rows={3}
              value={stimulus}
              onChange={(e) => setStimulus(e.target.value)}
              placeholder="Masukkan teks narasi wacana, penggalan ayat, kasus nyata, atau stimulus bacaan yang akan dianalisis oleh siswa..."
              className="w-full p-3 rounded-xl border border-slate-300 focus:outline-none focus:border-[#087443] font-normal text-xs sm:text-sm"
            />
          </div>

          {/* Pertanyaan */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Pertanyaan / Pokok Soal <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={2}
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={
                type === 'BS'
                  ? 'Contoh: Berdasarkan wacana di atas, tentukan nilai kebenaran dari masing-masing pernyataan berikut dengan memilih BENAR atau SALAH!'
                  : type === 'PGK'
                  ? 'Contoh: Berdasarkan ayat tersebut, manakah pernyataan berikut yang bernilai benar? (Pilihlah semua jawaban yang sesuai)'
                  : 'Tuliskan butir pertanyaan yang jelas dan terarah...'
              }
              className="w-full p-3 rounded-xl border border-slate-300 focus:outline-none focus:border-[#087443] font-medium text-xs sm:text-sm"
            />
          </div>

          {/* ========================================================================= */}
          {/* TAMPILAN BUTIR SOAL 1: BENAR / SALAH (BS) */}
          {/* ========================================================================= */}
          {type === 'BS' && (
            <div className="space-y-3 pt-2 bg-amber-50/40 p-4 rounded-xl border border-amber-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <label className="block text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                    <ListChecks className="w-4 h-4 text-amber-700" />
                    <span>Daftar Pernyataan & Kunci Jawaban (Benar / Salah)</span>
                  </label>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Tiap butir pernyataan dapat ditentukan apakah bernilai <strong>BENAR</strong> atau <strong>SALAH</strong>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddStatement}
                  className="px-3 py-1.5 bg-[#087443] hover:bg-[#065b34] text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer self-start sm:self-auto shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Pernyataan</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {statements.map((stmt, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-slate-300 bg-white flex flex-col sm:flex-row sm:items-center gap-2.5 shadow-2xs"
                  >
                    <span className="w-7 h-7 rounded-lg bg-[#EAF8F0] text-[#087443] font-bold text-xs flex items-center justify-center shrink-0 border border-emerald-300">
                      {idx + 1}
                    </span>

                    <input
                      type="text"
                      required
                      value={stmt.text}
                      onChange={(e) => handleStatementTextChange(idx, e.target.value)}
                      placeholder={`Tuliskan teks pernyataan nomor ${idx + 1}...`}
                      className="flex-1 p-2 rounded-lg border border-slate-300 font-medium text-xs sm:text-sm focus:outline-none focus:border-[#087443] bg-white"
                    />

                    <div className="flex items-center gap-2 shrink-0 justify-end">
                      <div className="flex items-center rounded-lg border border-slate-300 overflow-hidden bg-slate-100 p-0.5">
                        <button
                          type="button"
                          onClick={() => handleStatementCorrectChange(idx, 'BENAR')}
                          className={`px-3 py-1 rounded text-xs font-black transition cursor-pointer flex items-center gap-1 ${
                            stmt.correct === 'BENAR'
                              ? 'bg-[#087443] text-white shadow-2xs'
                              : 'text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {stmt.correct === 'BENAR' && <Check className="w-3 h-3" />}
                          <span>BENAR</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatementCorrectChange(idx, 'SALAH')}
                          className={`px-3 py-1 rounded text-xs font-black transition cursor-pointer flex items-center gap-1 ${
                            stmt.correct === 'SALAH'
                              ? 'bg-rose-700 text-white shadow-2xs'
                              : 'text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {stmt.correct === 'SALAH' && <Check className="w-3 h-3" />}
                          <span>SALAH</span>
                        </button>
                      </div>

                      {statements.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveStatement(idx)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Hapus Pernyataan Ini"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAMPILAN BUTIR SOAL 2: PILIHAN GANDA TUNGGAL (PG) */}
          {/* ========================================================================= */}
          {type === 'PG' && (
            <div className="space-y-3 pt-2 bg-emerald-50/40 p-4 rounded-xl border border-emerald-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <div>
                  <label className="block text-xs font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                    <CircleDot className="w-4 h-4 text-[#087443]" />
                    <span>Pilihan Jawaban & 1 Kunci Jawaban (Radio Bulat)</span>
                  </label>
                  <p className="text-[11px] text-slate-600">
                    Klik tombol lingkaran huruf (A/B/C/D) untuk memilih <strong>1 (satu) kunci jawaban benar</strong>.
                  </p>
                </div>
                <span className="text-[11px] text-emerald-900 bg-white px-2.5 py-1 rounded-lg font-bold border border-emerald-300 self-start sm:self-auto shadow-2xs">
                  Kunci Terpilih: Opsi {correctAnswers[0] || 'A'}
                </span>
              </div>

              {[
                { id: 'A', val: optionA, setter: setOptionA },
                { id: 'B', val: optionB, setter: setOptionB },
                { id: 'C', val: optionC, setter: setOptionC },
                { id: 'D', val: optionD, setter: setOptionD },
              ].map((opt) => {
                const isKey = correctAnswers.includes(opt.id);

                return (
                  <div
                    key={opt.id}
                    className={`flex items-center gap-2 p-2 rounded-xl border transition-all ${
                      isKey
                        ? 'border-emerald-500 bg-white ring-1 ring-emerald-500/50 shadow-2xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    {/* Circular Radio Key Button */}
                    <button
                      type="button"
                      onClick={() => handleToggleAnswer(opt.id)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shrink-0 transition cursor-pointer border-2 ${
                        isKey
                          ? 'bg-[#087443] border-[#087443] text-white shadow-xs'
                          : 'bg-white border-slate-300 text-slate-700 hover:border-emerald-600'
                      }`}
                      title={isKey ? 'Kunci Jawaban Terpilih' : `Pilih ${opt.id} Sebagai Kunci`}
                    >
                      {opt.id}
                    </button>

                    <input
                      type="text"
                      required
                      value={opt.val}
                      onChange={(e) => opt.setter(e.target.value)}
                      placeholder={`Teks pilihan jawaban ${opt.id}...`}
                      className="flex-1 p-2 rounded-lg border-0 font-medium text-xs sm:text-sm focus:outline-none text-slate-900 bg-transparent"
                    />

                    {isKey && (
                      <span className="text-xs font-bold text-emerald-800 px-2.5 py-1 bg-emerald-100 rounded-lg shrink-0 flex items-center gap-1 border border-emerald-200">
                        <Check className="w-3.5 h-3.5" />
                        <span>Kunci Jawaban</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAMPILAN BUTIR SOAL 3: PILIHAN GANDA KOMPLEKS (PGK) */}
          {/* ========================================================================= */}
          {type === 'PGK' && (
            <div className="space-y-3 pt-2 bg-indigo-50/40 p-4 rounded-xl border border-indigo-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <div>
                  <label className="block text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-indigo-700" />
                    <span>Pilihan Jawaban & Multi-Kunci (Kotak Centang)</span>
                  </label>
                  <p className="text-[11px] text-slate-600">
                    Klik kotak huruf (A/B/C/D) untuk memilih <strong>satu atau lebih kunci jawaban benar</strong>.
                  </p>
                </div>
                <span className="text-[11px] text-indigo-900 bg-white px-2.5 py-1 rounded-lg font-bold border border-indigo-300 self-start sm:self-auto shadow-2xs">
                  {correctAnswers.length} Kunci Terpilih: [{correctAnswers.join(', ')}]
                </span>
              </div>

              {[
                { id: 'A', val: optionA, setter: setOptionA },
                { id: 'B', val: optionB, setter: setOptionB },
                { id: 'C', val: optionC, setter: setOptionC },
                { id: 'D', val: optionD, setter: setOptionD },
              ].map((opt) => {
                const isKey = correctAnswers.includes(opt.id);

                return (
                  <div
                    key={opt.id}
                    className={`flex items-center gap-2 p-2 rounded-xl border transition-all ${
                      isKey
                        ? 'border-indigo-500 bg-white ring-1 ring-indigo-500/50 shadow-2xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    {/* Square Checkbox Key Button */}
                    <button
                      type="button"
                      onClick={() => handleToggleAnswer(opt.id)}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-sm shrink-0 transition cursor-pointer border-2 ${
                        isKey
                          ? 'bg-indigo-700 border-indigo-700 text-white shadow-xs'
                          : 'bg-white border-slate-300 text-slate-700 hover:border-indigo-600'
                      }`}
                      title={isKey ? 'Batal Jadikan Kunci' : `Centang ${opt.id} Sebagai Kunci`}
                    >
                      {isKey ? <Check className="w-5 h-5" /> : opt.id}
                    </button>

                    <input
                      type="text"
                      required
                      value={opt.val}
                      onChange={(e) => opt.setter(e.target.value)}
                      placeholder={`Teks pilihan jawaban ${opt.id}...`}
                      className="flex-1 p-2 rounded-lg border-0 font-medium text-xs sm:text-sm focus:outline-none text-slate-900 bg-transparent"
                    />

                    {isKey ? (
                      <span className="text-xs font-bold text-indigo-800 px-2.5 py-1 bg-indigo-100 rounded-lg shrink-0 flex items-center gap-1 border border-indigo-200">
                        <Check className="w-3.5 h-3.5" />
                        <span>Kunci PGK</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 px-2 py-1 shrink-0">
                        Bukan Kunci
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pembahasan */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Pembahasan / Keterangan Jawaban (Opsional)
            </label>
            <textarea
              rows={2}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Tuliskan dalil Al-Qur'an, hadis, atau alasan ilmiah mengapa kunci jawaban tersebut benar..."
              className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#087443] text-xs font-normal"
            />
          </div>

          {/* Active status checkbox */}
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isActiveQ"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded text-[#087443] focus:ring-emerald-400"
            />
            <label htmlFor="isActiveQ" className="text-xs font-semibold text-slate-700">
              Aktifkan soal ini di dalam pemilihan ujian
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition cursor-pointer"
          >
            Batal
          </button>
          {!initialData && (
            <button
              type="button"
              onClick={() => handleSave(true)}
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Simpan & Buat Soal Baru</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => handleSave(false)}
            className="py-2.5 px-5 rounded-xl bg-[#087443] hover:bg-[#065b34] text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Simpan Soal</span>
          </button>
        </div>
      </div>
    </div>
  );
};

