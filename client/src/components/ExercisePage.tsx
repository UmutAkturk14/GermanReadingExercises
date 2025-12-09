import { useEffect, useMemo, useState } from "react";
import { fetchParagraphs } from "../helpers/mockDb";
import type { NormalizedContent, NormalizedParagraph } from "../types/content";
import { LoadingIndicator } from "./LoadingIndicator";
import { ModeSelector } from "./ModeSelector";
import { useToast } from "./ToastProvider";
import { getToken } from "../helpers/authClient";

type FlatParagraph = NormalizedParagraph & { questionCount: number };

export const ExercisePage = () => {
  const [content, setContent] = useState<NormalizedContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [openWordIds, setOpenWordIds] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [dictionary, setDictionary] = useState<
    Array<{ term: string; translation: string; ts: number }>
  >([]);
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());
  const { showToast } = useToast();

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchParagraphs(
          levelFilter === "all" ? undefined : levelFilter
        );
        setContent(data);
        setActiveIndex(0);
        setSubmitted(false);
        setSelections({});
        setOpenWordIds(new Set());
        if (typeof window !== "undefined") {
          try {
            const raw = window.localStorage.getItem("gp_dictionary");
            const parsed = raw ? JSON.parse(raw) : [];
            if (Array.isArray(parsed)) {
              setDictionary(parsed);
            } else {
              setDictionary([]);
            }
          } catch {
            setDictionary([]);
          }
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load paragraphs.";
        setError(message);
        showToast(message, "error");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [showToast, levelFilter]);

  const paragraphs = useMemo<FlatParagraph[]>(() => {
    if (!content) return [];
    return content.paragraphs.map((p) => ({
      ...p,
      questionCount: p.questions.length,
    }));
  }, [content]);

  const isFinished =
    paragraphs.length > 0 &&
    (activeIndex >= paragraphs.length ||
      (activeIndex === paragraphs.length - 1 && submitted));
  const current = !isFinished ? paragraphs[activeIndex] : undefined;
  const dictionaryList = [...dictionary].sort((a, b) => b.ts - a.ts);
  const toggleCard = (key: string) => {
    setFlippedCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const removeDictionaryEntry = (key: string) => {
    setDictionary((prev) => {
      const next = prev.filter((entry) => `${entry.term}-${entry.ts}` !== key);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem("gp_dictionary", JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
    setFlippedCards((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const toggleWord = (id: string) => {
    setOpenWordIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleNext = () => {
    setSubmitted(false);
    setOpenWordIds(new Set());
    setSelections({});
    setActiveIndex((prev) => (prev + 1 < paragraphs.length ? prev + 1 : prev));
    setSelectedText(null);
    setTranslation(null);
    setTranslating(false);
    setFlippedCards(new Set());
  };

  const handleSubmit = () => {
    if (!current) return;
    const unanswered = current.questions.filter(
      (q, idx) => !selections[q.id ?? `${current.id}-q-${idx}`]
    );
    if (unanswered.length > 0) {
      showToast("Answer all questions before submitting.", "error");
      return;
    }
    setSubmitted(true);
  };

  const handleSelection = () => {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : "";
    if (text) {
      setSelectedText(text);
      setTranslation(null);
    } else {
      setSelectedText(null);
      setTranslation(null);
    }
  };

  const requestTranslation = async () => {
    if (!selectedText) return;
    setTranslating(true);
    setTranslation(null);

    const persistDictionary = (word: string, translated: string) => {
      if (typeof window === "undefined") return;
      let entries: Array<{ term: string; translation: string; ts: number }> =
        [];
      try {
        const raw = window.localStorage.getItem("gp_dictionary");
        const parsed = raw ? JSON.parse(raw) : [];
        entries = Array.isArray(parsed) ? parsed : [];
      } catch {
        entries = [];
      }
      const next = [
        ...entries,
        { term: word, translation: translated, ts: Date.now() },
      ];
      try {
        window.localStorage.setItem(
          "gp_dictionary",
          JSON.stringify(next.slice(-100))
        );
      } catch (error) {
        console.error("Failed to persist dictionary", error);
      }
    };

    try {
      const token = getToken();
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text: selectedText, target_lang: "EN" }),
      });
      if (!res.ok) {
        throw new Error(`Translation failed (${res.status})`);
      }
      const json = (await res.json()) as { text?: string };
      const translated = json.text ?? "";
      setTranslation(translated);
      persistDictionary(selectedText, translated);
      setDictionary((prev) => {
        const next = [...prev, { term: selectedText, translation: translated, ts: Date.now() }];
        return next.slice(-100);
      });
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : "Translation failed. Please try again.",
        "error"
      );
    } finally {
      setTranslating(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-sky-50 via-white to-emerald-50">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute left-16 top-8 h-52 w-52 rounded-full bg-sky-200 blur-3xl" />
        <div className="absolute bottom-0 right-10 h-64 w-64 rounded-full bg-emerald-200 blur-3xl" />
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <header className="flex flex-col gap-4 text-center">
          <div className="flex items-center justify-center">
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              ← Back to home
            </a>
          </div>

          <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
            Practice reading exercises
          </h1>
          <p className="text-slate-600">
            Mode: Reading. Answer all questions for a paragraph, then move on.
          </p>
        </header>

        <section className="grid gap-8 lg:grid-cols-[0.32fr_0.68fr]">
          <div className="space-y-6 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
            <ModeSelector />
            {loading ? <LoadingIndicator label="Loading" /> : null}
            {error ? (
              <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-800">
                {error}
              </p>
            ) : null}
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Level
              </p>
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                disabled={loading}
              >
                <option value="all">All</option>
                {["A1", "A2", "B1", "B2", "C1", "C2"].map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </div>
            {!loading && !error && paragraphs.length > 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Progress</p>
                <p>
                  Paragraph {Math.min(activeIndex + 1, paragraphs.length)} of{" "}
                  {paragraphs.length}
                </p>
              </div>
            ) : null}

            {current && current.importantWords.length > 0 ? (
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Important Words
                </p>
                <div className="space-y-2">
                  {current.importantWords.map((w) => {
                    const isOpen = openWordIds.has(w.id);
                    return (
                      <div
                        key={w.id}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"
                      >
                        <button
                          type="button"
                          onClick={() => toggleWord(w.id)}
                          className="flex w-full items-center justify-between text-left text-sm font-semibold text-slate-900"
                        >
                          <span>{w.term}</span>
                          <span className="text-xs text-slate-500">
                            {isOpen ? "Hide meaning" : "Show meaning"}
                          </span>
                        </button>
                        {isOpen ? (
                          <div className="mt-2 space-y-1 text-sm text-slate-700">
                            <p>Meaning: {w.meaning}</p>
                            <p className="text-slate-600">
                              Usage: {w.usageSentence}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            {loading ? (
              <LoadingIndicator label="Loading paragraphs" />
            ) : error ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-800">
                {error}
              </div>
            ) : paragraphs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-5 py-6 text-center text-sm text-slate-500">
                No questions to practice yet.
              </div>
            ) : isFinished ? (
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-5 py-6 text-center text-sm text-slate-700">
                <p className="text-lg font-semibold text-slate-900">
                  All paragraphs completed!
                </p>
                <p className="mt-2 text-slate-600">
                  Great job. Refresh to practice again.
                </p>
              </div>
            ) : (
              current && (
                <article className="space-y-5 rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-lg">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        {current.level ?? "A1"} · {current.theme ?? "General"}
                      </p>
                      <h3 className="text-xl font-semibold text-slate-900">
                        {current.title || current.topic || "Reading"}
                      </h3>
                      {current.topic ? (
                        <p className="text-sm text-slate-600">
                          Topic: {current.topic}
                        </p>
                      ) : null}
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      ~{current.content.split(/\s+/).filter(Boolean).length}{" "}
                      words
                    </span>
                  </div>

                  <div
                    className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 text-slate-800 shadow-inner space-y-3"
                    onMouseUp={handleSelection}
                  >
                    {current.content
                      .split(/\n+/)
                      .map((para, idx) => para.trim())
                      .filter(Boolean)
                      .map((para, idx) => (
                        <p
                          key={`${current.id}-p-${idx}`}
                          className="leading-relaxed"
                        >
                          {para}
                        </p>
                      ))}
                  </div>
                  {selectedText ? (
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm">
                      <div className="flex items-center gap-3">
                        <span className="truncate">
                          Selected:{" "}
                          <span className="font-semibold">
                            "{selectedText}"
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={requestTranslation}
                          disabled={translating}
                          className="inline-flex items-center justify-center rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-60"
                        >
                          {translating ? "Looking..." : "Ask the AI"}
                        </button>
                      </div>
                      {translation ? (
                        <p className="text-slate-700">
                          Translation:{" "}
                          <span className="font-semibold">{translation}</span>
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {current.questions.length > 0 ? (
                    <div className="space-y-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Questions (all for this paragraph)
                      </p>
                      {current.questions.map((q, idx) => {
                        const choices =
                          Array.isArray(q.choices) && q.choices.length > 0
                            ? q.choices
                            : [q.answer];
                        const selected =
                          selections[q.id ?? `${current.id}-q-${idx}`] ?? "";
                        return (
                          <div
                            key={q.id ?? `${current.id}-q-${idx}`}
                            className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm"
                          >
                            <p className="text-sm font-semibold text-slate-900">
                              {q.question}
                            </p>
                            <div className="space-y-2">
                              {choices.map((choice, cIdx) => (
                                <label
                                  key={`${q.id ?? idx}-choice-${cIdx}`}
                                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 transition hover:-translate-y-0.5 hover:shadow-sm"
                                >
                                  <input
                                    type="radio"
                                    name={`q-${current.id}-${idx}`}
                                    className="accent-slate-900"
                                    checked={choice === selected}
                                    onChange={() => {
                                      if (submitted) return;
                                      setSelections((prev) => ({
                                        ...prev,
                                        [q.id ?? `${current.id}-q-${idx}`]:
                                          choice,
                                      }));
                                    }}
                                    disabled={submitted}
                                  />
                                  <span className="text-xs font-semibold text-slate-500">
                                    {String.fromCharCode(65 + cIdx)}.
                                  </span>
                                  <span>{choice}</span>
                                </label>
                              ))}
                            </div>
                            {submitted ? (
                              <p
                                className={[
                                  "text-xs font-semibold",
                                  selected === q.answer
                                    ? "text-emerald-700"
                                    : "text-amber-700",
                                ].join(" ")}
                              >
                                {selected === q.answer
                                  ? "Correct"
                                  : `Correct answer: ${q.answer}`}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={submitted}
                      className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
                    >
                      Submit answers
                    </button>
                    <button
                      type="button"
                      onClick={handleNext}
                      disabled={
                        !submitted || activeIndex >= paragraphs.length - 1
                      }
                      className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
                    >
                      Next paragraph →
                    </button>
                    <p className="text-xs text-slate-600">
                      {submitted
                        ? "Review the answers above, then continue."
                        : "Select answers for all questions, then submit to reveal correctness."}
                    </p>
                  </div>
                </article>
              )
            )}
          </div>
        </section>

        {dictionaryList.length > 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Dictionary (recent)
            </p>
            <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
              {dictionaryList.map((entry) => {
                const key = `${entry.term}-${entry.ts}`;
                const flipped = flippedCards.has(key);
                return (
                  <div key={key} className="group perspective h-24 w-full max-w-[180px] justify-self-center">
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => removeDictionaryEntry(key)}
                        className="text-xs font-semibold text-slate-500 transition hover:text-slate-900"
                      >
                        ×
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleCard(key)}
                      className="block h-20 w-full"
                    >
                      <div
                        className={[
                          "relative h-full w-full rounded-xl border border-slate-200 shadow-sm transition-transform duration-500 [transform-style:preserve-3d]",
                          flipped ? "[transform:rotateY(180deg)]" : "",
                        ].join(" ")}
                      >
                        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white px-2 py-2 text-center text-slate-900 text-sm [backface-visibility:hidden]">
                          <span className="font-semibold leading-snug">{entry.term}</span>
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-900 px-2 py-2 text-center text-slate-50 text-xs [transform:rotateY(180deg)] [backface-visibility:hidden]">
                          <span className="leading-snug">{entry.translation}</span>
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
};
