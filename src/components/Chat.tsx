"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { ChartRenderer, parseChartSpecFromMarkdown } from "@/components/chart/ChartRenderer";
import type { ChartSpec } from "@/components/chart/ChartRenderer";
import { NavIcon } from "@/components/navigation/NavIcon";
import { BarChart3, CalendarRange, Compass, Layers, Settings, Sparkle } from "lucide-react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type MessageItemProps = {
  role: "user" | "assistant";
  content: string;
};

const quickPrompts: { title: string; prompt: string }[] = [
  {
    title: "Enrollment trend overview",
    prompt: "Chart Medicare Advantage enrollment by month for the past year and summarize key inflection points.",
  },
  {
    title: "Coverage gap analysis",
    prompt: "Break down plan availability by county, highlight underserved regions, and return a bar chart of coverage gaps.",
  },
  {
    title: "Plan performance comparison",
    prompt: "Compare CMS star ratings across leading Medicare Advantage plans and visualize the distribution by carrier.",
  },
];

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const showPlaceholder = messages.length === 0 && !isLoading;
  const latestAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") {
        return messages[i];
      }
    }
    return null;
  }, [messages]);

  const latestInsight = useMemo(() => {
    if (!latestAssistant) return null;
    const chartSpec = parseChartSpecFromMarkdown(latestAssistant.content || "");
    const summaryText = latestAssistant.content
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\n{2,}/g, "\n")
      .trim();

    const summaryLines = summaryText
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^\s*\|/.test(line));

    const metricCandidates = summaryLines
      .filter((line) => /\d/.test(line))
      .slice(0, 4)
      .map((line) => {
        const [label, value] = line.split(/:\s*/);
        if (value) {
          return { label, value };
        }
        const parts = line.split(/(\$?[0-9,.]+\s?%?)/).filter(Boolean);
        if (parts.length >= 2) {
          return { label: parts[0].trim(), value: parts[1].trim() };
        }
        return { label: line, value: "" };
      });

    const highlights = summaryLines
      .filter((line) => line.length > 20 && !/^[-*\u2022]/.test(line))
      .slice(0, 4);

    const conciseSummary = summaryLines.slice(0, 6).join("\n");

    return {
      chartSpec,
      summary: conciseSummary,
      highlights,
      metrics: metricCandidates,
    };
  }, [latestAssistant]);
  const hasChart = Boolean(latestInsight?.chartSpec);

  return (
    <div className="min-h-screen w-full overflow-hidden bg-[#050505] text-slate-100">
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-white/5 bg-[#050505] px-12 py-6">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#080808] text-sm font-semibold">
              AI
            </div>
            <div>
              <p className="text-[0.6rem] uppercase tracking-[0.55em] text-slate-500">Workspace</p>
              <h1 className="text-2xl font-semibold text-slate-100">Program Insight Studio</h1>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="hidden rounded-full border border-white/5 px-3 py-1 lg:block">
              Synced 2m ago
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-[#0a0a0a] text-slate-400">
              <Sparkle className="h-4 w-4 text-slate-300" />
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <aside className="hidden w-20 flex-col items-center gap-6 border-r border-white/5 bg-[#050505] pt-10 xl:flex">
            <NavIcon icon={Compass} label="Home" href="/" active />
            <NavIcon icon={BarChart3} label="Analytics" href="/data" />
            <NavIcon icon={Layers} label="Segments" />
            <NavIcon icon={CalendarRange} label="Timeline" />
            <NavIcon icon={Settings} label="Settings" />
          </aside>
          <section className={`flex flex-1 flex-col bg-[#080808] ${hasChart ? "border-r border-white/5" : ""}`}>
            <div className="flex items-center justify-between border-b border-white/5 px-12 py-8">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Scenario</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-100">Medicare Advantage</h2>
              </div>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-white/5 bg-[#0d0d0d] px-5 py-2 text-xs font-medium text-slate-200 transition hover:border-sky-500/60 hover:text-white"
                onClick={() => setInput("Analyze Medicare Advantage programs")}
              >
                Analyze Medicare Advantage programs
                <Sparkle className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-12 py-6">
              <div className="flex flex-col gap-6">
                {showPlaceholder ? (
                  <div className="max-w-2xl space-y-5 text-sm text-slate-300">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-100">Analyzing CMS Program Data</h3>
                      <p className="mt-4 max-w-2xl leading-relaxed text-slate-400">
                        This workspace reviews Medicare Advantage enrollment trends, plan availability, and star ratings to surface concise insights with natural-language explanations and presentation-ready charts.
                      </p>
                    </div>
                    <div className="space-y-3 text-slate-500">
                      <p>1. Reviewing historical enrollment, premium benchmarks, and demographic shifts.</p>
                      <p>2. Highlighting market gaps, supplemental benefits, and network adequacy indicators.</p>
                      <p>3. Summarizing plan performance with actionable notes for Medicare Advantage stakeholders.</p>
                    </div>
                  </div>
                ) : null}
                {messages.map((m) => (
                  <MessageItem key={m.id} role={m.role} content={m.content} />
                ))}
                {isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <span className="h-2 w-2 animate-ping rounded-full bg-sky-400" />
                    Processing request…
                  </div>
                ) : null}
                {error ? (
                  <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {error}
                  </div>
                ) : null}
                <div ref={bottomRef} />
              </div>
            </div>

            <div className="border-t border-white/5 bg-[#050505] px-12 py-4">
              <div className="flex flex-wrap gap-3 pb-4">
                {quickPrompts.map(({ title, prompt }) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className="rounded-full border border-white/10 bg-transparent px-4 py-2 text-xs text-slate-400 transition hover:border-white/40 hover:text-slate-100"
                  >
                    {title}
                  </button>
                ))}
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const trimmed = input.trim();
                  if (!trimmed || isLoading) return;
                  const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
                  const nextMessages = [...messages, userMessage];
                  setMessages(nextMessages);
                  setInput("");
                  setIsLoading(true);
                  setError(null);
                  try {
                    const resp = await fetch("/api/chat", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ messages: nextMessages.map(({ role, content }) => ({ role, content })) }),
                    });
                    if (!resp.ok) {
                      throw new Error(await resp.text());
                    }
                    const data = await resp.json();
                    const assistant = data.message as { role: "assistant"; content: string };
                    setMessages((prev) => [
                      ...prev,
                      { id: crypto.randomUUID(), role: assistant.role, content: assistant.content },
                    ]);
                  } catch (err: unknown) {
                    const message =
                      err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
                    setError(String(message));
                  } finally {
                    setIsLoading(false);
                  }
                }}
                className="flex flex-col gap-3 md:flex-row md:items-center"
              >
                <div className="flex flex-1 items-center gap-3 rounded-2xl border border-white/5 bg-[#0e0e0e] px-5 py-3 text-sm text-slate-100 transition focus-within:border-sky-400/50">
                  <input
                    className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
                    placeholder="Ask anything about Medicare Advantage data…"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    aria-label="Chat prompt"
                  />
                  {isLoading ? (
                    <span className="h-3 w-3 animate-spin rounded-full border border-white/40 border-t-transparent" aria-hidden />
                  ) : null}
                </div>
                <button
                  type="submit"
                  className="group flex items-center gap-2 rounded-2xl bg-[#146fb0] px-6 py-3 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoading}
                >
                  Send
                  <span className="transition group-hover:translate-x-0.5">↗</span>
                </button>
              </form>
            </div>
          </section>

          {hasChart ? (
            <section className="hidden w-full max-w-[420px] flex-col justify-between border-l border-white/5 bg-[#050505] px-9 py-10 lg:flex">
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.45em] text-slate-500">Analysis</p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-100">Program Overview</h3>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-white/5 bg-[#0d0d0d] p-2 text-slate-300 transition hover:border-sky-500/60 hover:text-white"
                >
                  <BarChart3 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 space-y-6">
                <div className="rounded-3xl border border-white/5 bg-[#0a0a0a] p-5">
                  {latestInsight?.chartSpec ? (
                    <ChartRenderer spec={latestInsight.chartSpec as ChartSpec} />
                  ) : (
                    <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-slate-400">
                      <BarChart3 className="h-6 w-6" />
                      Awaiting chart from assistant…
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(latestInsight?.metrics || []).map(({ label, value }) => (
                    <div
                      key={`${label}-${value}`}
                      className="rounded-2xl border border-white/5 bg-[#0a0a0a] px-5 py-4 text-sm text-slate-300"
                    >
                      <div className="text-xs uppercase tracking-[0.35em] text-slate-500">{label}</div>
                      <div className="mt-2 text-lg font-semibold text-slate-100">{value || "—"}</div>
                    </div>
                  ))}
                  {(!latestInsight || latestInsight.metrics.length === 0) && (
                    <div className="rounded-2xl border border-white/5 bg-[#0a0a0a] px-5 py-4 text-sm text-slate-300/80">
                      Metrics will appear here once the assistant references key numbers.
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-white/5 bg-[#0a0a0a] p-6 text-sm text-slate-300/85">
                  <h4 className="text-xs uppercase tracking-[0.35em] text-slate-500">Highlights</h4>
                  {latestInsight?.highlights && latestInsight.highlights.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-slate-200/90">
                      {latestInsight.highlights.map((line) => (
                        <li key={line} className="rounded-xl bg-white/5 px-3 py-2 text-xs leading-relaxed text-slate-100/90">
                          {line}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 leading-relaxed text-slate-200/80">
                      When the assistant responds, contextual insights will be summarized here.
                    </p>
                  )}
                  {latestInsight?.summary ? (
                    <p className="mt-4 max-h-48 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-slate-400/90">
                      {latestInsight.summary}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/5 bg-[#0a0a0a] px-5 py-4 text-xs text-slate-400">
              <p>Latest response: {latestAssistant ? "In progress" : "Awaiting"}</p>
              <p className="mt-1">Charts and headline metrics automatically pin to this panel.</p>
            </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MessageItem({ role, content }: MessageItemProps) {
  const chartSpec = useMemo(() => parseChartSpecFromMarkdown(content || ""), [content]);
  const isUser = role === "user";
  const markdownComponents = useMemo<Components>(() => {
    return {
      p({ children }) {
        return <p className="leading-relaxed text-slate-100/90">{children}</p>;
      },
      code(nodeProps) {
        const { className, children, ...rest } = nodeProps;
        const inline = (nodeProps as { inline?: boolean }).inline ?? false;
        const language = (className || "").replace("language-", "");
        if (!inline && chartSpec && ["chart", "json"].includes(language)) {
          return null;
        }
        return (
          <code
            className={`rounded-md bg-white/5 px-1.5 py-0.5 text-xs text-slate-100 ${className ?? ""}`}
            {...rest}
          >
            {children}
          </code>
        );
      },
      table({ children }) {
        return (
          <div className="overflow-hidden rounded-2xl border border-white/5 bg-[#050b19]">
            <table className="w-full border-collapse text-sm text-slate-100/90">{children}</table>
          </div>
        );
      },
      thead({ children }) {
        return <thead className="bg-white/5 text-xs uppercase tracking-[0.2em] text-slate-400">{children}</thead>;
      },
      tbody({ children }) {
        return <tbody className="divide-y divide-white/5">{children}</tbody>;
      },
      tr({ children }) {
        return <tr className="hover:bg-white/3">{children}</tr>;
      },
      th({ children }) {
        return <th className="px-4 py-3 text-left font-semibold text-slate-200">{children}</th>;
      },
      td({ children }) {
        return <td className="px-4 py-3 text-slate-300">{children}</td>;
      },
      li({ children }) {
        return <li className="mb-1 text-slate-100/90">{children}</li>;
      },
    } satisfies Components;
  }, [chartSpec]);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`flex w-full max-w-[640px] items-start gap-4 ${isUser ? "flex-row-reverse" : ""}`}>
        <div
          className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 text-xs font-medium uppercase ${
            isUser ? "bg-[#111827] text-white" : "bg-[#0a0a0a] text-sky-100"
          }`}
        >
          {isUser ? "You" : "AI"}
        </div>
        <div
          className={`w-full rounded-3xl border px-6 py-5 text-sm leading-relaxed ${
            isUser
              ? "border-white/5 bg-transparent text-slate-200"
              : "border-white/5 bg-[#0a0a0a] text-slate-100"
          }`}
        >
          <div className="text-[0.65rem] uppercase tracking-[0.4em] text-slate-500">
            {isUser ? "You" : "Assistant"}
          </div>
          <div className="mt-4 space-y-4">
            {chartSpec ? (
              <div className="overflow-hidden rounded-2xl border border-white/5 bg-[#050505] p-2">
                <ChartRenderer spec={chartSpec as ChartSpec} />
              </div>
            ) : null}
            <div className="prose prose-invert max-w-none text-sm text-slate-200">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {content}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
