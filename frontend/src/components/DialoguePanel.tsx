import { Send } from "lucide-react";
import { FormEvent, useState } from "react";

import type { DialogueMessage } from "../types/agent";

interface Props {
  messages: DialogueMessage[];
  onSend: (text: string) => Promise<void>;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--:--";
  }
  return date.toLocaleTimeString([], { hour12: false });
}

export default function DialoguePanel({ messages, onSend }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const clean = text.trim();
    if (!clean || sending) {
      return;
    }
    setSending(true);
    try {
      await onSend(clean);
      setText("");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-800 bg-[#11151d] p-4 shadow-xl shadow-black/20">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-100">Dialogue</h2>
        <span className="text-xs text-slate-500">{messages.length} messages</span>
      </div>
      <div className="mb-3 max-h-72 space-y-3 overflow-auto pr-1">
        {messages.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-700 p-4 text-sm text-slate-500">
            No dialogue yet
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-md px-3 py-2 ${
                message.role === "user" ? "bg-cyan-500/10" : "bg-emerald-500/10"
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold uppercase text-slate-300">
                  {message.role === "user" ? "User" : "Assistant"}
                </span>
                <span className="font-mono text-slate-500">{formatTime(message.timestamp)}</span>
              </div>
              <div className="text-sm leading-6 text-slate-100">{message.text}</div>
            </div>
          ))
        )}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-slate-700 bg-[#090b10] px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
          placeholder="Type a message"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="inline-flex items-center gap-2 rounded-md bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          <Send size={16} />
          Send
        </button>
      </form>
    </section>
  );
}
