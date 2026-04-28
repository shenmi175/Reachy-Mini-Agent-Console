import type { AgentStatus, RobotStatus } from "../types/agent";

interface Props {
  agent: AgentStatus;
  robot: RobotStatus;
  backendConnected: boolean;
}

const valueClass = "text-sm font-medium text-slate-100 break-words";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-800/80 py-3 last:border-0">
      <span className="text-xs uppercase text-slate-500">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

export default function StatusPanel({ agent, robot, backendConnected }: Props) {
  return (
    <section className="rounded-lg border border-slate-800 bg-[#11151d] p-4 shadow-xl shadow-black/20">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-100">Status</h2>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            backendConnected ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
          }`}
        >
          {backendConnected ? "Connected" : "Disconnected"}
        </span>
      </div>
      <Row label="Agent Status" value={agent.running ? "Running" : "Stopped"} />
      <Row label="Current State" value={agent.state} />
      <Row label="Current Persona" value={`${agent.current_persona.name} (${agent.current_persona.id})`} />
      <Row
        label="Robot Mode"
        value={
          robot.mode === "reachy" && robot.connected
            ? "Reachy Connected"
            : robot.connected
              ? "Mock Mode"
              : "Disconnected"
        }
      />
      <Row label="Last Event" value={agent.last_event?.type ?? "none"} />
      <Row label="Current Task" value={agent.current_task?.action ?? "none"} />
      <Row label="Queue Length" value={String(agent.queue_length)} />
      <Row label="Cooldowns" value="placeholder" />
    </section>
  );
}
