import type { NormalizedContent } from "../types/content";

type ResultPreviewProps = {
  data: NormalizedContent | null;
  rawJson?: string;
};

export const ResultPreview = ({ data, rawJson }: ResultPreviewProps) => {
  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-5 py-4 text-sm text-slate-500">
        Generated content will appear here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
              Prepared Paragraphs
            </p>
            <h4 className="text-lg font-semibold text-slate-900">
              {data.paragraphs.length} paragraphs for "{data.theme}"
            </h4>
          </div>
          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white">
            {data.mode}
          </span>
        </div>
        <div className="mt-4 space-y-4">
          {data.paragraphs.map((p) => (
            <div
              key={p.id}
              className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-800"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    {p.level ?? "A1"} · {p.theme ?? "General"}
                  </p>
                  <p className="font-semibold text-slate-900">
                    {p.title || p.topic || "Paragraph"}
                  </p>
                </div>
                {p.topic ? (
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {p.topic}
                  </span>
                ) : null}
              </div>
              <p className="whitespace-pre-line text-slate-700">{p.content}</p>
              {p.questions.length > 0 ? (
                <div className="rounded-lg bg-white/80 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Questions
                  </p>
                  <ul className="mt-2 space-y-2">
                    {p.questions.map((q) => (
                      <li key={q.id}>
                        <p className="font-semibold text-slate-900">{q.question}</p>
                        <p className="text-slate-700">Answer: {q.answer}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {p.importantWords.length > 0 ? (
                <div className="rounded-lg bg-white/80 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Important Words
                  </p>
                  <ul className="mt-2 space-y-2">
                    {p.importantWords.map((w) => (
                      <li key={w.id} className="flex flex-col">
                        <span className="font-semibold text-slate-900">{w.term}</span>
                        <span className="text-slate-700">Meaning: {w.meaning}</span>
                        <span className="text-slate-600">Usage: {w.usageSentence}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {rawJson ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-xs text-slate-50 shadow-inner">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">
            Raw mock JSON
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap">{rawJson}</pre>
        </div>
      ) : null}
    </div>
  );
};
