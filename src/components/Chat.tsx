"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { ChartRenderer, parseChartSpecFromMarkdown } from "@/components/chart/ChartRenderer";
import type { ChartSpec } from "@/components/chart/ChartRenderer";
import { DataPageNav } from "@/components/navigation/DataPageNav";
import { Sparkle } from "lucide-react";

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
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <DataPageNav />
        <div className="flex flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-border px-8 py-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card">
                <Sparkle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-[0.6rem] uppercase tracking-[0.55em] text-muted-foreground">Assistant</p>
                <h1 className="text-xl font-semibold">Medicare Insight AI</h1>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">{new Date().toLocaleString()}</div>
          </header>

          <main className="flex flex-1 flex-col bg-background">
            <div className="flex flex-1 justify-center overflow-hidden">
              <div className="flex w-full max-w-3xl flex-col px-4 pt-6 pb-6 md:px-6">
                <div className="flex-1 overflow-y-auto pb-32">
                  <div className="flex flex-col gap-6">
                    {showPlaceholder ? (
                      <div className="flex min-h-[280px] flex-col items-center justify-center gap-6 text-center">
                        <div className="space-y-3">
                          <p className="text-sm uppercase tracking-[0.35em] text-muted-foreground">Medicare Advantage</p>
                          <h2 className="text-3xl font-semibold">What&apos;s on your mind today?</h2>
                        </div>
                        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                          Explore enrollment trends, compare plan performance, or build quick visualizations. Ask a question to get started.
                        </p>
                      </div>
                    ) : null}
                    {messages.map((m) => (
                      <MessageItem key={m.id} role={m.role} content={m.content} />
                    ))}
                    {isLoading ? (
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <span className="h-2 w-2 animate-ping rounded-full bg-primary" />
                        Thinking…
                      </div>
                    ) : null}
                    {error ? (
                      <div className="mx-auto w-full max-w-2xl rounded-3xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {error}
                      </div>
                    ) : null}
                    <div ref={bottomRef} />
                  </div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 flex justify-center border-t border-border/60 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-6 pt-10 md:px-6">
              <div className="w-full max-w-3xl">
                <div className="rounded-3xl border border-border/70 bg-card/95 p-4 shadow-lg backdrop-blur">
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
                        const resp = await fetch("/api/chat-sql", {
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
                        const message = err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
                        setError(String(message));
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                    className="flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card px-4 py-3 text-sm text-foreground transition focus-within:border-primary">
                      <input
                        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                        placeholder="Ask anything about Medicare Advantage data…"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        aria-label="Chat prompt"
                      />
                      <button
                        type="submit"
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isLoading}
                        aria-label="Send"
                      >
                        {isLoading ? (
                          <span className="h-3 w-3 animate-spin rounded-full border border-primary-foreground/70 border-t-transparent" aria-hidden />
                        ) : (
                          <span className="text-lg">↗</span>
                        )}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {quickPrompts.map(({ title, prompt }) => (
                        <button
                          key={title}
                          type="button"
                          onClick={() => setInput(prompt)}
                          className="rounded-full border border-border/70 bg-card/80 px-3 py-1.5 transition hover:border-primary/60 hover:text-foreground"
                        >
                          {title}
                        </button>
                      ))}
                    </div>
                  </form>
                  <p className="mt-3 text-center text-[0.65rem] uppercase tracking-[0.4em] text-muted-foreground">
                    Uses Medicare Advantage datasets
                  </p>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function MessageItem({ role, content }: MessageItemProps) {
  const chartSpec = useMemo<ChartSpec | null>(() => parseChartSpecFromMarkdown(content || ""), [content]);
  const isUser = role === "user";
  const markdownComponents = useMemo<Components>(() => {
    return {
      p({ children }) {
        return <p className="leading-relaxed text-foreground/90">{children}</p>;
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
            className={`rounded-md bg-accent px-1.5 py-0.5 text-xs text-foreground ${className ?? ""}`}
            {...rest}
          >
            {children}
          </code>
        );
      },
      table({ children }) {
        return (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="w-full border-collapse text-sm text-foreground/90">{children}</table>
          </div>
        );
      },
      thead({ children }) {
        return <thead className="bg-accent text-xs uppercase tracking-[0.2em] text-muted-foreground">{children}</thead>;
      },
      tbody({ children }) {
        return <tbody className="divide-y divide-border">{children}</tbody>;
      },
      tr({ children }) {
        return <tr className="hover:bg-accent/50">{children}</tr>;
      },
      th({ children }) {
        return <th className="px-4 py-3 text-left font-semibold text-foreground">{children}</th>;
      },
      td({ children }) {
        return <td className="px-4 py-3 text-muted-foreground">{children}</td>;
      },
      li({ children }) {
        return <li className="mb-1 text-foreground/90">{children}</li>;
      },
    } satisfies Components;
  }, [chartSpec]);

  return (
    <div className="flex justify-center px-2">
      <div className={`w-full max-w-3xl`}>
        <div className={`flex items-start gap-4 ${isUser ? "justify-end" : "justify-start"}`}>
          {!isUser ? (
            <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card/80 text-xs font-medium uppercase text-primary-foreground/80">
              AI
            </div>
          ) : null}
          <div
            className={`w-full rounded-3xl px-6 py-5 text-sm leading-relaxed shadow-sm ${
              isUser
                ? "border border-border/70 bg-card/90 text-foreground"
                : "border border-border/70 bg-card/85 text-foreground"
            }`}
          >
            <div className="text-[0.65rem] uppercase tracking-[0.35em] text-muted-foreground/80">
              {isUser ? "You" : "Assistant"}
            </div>
            <div className="mt-4 space-y-4">
              {chartSpec ? (
                <div className={`overflow-hidden rounded-2xl border ${isUser ? "border-border/70" : "border-border/70"} bg-background p-3`}>
                  <ChartRenderer spec={chartSpec as ChartSpec} />
                </div>
              ) : null}
              <div className={`prose max-w-none text-sm ${isUser ? "prose-invert" : "dark:prose-invert"}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {content}
                </ReactMarkdown>
              </div>
            </div>
          </div>
          {isUser ? (
            <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card/80 text-xs font-medium uppercase text-muted-foreground">
              You
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
