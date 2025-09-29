"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Loader2, Sparkles } from "lucide-react";
import { ChartRenderer } from "@/components/chart/ChartRenderer";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export function AnalyticsChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      // Get selected variables from localStorage
      const selectedVariablesJson = localStorage.getItem("selectedVariables");
      const selectedVariables = selectedVariablesJson ? JSON.parse(selectedVariablesJson) : [];

      const response = await fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: userMessage }],
          selectedVariables,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get response");
      }

      const data = await response.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.message.content }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${error instanceof Error ? error.message : "Failed to get response"}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const extractChartSpec = (content: string) => {
    const fenceRegex = /```(?:json|chart)\s*\n([\s\S]*?)```/;
    const match = content.match(fenceRegex);
    if (!match) return null;

    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  };

  const removeChartSpec = (content: string) => {
    return content.replace(/```(?:json|chart)\s*\n[\s\S]*?```/, "").trim();
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-[#0a0a0a]">
              <Sparkles className="h-8 w-8 text-sky-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-200">AI Analytics Assistant</h3>
              <p className="mt-2 max-w-md text-sm text-slate-500">
                Select variables above and ask me to create charts, compare data, or generate insights.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                onClick={() => setInput("Show me a trend chart for the selected variables")}
                className="rounded-full border border-white/10 bg-[#0a0a0a] px-4 py-2 text-xs text-slate-300 transition hover:border-sky-400/60 hover:text-sky-200"
              >
                Create a trend chart
              </button>
              <button
                onClick={() => setInput("Compare the selected variables across different years")}
                className="rounded-full border border-white/10 bg-[#0a0a0a] px-4 py-2 text-xs text-slate-300 transition hover:border-sky-400/60 hover:text-sky-200"
              >
                Compare across years
              </button>
              <button
                onClick={() => setInput("Summarize the key insights from the selected data")}
                className="rounded-full border border-white/10 bg-[#0a0a0a] px-4 py-2 text-xs text-slate-300 transition hover:border-sky-400/60 hover:text-sky-200"
              >
                Generate summary
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {messages.map((message, index) => {
              const chartSpec = message.role === "assistant" ? extractChartSpec(message.content) : null;
              const textContent = message.role === "assistant" ? removeChartSpec(message.content) : message.content;

              return (
                <div
                  key={index}
                  className={`flex gap-4 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {message.role === "assistant" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#0a0a0a]">
                      <Sparkles className="h-4 w-4 text-sky-400" />
                    </div>
                  )}
                  <div
                    className={`max-w-3xl rounded-2xl px-5 py-4 ${
                      message.role === "user"
                        ? "bg-sky-500/20 text-sky-100 border border-sky-400/40"
                        : "bg-[#0a0a0a] text-slate-200 border border-white/5"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <div className="flex flex-col gap-4">
                        {textContent && (
                          <div className="prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
                          </div>
                        )}
                        {chartSpec && (
                          <div className="rounded-xl border border-white/10 bg-[#050505] p-4">
                            <ChartRenderer spec={chartSpec} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm">{message.content}</p>
                    )}
                  </div>
                  {message.role === "user" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-400/40 bg-sky-500/20">
                      <span className="text-xs font-semibold text-sky-200">You</span>
                    </div>
                  )}
                </div>
              );
            })}
            {isLoading && (
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#0a0a0a]">
                  <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
                </div>
                <div className="rounded-2xl border border-white/5 bg-[#0a0a0a] px-5 py-4">
                  <p className="text-sm text-slate-400">Analyzing data and generating insights...</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="border-t border-white/5 px-8 py-6">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your data, request charts, or get insights..."
            disabled={isLoading}
            className="flex-1 rounded-2xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex items-center gap-2 rounded-2xl border border-sky-500/70 bg-sky-500/10 px-6 py-3 text-sm font-medium text-sky-200 transition hover:border-sky-400/80 hover:bg-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Analyzing</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Send</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
