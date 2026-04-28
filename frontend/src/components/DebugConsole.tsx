import type { WsMessage } from "../types/agent";

interface Props {
  messages: WsMessage[];
}

function formatTime(value?: string) {
  if (!value) {
    return "--:--:--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--:--";
  }
  return date.toLocaleTimeString([], { hour12: false });
}

export default function DebugConsole({ messages }: Props) {
  const ordered = [...messages].reverse();

  return (
    <section className="rounded-lg border border-slate-800 bg-[#11151d] p-4 shadow-xl shadow-black/20">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-100">Debug Log</h2>
        <span className="text-xs text-slate-500">{messages.length} lines</span>
      </div>
      <div className="max-h-56 space-y-2 overflow-auto pr-1 font-mono text-xs">
        {ordered.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-700 p-4 text-slate-500">No logs yet</div>
        ) : (
          ordered.map((message, index) => {
            const payload = message.payload ?? {};
            const text = String(payload.message ?? JSON.stringify(payload));
            const severity = String(payload.severity ?? "");
            const isWarning = severity === "warning";
            const rowClass =
              message.type === "error"
                ? "bg-red-500/10 text-red-200"
                : isWarning
                  ? "bg-amber-500/10 text-amber-100"
                  : "bg-[#0b0f16] text-slate-300";
            const typeClass =
              message.type === "error" ? "text-red-300" : isWarning ? "text-amber-300" : "text-emerald-300";
            return (
              <div
                key={`${message.timestamp}-${index}`}
                className={`rounded-md px-3 py-2 ${rowClass}`}
              >
                <span className="text-slate-500">[{formatTime(message.timestamp)}]</span>{" "}
                <span className={typeClass}>{isWarning ? "warning" : message.type}</span>{" "}
                {text}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
