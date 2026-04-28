import type { MotionTask } from "../types/agent";

interface Props {
  actions: MotionTask[];
}

const statusClass: Record<string, string> = {
  pending: "text-amber-300 bg-amber-500/10",
  running: "text-cyan-300 bg-cyan-500/10",
  done: "text-emerald-300 bg-emerald-500/10",
  failed: "text-red-300 bg-red-500/10",
  cancelled: "text-slate-300 bg-slate-500/10",
};

export default function ActionQueue({ actions }: Props) {
  const ordered = [...actions].reverse();

  return (
    <section className="rounded-lg border border-slate-800 bg-[#11151d] p-4 shadow-xl shadow-black/20">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-100">Action Queue</h2>
        <span className="text-xs text-slate-500">{actions.length} tasks</span>
      </div>
      <div className="max-h-56 space-y-2 overflow-auto pr-1">
        {ordered.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-700 p-4 text-sm text-slate-500">
            No actions queued
          </div>
        ) : (
          ordered.map((task) => (
            <div key={task.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-md bg-[#0b0f16] px-3 py-2">
              <div>
                <div className="font-mono text-sm text-slate-100">{task.action}</div>
                <div className="text-xs text-slate-500">source={task.source}</div>
                {task.error ? <div className="mt-1 text-xs text-red-300">{task.error}</div> : null}
              </div>
              <span className={`h-fit rounded-full px-2 py-1 text-xs ${statusClass[task.status] ?? ""}`}>
                {task.status}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
