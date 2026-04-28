import type { AgentEvent } from "../types/agent";

interface Props {
  events: AgentEvent[];
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--:--";
  }
  return date.toLocaleTimeString([], { hour12: false });
}

export default function EventTimeline({ events }: Props) {
  const ordered = [...events].reverse();

  return (
    <section className="rounded-lg border border-slate-800 bg-[#11151d] p-4 shadow-xl shadow-black/20">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-100">Event Timeline</h2>
        <span className="text-xs text-slate-500">{events.length} events</span>
      </div>
      <div className="max-h-64 space-y-2 overflow-auto pr-1 font-mono text-xs">
        {ordered.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-700 p-4 text-slate-500">No events yet</div>
        ) : (
          ordered.map((event) => (
            <div key={event.id} className="rounded-md bg-[#0b0f16] px-3 py-2 text-slate-300">
              <span className="text-cyan-300">[{formatTime(event.timestamp)}]</span>{" "}
              <span className="text-slate-100">{event.type}</span>{" "}
              <span className="text-slate-500">source={event.source}</span>{" "}
              <span className="text-slate-500">priority={event.priority}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
