import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearToken, getToken, getUserFromToken } from "../helpers/authClient";
import { useToast } from "./ToastProvider";
import { ModeSelector } from "./ModeSelector";
import { LoadingIndicator } from "./LoadingIndicator";

export const LandingPage = () => {
  const [level, setLevel] = useState("A1");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const isAdmin = userRole === "admin";

  useEffect(() => {
    const token = getToken();
    if (!token) {
      navigate("/signin");
      return;
    }
    const user = getUserFromToken();
    if (user) {
      setUserEmail(user.email);
      setUserRole(user.role);
    }
  }, [navigate]);

  const isSubmitDisabled = useMemo(() => loading, [loading]);

  const generateViaBackend = async (levelValue: string) => {
    const token = getToken();
    const res = await fetch("/api/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        query: `
          mutation GenerateStudyContent($level: String!) {
            generateStudyContent(level: $level)
          }
        `,
        variables: { level: levelValue },
      }),
    });

    if (!res.ok) throw new Error(`Backend request failed (${res.status})`);
    const json = (await res.json()) as {
      data?: { generateStudyContent?: string };
      errors?: { message: string }[];
    };
    if (json.errors?.length)
      throw new Error(json.errors.map((e) => e.message).join("; "));
    if (!json.data?.generateStudyContent)
      throw new Error("No content returned.");
    return json.data.generateStudyContent;
  };

  const handleSubmit = async () => {
    const token = getToken();
    if (!token) {
      showToast("Please sign in as admin to generate content.", "error");
      navigate("/signin");
      return;
    }
    if (!isAdmin) {
      showToast(
        "Only admins can generate content. Please contact an admin.",
        "error"
      );
      return;
    }
    setLoading(true);
    setError(null);

    try {
      await generateViaBackend(level);
      showToast("Generation request succeeded.");
      setError(null);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Something went wrong. Please try again."
      );
      showToast(
        submitError instanceof Error
          ? submitError.message
          : "We couldn't generate content. Please retry.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const AuthHeader = (
    <header className="mx-auto max-w-4xl space-y-3 text-center">
      <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
        German Practice
      </p>
      <h1 className="mt-2 text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
        Build your next study session in seconds.
      </h1>
      <p className="mt-3 text-lg text-slate-600">
        Generate paragraph-based reading exercises with embedded questions and
        vocabulary.
      </p>
      {userEmail ? (
        <div className="mt-2 flex items-center justify-center gap-3 text-sm text-slate-700">
          <span>
            Signed in as <span className="font-semibold">{userEmail}</span>{" "}
            {userRole ? `(${userRole})` : ""}
          </span>
          <button
            type="button"
            onClick={() => {
              clearToken();
              navigate("/signin");
            }}
            className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Sign out
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-3">
          <Link
            to="/signin"
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Sign in
          </Link>
        </div>
      )}
    </header>
  );

  const AdminSection = (
    <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
      <div className="space-y-6 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
        <ModeSelector />

        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Level
            </p>
            <p className="text-lg text-slate-700">
              Choose a CEFR level. We will generate varied themes with questions
              and key words.
            </p>
            <div className="w-full max-w-2xs">
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                disabled={loading}
              >
                {["A1", "A2", "B1", "B2", "C1", "C2"].map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
              Mode: Reading
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Submission</p>
            {loading ? (
              <LoadingIndicator label="Generating" />
            ) : error ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                {error}
              </span>
            ) : (
              <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
                Ready
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitDisabled || !isAdmin}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? "Generating..." : "Generate paragraphs"}
            </button>
            <Link
              to="/exercise"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              Go to exercises →
            </Link>
          </div>
          <p className="text-xs text-slate-600">
            {isAdmin
              ? "On submit we call the backend generator and acknowledge success."
              : "Sign in with an admin account to generate new content."}
          </p>
        </div>
      </div>
    </section>
  );

  const UserSection = (
    <section className="mx-auto max-w-4xl space-y-6 text-center">
      <h2 className="text-3xl font-semibold text-slate-900">
        Practice smarter, daily.
      </h2>
      <p className="text-lg text-slate-600">
        This app helps you read, answer comprehension questions, and review key
        vocabulary from generated paragraphs.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          to="/exercise"
          className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Go to exercises →
        </Link>
        <Link
          to="/signin"
          className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Switch account
        </Link>
      </div>
    </section>
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-sky-50">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute left-20 top-10 h-52 w-52 rounded-full bg-emerald-200 blur-3xl" />
        <div className="absolute bottom-0 right-8 h-64 w-64 rounded-full bg-sky-200 blur-3xl" />
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        {AuthHeader}
        {isAdmin ? AdminSection : UserSection}
      </div>
    </main>
  );
};
