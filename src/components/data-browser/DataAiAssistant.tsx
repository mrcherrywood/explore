"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { Bot, Sparkle, User } from "lucide-react";

import { ChartRenderer, parseChartSpecFromMarkdown } from "@/components/chart/ChartRenderer";
import type { TableColumnConfig } from "@/lib/data-browser/config";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type DataAiAssistantProps = {
  table: string;
  tableLabel: string;
  columns: TableColumnConfig[];
};

const quickPrompts = [
  "Summarize recent trends and KPIs for this table.",
  "Identify contracts with the highest star ratings and premiums.",
  "List counties with limited plan availability in the latest year.",
];

function buildContextPrompt(table: string, tableLabel: string, columns: TableColumnConfig[]) {
  const columnList = columns
    .map((column) => `${column.key}${column.label ? ` (${column.label})` : ""}`)
    .join(", ");

  return `Table context:\n- Supabase table: ${table}\n- Display name: ${tableLabel}\n- Columns: ${columnList}\nProvide concise findings, SQL-like recommendations, and data points grounded in the available columns. When useful, request precise filters (contract_id, year, segment, etc.).`;
}

function sanitizeSummary(markdown: string | null) {
  if (!markdown) return "";
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function DataAiAssistant({ table, tableLabel, columns }: DataAiAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const contextPrompt = useMemo(() => buildContextPrompt(table, tableLabel, columns), [table, tableLabel, columns]);

  const latestAssistant = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === "assistant") {
        return messages[index];
      }
    }
    return null;
  }, [messages]);

  const latestChartSpec = useMemo(() => {
    if (!latestAssistant) return null;
    return parseChartSpecFromMarkdown(latestAssistant.content);
  }, [latestAssistant]);

  const latestSummary = useMemo(() => sanitizeSummary(latestAssistant?.content ?? null), [latestAssistant]);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-3xl border border-border bg-card p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">AI Copilot</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">Ask about {tableLabel}</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              Provide filters like contract IDs, counties, or years for better results. Responses always reference live
              Supabase data.
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted">
            <Sparkle className="h-4 w-4 text-muted-foreground" />
          </div>
        </header>

        <div className="mt-4 flex flex-wrap gap-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setInput(prompt)}
              className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400 transition hover:border-sky-400/50 hover:text-sky-200"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="mt-5 max-h-72 space-y-4 overflow-y-auto pr-1">
          {messages.map((message) => (
            <MessageBubble key={message.id} role={message.role} content={message.content} />
          ))}
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="h-2 w-2 animate-ping rounded-full bg-sky-400" />
              Querying dataset…
            </div>
          ) : null}
          {error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <form
          className="mt-6 flex flex-col gap-3 sm:flex-row"
          onSubmit={async (event) => {
            event.preventDefault();
            const trimmed = input.trim();
            if (!trimmed || isLoading) return;

            const userMessage: Message = {
              id: crypto.randomUUID(),
              role: "user",
              content: trimmed,
            };

            const nextMessages = [...messages, userMessage];
            setMessages(nextMessages);
            setInput("");
            setIsLoading(true);
            setError(null);

            try {
              const resp = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  messages: [
                    { role: "user", content: contextPrompt },
                    ...nextMessages.map(({ role, content }) => ({ role, content })),
                  ],
                }),
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
              const message = err instanceof Error ? err.message : String(err);
              setError(message);
            } finally {
              setIsLoading(false);
            }
          }}
        >
          <div className="flex flex-1 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-2 text-sm text-foreground">
            <textarea
              className="h-20 flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              placeholder={`Ask the copilot about ${tableLabel.toLowerCase()}…`}
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          </div>
          <button
            type="submit"
            className="rounded-2xl border border-sky-500/70 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-200 transition hover:border-sky-400 hover:text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading}
          >
            Send
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-white/5 bg-[#080808] p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-500">Latest Chart</h3>
            <p className="mt-1 text-xs text-slate-500">Charts render automatically from the assistant&apos;s response.</p>
          </div>
        </div>

        <div className="mt-4">
          {latestChartSpec ? (
            <ChartRenderer spec={latestChartSpec} />
          ) : (
            <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted text-xs text-muted-foreground">
              <Sparkle className="h-4 w-4" />
              Ask the copilot for a visualization and it will appear here.
            </div>
          )}
        </div>
      </section>

      {latestSummary ? (
        <section className="rounded-3xl border border-border bg-card p-6 text-sm text-foreground">
          <h3 className="text-xs uppercase tracking-[0.35em] text-slate-500">Key Takeaways</h3>
          <p className="mt-3 whitespace-pre-line text-xs text-slate-300">{latestSummary}</p>
        </section>
      ) : null}
    </div>
  );
}

function MessageBubble({ role, content }: { role: Message["role"]; content: string }) {
  const isUser = role === "user";
  const chartSpec = useMemo(() => parseChartSpecFromMarkdown(content), [content]);
  const components = useMemo<Components>(() => {
    return {
      p({ children }) {
        return <p className="leading-relaxed text-slate-200">{children}</p>;
      },
      li({ children }) {
        return <li className="mb-1 text-slate-200">{children}</li>;
      },
      table({ children }) {
        return (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full border-collapse text-xs text-slate-200/80">{children}</table>
          </div>
        );
      },
      thead({ children }) {
        return <thead className="bg-white/5 text-[0.65rem] uppercase tracking-[0.2em] text-slate-400">{children}</thead>;
      },
      tbody({ children }) {
        return <tbody className="divide-y divide-white/10">{children}</tbody>;
      },
      th({ children }) {
        return <th className="px-3 py-2 text-left text-slate-200">{children}</th>;
      },
      td({ children }) {
        return <td className="px-3 py-2 text-slate-300">{children}</td>;
      },
      code({ children, className, ...rest }) {
        return (
          <code
            className={`rounded-md bg-white/5 px-1.5 py-0.5 text-[0.65rem] text-slate-100 ${className ?? ""}`}
            {...rest}
          >
            {children}
          </code>
        );
      },
    } satisfies Components;
  }, [chartSpec]);

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser ? (
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card">
          <Bot className="h-4 w-4 text-sky-200" />
        </div>
      ) : null}
      <div
        className={`max-w-[520px] rounded-3xl border px-4 py-3 text-xs leading-relaxed ${
          isUser ? "border-border bg-transparent text-foreground" : "border-border bg-muted text-foreground"
        }`}
      >
        <div className="mb-2 flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.35em] text-slate-500">
          {isUser ? (
            <User className="h-3 w-3" />
          ) : (
            <Bot className="h-3 w-3 text-sky-200" />
          )}
          {isUser ? "You" : "Assistant"}
        </div>
        {chartSpec ? (
          <div className="mb-3 overflow-hidden rounded-xl border border-white/10 bg-[#050505] p-2">
            <ChartRenderer spec={chartSpec} />
          </div>
        ) : null}
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </ReactMarkdown>
      </div>
      {isUser ? (
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[#111827]">
          <User className="h-4 w-4 text-slate-100" />
        </div>
      ) : null}
    </div>
  );
}
