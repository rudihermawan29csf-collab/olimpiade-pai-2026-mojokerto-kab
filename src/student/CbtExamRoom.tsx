import React, { useState, useEffect } from 'react';
import { Participant, Exam, Question, QuestionOption, ExamResult } from '../types';
import { storageService } from '../services/storageService';
import { useExamTimer } from '../hooks/useExamTimer';
import { useAntiCheat } from '../hooks/useAntiCheat';
import { NetworkBanner } from '../components/NetworkBanner';
import { ViolationModal } from '../components/ViolationModal';
import { useToast } from '../components/Toast';
import {
  Clock,
  Check,
  Menu,
  X,
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  RotateCw,
  LayoutGrid,
  HelpCircle,
  ShieldCheck,
  CheckSquare,
  CircleDot,
  ListChecks
} from 'lucide-react';
import { LOGO_KEMENAG_MOJOKERTO, LOGO_MGMP_PAI_MOJOKERTO } from '../constants/branding';

interface CbtExamRoomProps {
  participant: Participant;
  exam: Exam;
  onFinishExam: (result: ExamResult) => void;
  onDisqualified: (result: ExamResult) => void;
}

export const CbtExamRoom: React.FC<CbtExamRoomProps> = ({
  participant,
  exam,
  onFinishExam,
  onDisqualified,
}) => {
  const { showToast } = useToast();

  // Load questions sanitized
  const [examData] = useState(() => {
    return storageService.getSanitizedExamQuestions(
      exam.id,
      exam.randomQuestion,
      exam.randomOption
    );
  });
  const questions = examData.questions;

  // Active question index
  const [currentIndex, setCurrentIndex] = useState<number>(
    participant.currentQuestionIndex || 0
  );

  // Student answers mapping: { [questionId]: ['A'] or ['A', 'C'] }
  const [answers, setAnswers] = useState<Record<string, string[]>>(
    participant.answers || {}
  );

  // Marked (ragu-ragu) list
  const [markedIndices, setMarkedIndices] = useState<number[]>(
    participant.markedQuestions || []
  );

  // Kemendikdasmen Font Size Switcher: 'small' | 'medium' | 'large'
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');

  // Autosave status state
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string>('Tersimpan');

  // Daftar Soal Pop-up / Modal state (Kemendikdasmen ANBK style)
  const [isDaftarSoalOpen, setIsDaftarSoalOpen] = useState(false);

  // Review & Submit Confirmation Modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Anti-cheat modal state
  const [violationModal, setViolationModal] = useState<{
    isOpen: boolean;
    strikeNumber: number;
    message: string;
    isTerminated: boolean;
  }>({
    isOpen: false,
    strikeNumber: 0,
    message: '',
    isTerminated: false,
  });

  const currentQuestion = questions[currentIndex] || questions[0];
  const currentAnswerList = currentQuestion ? answers[currentQuestion.id] || [] : [];
  const isCurrentMarked = markedIndices.includes(currentIndex);

  // Normalization: resolved statements for BS (guaranteed fallback)
  const resolvedStatements = React.useMemo(() => {
    if (!currentQuestion) return [];
    if (currentQuestion.type === 'BS') {
      if (currentQuestion.statements && currentQuestion.statements.length > 0) {
        return currentQuestion.statements;
      }
      if (currentQuestion.options && currentQuestion.options.length > 0) {
        return currentQuestion.options.map((opt, i) => ({
          id: `S${i + 1}`,
          text: opt.text,
          correct: 'BENAR' as const,
        }));
      }
      return [
        { id: 'S1', text: 'Pernyataan 1', correct: 'BENAR' as const },
        { id: 'S2', text: 'Pernyataan 2', correct: 'SALAH' as const },
      ];
    }
    return currentQuestion.statements || [];
  }, [currentQuestion]);

  // Normalization: resolved options for PG / PGK (guaranteed fallback)
  const resolvedOptions = React.useMemo(() => {
    if (!currentQuestion) return [];
    if (currentQuestion.type !== 'BS') {
      if (currentQuestion.options && currentQuestion.options.length > 0) {
        return currentQuestion.options;
      }
      if (currentQuestion.statements && currentQuestion.statements.length > 0) {
        return currentQuestion.statements.map((st, i) => ({
          id: String.fromCharCode(65 + i) as 'A' | 'B' | 'C' | 'D',
          text: st.text,
        }));
      }
    }
    return currentQuestion.options || [];
  }, [currentQuestion]);

  // Heartbeat & refresh recorder
  useEffect(() => {
    storageService.logActivity(participant.id, exam.id, 'PAGE_REFRESH', {
      currentIndex,
    });

    const heartbeatInterval = setInterval(() => {
      storageService.updateHeartbeat(participant.id);
    }, 15000);

    return () => clearInterval(heartbeatInterval);
  }, [participant.id, exam.id]);

  // Submit test handler
  const handleFinalSubmit = (status: 'completed' | 'violated' = 'completed') => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = storageService.calculateAndStoreResult(participant.id, status);
      if (status === 'violated') {
        onDisqualified(result);
      } else {
        onFinishExam(result);
      }
    } catch (err) {
      console.error('Submit error:', err);
      setIsSubmitting(false);
      showToast('Gagal mengirimkan ujian. Silakan coba kembali.', 'error');
    }
  };

  // Timer Hook
  const {
    formattedTime,
    isWarning,
    isDanger,
    isCritical,
  } = useExamTimer({
    startedAt: participant.startedAt,
    durationMinutes: exam.durationMinutes,
    isActive: participant.status === 'active' || participant.status === 'ready',
    onTimeUp: () => {
      showToast('Waktu ujian telah berakhir. Jawaban Anda sedang disimpan...', 'warning');
      setTimeout(() => {
        handleFinalSubmit('completed');
      }, 1000);
    },
  });

  // Anti-Cheat Hook
  const { requestFullscreen } = useAntiCheat({
    participantId: participant.id,
    examId: exam.id,
    isEnabled: exam.antiCheat && participant.status !== 'completed' && participant.status !== 'violated',
    onViolationStrike: (strike, message, isTerminated) => {
      setViolationModal({
        isOpen: true,
        strikeNumber: strike,
        message,
        isTerminated,
      });

      if (isTerminated) {
        setTimeout(() => {
          handleFinalSubmit('violated');
        }, 1500);
      }
    },
  });

  // Select Option Handler (Autosave immediately)
  const handleSelectOption = (optionId: string) => {
    if (!currentQuestion) return;

    let updatedSelection: string[] = [];

    if (currentQuestion.type === 'PG') {
      updatedSelection = [optionId];
    } else {
      const prev = answers[currentQuestion.id] || [];
      if (prev.includes(optionId)) {
        updatedSelection = prev.filter((id) => id !== optionId);
      } else {
        updatedSelection = [...prev, optionId];
      }
    }

    const newAnswers = {
      ...answers,
      [currentQuestion.id]: updatedSelection,
    };

    setAnswers(newAnswers);
    setIsSaving(true);

    storageService.saveAnswer(participant.id, currentQuestion.id, updatedSelection);

    setTimeout(() => {
      setIsSaving(false);
      setLastSavedTime(
        new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    }, 200);
  };

  // Statement Choice Handler for BS (Benar/Salah) Questions
  const handleSelectStatementChoice = (statementId: string, choice: 'BENAR' | 'SALAH') => {
    if (!currentQuestion) return;

    const prev = answers[currentQuestion.id] || [];
    const filtered = prev.filter((ans) => !ans.startsWith(`${statementId}:`));
    const updatedSelection = [...filtered, `${statementId}:${choice}`].sort();

    const newAnswers = {
      ...answers,
      [currentQuestion.id]: updatedSelection,
    };

    setAnswers(newAnswers);
    setIsSaving(true);

    storageService.saveAnswer(participant.id, currentQuestion.id, updatedSelection);

    setTimeout(() => {
      setIsSaving(false);
      setLastSavedTime(
        new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    }, 200);
  };

  // Toggle Mark (Ragu-ragu khas ANBK)
  const handleToggleMark = () => {
    const updated = storageService.toggleMarkQuestion(participant.id, currentIndex);
    setMarkedIndices(updated);
    showToast(
      isCurrentMarked
        ? `Tanda ragu-ragu soal nomor ${currentIndex + 1} dibatalkan`
        : `Soal nomor ${currentIndex + 1} ditandai ragu-ragu`,
      'info'
    );
  };

  const handleGoToQuestion = (index: number) => {
    if (index >= 0 && index < questions.length) {
      setCurrentIndex(index);
      storageService.updateCurrentQuestionIndex(participant.id, index);
      setIsDaftarSoalOpen(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      handleGoToQuestion(currentIndex + 1);
    } else {
      setShowReviewModal(true);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      handleGoToQuestion(currentIndex - 1);
    }
  };

  const answeredCount = Object.keys(answers).filter(
    (qid) => answers[qid] && answers[qid].length > 0
  ).length;
  const unansweredCount = questions.length - answeredCount;
  const markedCount = markedIndices.length;

  // Font size classes calculation
  const questionTextClass =
    fontSize === 'small'
      ? 'text-xs sm:text-sm'
      : fontSize === 'large'
      ? 'text-base sm:text-lg'
      : 'text-sm sm:text-base';

  const stimulusTextClass =
    fontSize === 'small'
      ? 'text-xs leading-relaxed'
      : fontSize === 'large'
      ? 'text-sm sm:text-base leading-relaxed'
      : 'text-xs sm:text-sm leading-relaxed';

  const optionTextClass =
    fontSize === 'small'
      ? 'text-xs'
      : fontSize === 'large'
      ? 'text-sm sm:text-base'
      : 'text-xs sm:text-sm';

  return (
    <div className="min-h-screen flex flex-col bg-[#F0F5F2] select-none text-slate-900">
      <NetworkBanner />

      {/* 1. Kemendikdasmen CBT Main Header Bar (Dominan Hijau) */}
      <header className="bg-[#087443] text-white sticky top-0 z-30 shadow-md border-b border-emerald-900">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-3">
          
          {/* Left: App Identity */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
            <div className="flex items-center gap-1 bg-white p-0.5 rounded-full shadow-xs shrink-0">
              <img
                src={LOGO_KEMENAG_MOJOKERTO}
                alt="Logo Kemenag"
                className="w-7 h-7 sm:w-8 sm:h-8 object-contain"
              />
              <img
                src={LOGO_MGMP_PAI_MOJOKERTO}
                alt="Logo MGMP PAI"
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] text-emerald-200 font-bold uppercase tracking-wider block">
                CBT ONLINE • KEMENAG & MGMP PAI
              </span>
              <h1 className="text-xs sm:text-sm font-extrabold truncate uppercase tracking-tight text-white">
                OLIMPIADE PAI KAB. MOJOKERTO
              </h1>
            </div>
          </div>

          {/* Center: ANBK Ukuran Font Soal Switcher (A- | A | A+) */}
          <div className="hidden md:flex items-center gap-1.5 bg-[#054c2c] px-3 py-1.5 rounded-lg border border-emerald-800 text-xs">
            <span className="text-emerald-200 font-medium text-[11px] mr-1">
              Ukuran Font Soal:
            </span>
            <button
              onClick={() => setFontSize('small')}
              className={`w-7 h-7 rounded font-bold text-xs flex items-center justify-center transition cursor-pointer ${
                fontSize === 'small'
                  ? 'bg-amber-400 text-slate-950 font-black'
                  : 'bg-emerald-800/80 text-white hover:bg-emerald-700'
              }`}
              title="Font Kecil"
            >
              A-
            </button>
            <button
              onClick={() => setFontSize('medium')}
              className={`w-7 h-7 rounded font-bold text-xs flex items-center justify-center transition cursor-pointer ${
                fontSize === 'medium'
                  ? 'bg-amber-400 text-slate-950 font-black'
                  : 'bg-emerald-800/80 text-white hover:bg-emerald-700'
              }`}
              title="Font Sedang"
            >
              A
            </button>
            <button
              onClick={() => setFontSize('large')}
              className={`w-7 h-7 rounded font-bold text-xs flex items-center justify-center transition cursor-pointer ${
                fontSize === 'large'
                  ? 'bg-amber-400 text-slate-950 font-black'
                  : 'bg-emerald-800/80 text-white hover:bg-emerald-700'
              }`}
              title="Font Besar"
            >
              A+
            </button>
          </div>

          {/* Right: Sisa Waktu & Tombol Daftar Soal */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Sisa Waktu Box khas Kemendikdasmen ANBK */}
            <div
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg border font-mono font-black text-xs sm:text-sm tracking-tight ${
                isCritical
                  ? 'bg-rose-700 border-rose-400 text-white animate-pulse'
                  : isDanger
                  ? 'bg-rose-800 border-rose-500 text-white'
                  : isWarning
                  ? 'bg-amber-400 border-amber-300 text-slate-950 font-black'
                  : 'bg-[#054c2c] border-emerald-700 text-emerald-100'
              }`}
            >
              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <div className="flex flex-col leading-none">
                <span className="text-[9px] uppercase tracking-wider font-semibold opacity-85">
                  Sisa Waktu
                </span>
                <span className="tabular-nums text-xs sm:text-sm">{formattedTime}</span>
              </div>
            </div>

            {/* Tombol DAFTAR SOAL khas Kemendikdasmen */}
            <button
              onClick={() => setIsDaftarSoalOpen(true)}
              className="flex items-center gap-1.5 bg-[#054c2c] hover:bg-[#033720] border border-emerald-700 text-white px-3 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition cursor-pointer shadow-xs"
            >
              <LayoutGrid className="w-4 h-4 text-emerald-300" />
              <span>DAFTAR SOAL</span>
            </button>
          </div>

        </div>
      </header>

      {/* 2. Kemendikdasmen Subheader Bar */}
      <div className="bg-white border-b border-slate-300 px-4 sm:px-6 py-2 shadow-2xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs text-slate-700 font-medium">
          <div className="flex items-center gap-2 truncate">
            <span className="font-bold text-[#087443]">PESERTA:</span>
            <span className="font-mono font-bold text-slate-900">{participant.participantNumber}</span>
            <span>-</span>
            <span className="font-bold text-slate-900 truncate">{participant.name}</span>
            <span>({participant.schoolName})</span>
          </div>

          <div className="flex items-center gap-3 justify-between sm:justify-end text-[11px]">
            <span className="text-slate-500">
              Mata Pelajaran: <strong>Pendidikan Agama Islam</strong>
            </span>
            <div className="flex items-center gap-1 font-semibold text-emerald-800">
              {isSaving ? (
                <>
                  <RotateCw className="w-3 h-3 text-[#087443] animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 text-[#087443]" />
                  <span>Tersimpan ({lastSavedTime})</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Question Content Area */}
      <main className="flex-1 max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 w-full flex flex-col justify-between">
        
        {/* Kemendikdasmen Question Card Container */}
        <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden flex flex-col justify-between flex-1 min-h-[500px]">
          
          <div>
            {/* Header Soal Kemendikdasmen */}
            <div className="bg-[#087443] text-white px-5 py-3 flex items-center justify-between border-b border-emerald-900">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-black uppercase tracking-wider">
                  SOAL NOMOR: {currentIndex + 1}
                </span>
                <span className="text-emerald-200 text-xs font-semibold">/ {questions.length}</span>
              </div>

              <div className="flex items-center gap-2">
                {currentQuestion.type === 'PG' && (
                  <span className="text-[11px] font-extrabold uppercase tracking-wider bg-[#054c2c] text-emerald-100 px-2.5 py-0.5 rounded border border-emerald-700 flex items-center gap-1.5 shadow-2xs">
                    <CircleDot className="w-3.5 h-3.5 text-emerald-300" />
                    <span>PILIHAN GANDA</span>
                  </span>
                )}
                {currentQuestion.type === 'PGK' && (
                  <span className="text-[11px] font-extrabold uppercase tracking-wider bg-indigo-900 text-indigo-100 px-2.5 py-0.5 rounded border border-indigo-700 flex items-center gap-1.5 shadow-2xs">
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-300" />
                    <span>PG KOMPLEKS</span>
                  </span>
                )}
                {currentQuestion.type === 'BS' && (
                  <span className="text-[11px] font-extrabold uppercase tracking-wider bg-amber-900 text-amber-100 px-2.5 py-0.5 rounded border border-amber-700 flex items-center gap-1.5 shadow-2xs">
                    <ListChecks className="w-3.5 h-3.5 text-amber-300" />
                    <span>BENAR / SALAH</span>
                  </span>
                )}
                <span className="text-[11px] text-emerald-200 hidden sm:inline font-medium">
                  • {currentQuestion.subject}
                </span>
              </div>
            </div>

            {/* Question Body */}
            <div className="p-5 sm:p-8 space-y-5">
              
              {/* Stimulus wacana berbingkai khas ANBK */}
              {currentQuestion.stimulus && (
                <div className="bg-[#FAFDFB] border-2 border-emerald-900/15 rounded-lg p-4 sm:p-5 text-slate-800 shadow-2xs">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#087443] block mb-1.5 border-b border-emerald-900/10 pb-1">
                    STIMULUS BACAAN:
                  </span>
                  <div className={`whitespace-pre-line leading-relaxed font-normal ${stimulusTextClass}`}>
                    {currentQuestion.stimulus}
                  </div>
                </div>
              )}

              {/* Teks Pertanyaan */}
              <div className={`font-bold text-slate-900 leading-snug ${questionTextClass}`}>
                {currentQuestion.question}
              </div>

              {/* ========================================================================= */}
              {/* FORMAT 1: PILIHAN GANDA TUNGGAL (PG) */}
              {/* ========================================================================= */}
              {currentQuestion.type === 'PG' && (
                <div className="space-y-3 pt-1">
                  {/* Banner Petunjuk PG */}
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-950 font-semibold flex items-center justify-between gap-2 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <CircleDot className="w-4 h-4 text-[#087443] shrink-0" />
                      <span>
                        Pilihan Ganda: Pilihlah <strong>1 (satu) jawaban yang paling tepat</strong>. Klik lingkaran huruf opsi.
                      </span>
                    </div>
                    {currentAnswerList.length > 0 && (
                      <span className="text-[11px] font-mono font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-300 shrink-0">
                        Opsi {currentAnswerList[0]} Terpilih ✓
                      </span>
                    )}
                  </div>

                  {/* Daftar Opsi Bulat Radio */}
                  <div className="space-y-3 pt-1">
                    {resolvedOptions.map((opt) => {
                      const isSelected = currentAnswerList.includes(opt.id);

                      return (
                        <div
                          key={opt.id}
                          onClick={() => handleSelectOption(opt.id)}
                          className={`group flex items-start justify-between gap-3.5 p-3.5 sm:p-4 rounded-xl border-2 transition-all cursor-pointer ${
                            isSelected
                              ? 'border-[#087443] bg-[#EAF8F0] shadow-xs'
                              : 'border-slate-300 hover:border-emerald-600 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start gap-3.5 flex-1 min-w-0">
                            {/* Opsi Huruf: Lingkaran Radio Bulat */}
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs sm:text-sm shrink-0 border-2 transition-all ${
                                isSelected
                                  ? 'bg-[#087443] border-[#087443] text-white shadow-xs scale-105'
                                  : 'bg-white border-slate-400 text-slate-700 group-hover:border-[#087443] group-hover:bg-emerald-50/50'
                              }`}
                            >
                              {isSelected ? <Check className="w-4 h-4 stroke-[3]" /> : opt.id}
                            </div>

                            {/* Teks Opsi */}
                            <div
                              className={`flex-1 pt-1 leading-snug font-medium select-text ${
                                isSelected ? 'text-emerald-950 font-bold' : 'text-slate-800'
                              } ${optionTextClass}`}
                            >
                              {opt.text}
                            </div>
                          </div>

                          {isSelected && (
                            <span className="text-[11px] font-bold text-emerald-800 bg-white px-2.5 py-1 rounded-lg border border-emerald-300 shrink-0 self-center shadow-2xs">
                              Pilihan Anda ✓
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* FORMAT 2: PILIHAN GANDA KOMPLEKS (PGK) */}
              {/* ========================================================================= */}
              {currentQuestion.type === 'PGK' && (
                <div className="space-y-3 pt-1">
                  {/* Banner Petunjuk PGK */}
                  <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-950 font-semibold flex items-center justify-between gap-2 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="w-4 h-4 text-indigo-700 shrink-0" />
                      <span>
                        Pilihan Ganda Kompleks (PGK): Anda dapat memilih <strong>lebih dari satu jawaban yang benar</strong>. Beri tanda centang pada kotak opsi.
                      </span>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-indigo-900 bg-white px-2.5 py-0.5 rounded border border-indigo-300 shrink-0">
                      {currentAnswerList.length} Opsi Dicentang
                    </span>
                  </div>

                  {/* Daftar Opsi Kotak Checkbox Centang */}
                  <div className="space-y-3 pt-1">
                    {resolvedOptions.map((opt) => {
                      const isSelected = currentAnswerList.includes(opt.id);

                      return (
                        <div
                          key={opt.id}
                          onClick={() => handleSelectOption(opt.id)}
                          className={`group flex items-start justify-between gap-3.5 p-3.5 sm:p-4 rounded-xl border-2 transition-all cursor-pointer ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-50/70 shadow-xs'
                              : 'border-slate-300 hover:border-indigo-500 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start gap-3.5 flex-1 min-w-0">
                            {/* Opsi Huruf: Kotak Checkbox Centang */}
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs sm:text-sm shrink-0 border-2 transition-all ${
                                isSelected
                                  ? 'bg-indigo-700 border-indigo-700 text-white shadow-xs scale-105'
                                  : 'bg-white border-slate-400 text-slate-700 group-hover:border-indigo-600 group-hover:bg-indigo-50/50'
                              }`}
                            >
                              {isSelected ? <Check className="w-5 h-5 stroke-[3]" /> : opt.id}
                            </div>

                            {/* Teks Opsi */}
                            <div
                              className={`flex-1 pt-1 leading-snug font-medium select-text ${
                                isSelected ? 'text-indigo-950 font-bold' : 'text-slate-800'
                              } ${optionTextClass}`}
                            >
                              {opt.text}
                            </div>
                          </div>

                          {isSelected && (
                            <span className="text-[11px] font-bold text-indigo-800 bg-white px-2.5 py-1 rounded-lg border border-indigo-200 shrink-0 self-center shadow-2xs">
                              Dicentang ✓
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* FORMAT 3: BENAR / SALAH (BS) */}
              {/* ========================================================================= */}
              {currentQuestion.type === 'BS' && (
                <div className="space-y-3 pt-1">
                  {/* Banner Petunjuk BS */}
                  <div className="p-2.5 bg-amber-50/80 border border-amber-300 rounded-lg text-xs text-amber-950 font-semibold flex items-center justify-between gap-2 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <ListChecks className="w-4 h-4 text-amber-800 shrink-0" />
                      <span>
                        Soal Benar / Salah: Baca stimulus wacana di atas dengan cermat, kemudian tentukan apakah masing-masing butir pernyataan bernilai <strong>BENAR</strong> atau <strong>SALAH</strong>.
                      </span>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-amber-900 bg-white px-2.5 py-0.5 rounded border border-amber-300 shrink-0">
                      {currentAnswerList.length}/{resolvedStatements.length} Ditentukan
                    </span>
                  </div>

                  {/* Benar / Salah Interactive Table */}
                  <div className="border-2 border-slate-300 rounded-xl overflow-hidden shadow-xs mt-3 bg-white">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#087443] text-white text-xs uppercase tracking-wider font-bold">
                          <th className="py-3 px-3 sm:px-4 w-10 sm:w-12 text-center border-r border-emerald-800">No</th>
                          <th className="py-3 px-3 sm:px-4">Pernyataan Analisis Berdasarkan Wacana</th>
                          <th className="py-3 px-3 sm:px-4 w-40 sm:w-48 text-center border-l border-emerald-800">Pilihan Jawaban</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-xs sm:text-sm bg-white">
                        {resolvedStatements.map((stmt, idx) => {
                          const isBenar = currentAnswerList.includes(`${stmt.id}:BENAR`);
                          const isSalah = currentAnswerList.includes(`${stmt.id}:SALAH`);

                          return (
                            <tr key={stmt.id} className="hover:bg-slate-50 transition-colors">
                              <td className="py-3.5 px-3 sm:px-4 font-bold text-slate-500 text-center border-r border-slate-200">
                                {idx + 1}
                              </td>
                              <td className="py-3.5 px-3 sm:px-4 text-slate-800 font-medium leading-relaxed select-text">
                                {stmt.text}
                              </td>
                              <td className="py-3.5 px-3 sm:px-4 border-l border-slate-200">
                                <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleSelectStatementChoice(stmt.id, 'BENAR')}
                                    className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-black transition flex items-center gap-1 cursor-pointer ${
                                      isBenar
                                        ? 'bg-[#087443] text-white shadow-xs ring-2 ring-emerald-500 ring-offset-1'
                                        : 'bg-white border border-slate-300 text-slate-700 hover:border-emerald-600 hover:text-emerald-800'
                                    }`}
                                  >
                                    {isBenar && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                    <span>BENAR</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleSelectStatementChoice(stmt.id, 'SALAH')}
                                    className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-black transition flex items-center gap-1 cursor-pointer ${
                                      isSalah
                                        ? 'bg-rose-700 text-white shadow-xs ring-2 ring-rose-400 ring-offset-1'
                                        : 'bg-white border border-slate-300 text-slate-700 hover:border-rose-600 hover:text-rose-800'
                                    }`}
                                  >
                                    {isSalah && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                    <span>SALAH</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* 4. Bottom Navigation Bar Khas Kemendikdasmen ANBK */}
          <div className="bg-[#FAFDFB] border-t-2 border-slate-200 px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            
            {/* Kiri: Tombol Soal Sebelumnya */}
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className={`w-full sm:w-auto px-5 py-2.5 rounded-lg border font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer ${
                currentIndex === 0
                  ? 'opacity-40 bg-slate-100 text-slate-400 border-slate-300 cursor-not-allowed'
                  : 'bg-[#087443] hover:bg-[#065b34] text-white border-emerald-900 shadow-xs'
              }`}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>SOAL SEBELUMNYA</span>
            </button>

            {/* Tengah: Tombol Ragu-ragu Kuning Terang Khas ANBK */}
            <button
              onClick={handleToggleMark}
              className={`w-full sm:w-auto px-6 py-2.5 rounded-lg border-2 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shadow-xs ${
                isCurrentMarked
                  ? 'bg-amber-400 hover:bg-amber-500 border-amber-600 text-slate-950'
                  : 'bg-amber-100 hover:bg-amber-200 border-amber-400 text-amber-950'
              }`}
            >
              <input
                type="checkbox"
                checked={isCurrentMarked}
                onChange={() => {}}
                className="w-4 h-4 rounded text-amber-600 pointer-events-none"
              />
              <span>RAGU - RAGU</span>
            </button>

            {/* Kanan: Tombol Soal Berikutnya / Selesai */}
            {currentIndex < questions.length - 1 ? (
              <button
                onClick={handleNext}
                className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-[#087443] hover:bg-[#065b34] text-white border border-emerald-900 font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
              >
                <span>SOAL BERIKUTNYA</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => setShowReviewModal(true)}
                className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-amber-300 border border-emerald-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
              >
                <span>SELESAI / PERIKSA</span>
                <Check className="w-4 h-4" />
              </button>
            )}

          </div>

        </div>

      </main>

      {/* 5. MODAL POP-UP "DAFTAR SOAL" KHAS KEMENDIKDASMEN ANBK */}
      {isDaftarSoalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl border-2 border-emerald-900 max-h-[90vh] flex flex-col justify-between">
            
            {/* Modal Header */}
            <div>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#087443] text-white flex items-center justify-center font-bold">
                    <LayoutGrid className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 tracking-wide uppercase">
                      DAFTAR NOMOR SOAL
                    </h3>
                    <p className="text-xs text-slate-500">
                      Klik nomor soal untuk berpindah navigasi secara cepat
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsDaftarSoalOpen(false)}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                  title="Tutup Daftar Soal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status Legend Strip khas ANBK */}
              <div className="flex flex-wrap items-center gap-4 text-xs font-semibold mb-4 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-[#087443] text-white font-bold text-[10px] flex items-center justify-center">
                    1 [A]
                  </div>
                  <span className="text-slate-700">Sudah Dijawab ({answeredCount})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-amber-400 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                    2 [?]
                  </div>
                  <span className="text-slate-700">Ragu - Ragu ({markedCount})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-white border border-slate-300 text-slate-700 font-bold text-[10px] flex items-center justify-center">
                    3
                  </div>
                  <span className="text-slate-700">Belum Dijawab ({unansweredCount})</span>
                </div>
              </div>

              {/* Number Grid 1..N */}
              <div className="overflow-y-auto max-h-[50vh] p-1">
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                  {questions.map((q, idx) => {
                    const ansList = answers[q.id] || [];
                    const isAnswered = ansList.length > 0;
                    const isMarked = markedIndices.includes(idx);
                    const isCurrent = idx === currentIndex;

                    let bgClass = 'bg-white border-slate-300 text-slate-700 hover:border-emerald-600';
                    if (isMarked) {
                      bgClass = 'bg-amber-400 border-amber-500 text-slate-950 font-black';
                    } else if (isAnswered) {
                      bgClass = 'bg-[#087443] border-[#065b34] text-white font-bold';
                    }

                    // Format answer label cleanly according to question type
                    let answerLabel = '';
                    if (isAnswered) {
                      if (q.type === 'BS') {
                        answerLabel = `BS (${ansList.length})`;
                      } else if (q.type === 'PGK') {
                        answerLabel = ansList.join(',');
                      } else {
                        answerLabel = ansList[0] || '';
                      }
                    }

                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => handleGoToQuestion(idx)}
                        className={`h-12 rounded-lg border-2 flex flex-col items-center justify-center text-xs transition cursor-pointer relative ${bgClass} ${
                          isCurrent ? 'ring-2 ring-emerald-500 ring-offset-2' : ''
                        }`}
                      >
                        <div className="flex items-center gap-1 leading-none">
                          <span className="font-bold text-[11px]">{idx + 1}</span>
                          <span className={`text-[8px] font-black uppercase px-1 rounded ${
                            isMarked
                              ? 'bg-amber-500/80 text-slate-950'
                              : isAnswered
                              ? 'bg-emerald-900/60 text-emerald-200'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {q.type}
                          </span>
                        </div>
                        {isAnswered && (
                          <span
                            className={`text-[9px] font-mono leading-none mt-1 truncate max-w-[95%] font-extrabold ${
                              isMarked ? 'text-slate-950' : 'text-emerald-100'
                            }`}
                          >
                            {answerLabel}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">
                Total {questions.length} Butir Soal CBT
              </span>
              <button
                type="button"
                onClick={() => setIsDaftarSoalOpen(false)}
                className="py-2 px-5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                TUTUP DAFTAR SOAL
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 6. MODAL KONFIRMASI AKHIR UJIAN (REVIEW & SUBMIT) */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-slate-300">
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full bg-[#EAF8F0] border-2 border-emerald-300 flex items-center justify-center mx-auto mb-2 text-[#087443]">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-wide">
                KONFIRMASI SELESAI UJIAN
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pastikan seluruh jawaban Anda telah diperiksa sebelum mengakhiri sesi ujian
              </p>
            </div>

            {/* Summary statistics */}
            <div className="grid grid-cols-3 gap-2.5 mb-5 text-center text-xs">
              <div className="bg-[#EAF8F0] p-3 rounded-lg border border-emerald-200">
                <span className="text-[10px] text-emerald-800 block font-bold uppercase">Sudah Dijawab</span>
                <span className="text-xl font-black text-[#087443] font-mono">{answeredCount}</span>
              </div>
              <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                <span className="text-[10px] text-amber-800 block font-bold uppercase">Ragu - Ragu</span>
                <span className="text-xl font-black text-amber-700 font-mono">{markedCount}</span>
              </div>
              <div className="bg-rose-50 p-3 rounded-lg border border-rose-200">
                <span className="text-[10px] text-rose-800 block font-bold uppercase">Belum Dijawab</span>
                <span className="text-xl font-black text-rose-700 font-mono">{unansweredCount}</span>
              </div>
            </div>

            {/* Warning if any blank / marked */}
            {(unansweredCount > 0 || markedCount > 0) && (
              <div className="mb-5 p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span className="leading-snug">
                  Masih terdapat <strong>{unansweredCount} butir belum dijawab</strong> dan{' '}
                  <strong>{markedCount} butir ragu-ragu</strong>. Anda masih memiliki sisa waktu untuk melengkapi.
                </span>
              </div>
            )}

            <p className="text-xs text-slate-600 mb-6 leading-relaxed text-center">
              Apakah Anda yakin ingin menyelesaikan dan mengirimkan seluruh lembar jawaban ujian CBT ini? Setelah dikirim, jawaban tidak dapat diubah kembali.
            </p>

            <div className="flex flex-col sm:flex-row gap-2.5 justify-end">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="py-2.5 px-4 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs uppercase cursor-pointer"
              >
                KEMBALI KE UJIAN
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleFinalSubmit('completed')}
                className="py-2.5 px-6 rounded-lg bg-[#087443] hover:bg-[#065b34] text-white font-black text-xs uppercase tracking-wider shadow-sm transition disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? 'MENYIMPAN...' : 'YA, AKHIRI UJIAN'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Anti-Cheat Integrity Strike Modal */}
      <ViolationModal
        isOpen={violationModal.isOpen}
        strikeNumber={violationModal.strikeNumber}
        message={violationModal.message}
        isTerminated={violationModal.isTerminated}
        onAcknowledge={() => {
          setViolationModal((prev) => ({ ...prev, isOpen: false }));
          requestFullscreen();
        }}
      />
    </div>
  );
};
