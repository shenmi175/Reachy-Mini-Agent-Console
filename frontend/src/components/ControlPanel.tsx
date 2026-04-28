import {
  Activity,
  Cable,
  CableIcon,
  OctagonAlert,
  Play,
  RotateCcw,
  Square,
  Zap,
} from "lucide-react";

import { DEFAULT_MOTIONS, MANUAL_EVENTS } from "../types/agent";

interface Props {
  motionActions: string[];
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  onReset: () => Promise<void>;
  onEmergencyStop: () => Promise<void>;
  onConnectRobot: () => Promise<void>;
  onDisconnectRobot: () => Promise<void>;
  onInjectEvent: (eventType: string) => Promise<void>;
  onMotion: (action: string) => Promise<void>;
}

const buttonBase =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60";

export default function ControlPanel({
  motionActions,
  onStart,
  onStop,
  onReset,
  onEmergencyStop,
  onConnectRobot,
  onDisconnectRobot,
  onInjectEvent,
  onMotion,
}: Props) {
  const motions = motionActions.length > 0 ? motionActions : [...DEFAULT_MOTIONS];

  return (
    <section className="rounded-lg border border-slate-800 bg-[#11151d] p-4 shadow-xl shadow-black/20">
      <h2 className="mb-3 text-base font-semibold text-slate-100">Controls</h2>

      <div className="grid grid-cols-2 gap-2">
        <button className={`${buttonBase} border-emerald-500/40 bg-emerald-500/10 text-emerald-200`} onClick={onStart}>
          <Play size={16} />
          Start Agent
        </button>
        <button className={`${buttonBase} border-slate-600 bg-slate-700/30 text-slate-100`} onClick={onStop}>
          <Square size={16} />
          Stop Agent
        </button>
        <button className={`${buttonBase} border-cyan-500/40 bg-cyan-500/10 text-cyan-200`} onClick={onReset}>
          <RotateCcw size={16} />
          Reset State
        </button>
        <button className={`${buttonBase} border-red-500/50 bg-red-500/15 text-red-200`} onClick={onEmergencyStop}>
          <OctagonAlert size={16} />
          Emergency Stop
        </button>
        <button className={`${buttonBase} border-cyan-500/40 bg-cyan-500/10 text-cyan-200`} onClick={onConnectRobot}>
          <Cable size={16} />
          Connect Robot
        </button>
        <button
          className={`${buttonBase} border-slate-600 bg-slate-700/30 text-slate-100`}
          onClick={onDisconnectRobot}
        >
          <CableIcon size={16} />
          Disconnect
        </button>
      </div>

      <details className="mt-5" open>
        <summary className="mb-2 flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase text-slate-500">
          <Zap size={14} />
          Inject Event
        </summary>
        <div className="grid grid-cols-2 gap-2">
          {MANUAL_EVENTS.map((eventType) => (
            <button
              key={eventType}
              className={`${buttonBase} border-slate-700 bg-[#0b0f16] text-slate-200 hover:border-cyan-500/60`}
              onClick={() => onInjectEvent(eventType)}
            >
              {eventType}
            </button>
          ))}
        </div>
      </details>

      <details className="mt-5" open>
        <summary className="mb-2 flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase text-slate-500">
          <Activity size={14} />
          Motion Buttons
        </summary>
        <div className="grid grid-cols-2 gap-2">
          {motions.map((action) => (
            <button
              key={action}
              className={`${buttonBase} border-slate-700 bg-[#0b0f16] text-slate-200 hover:border-emerald-500/60`}
              onClick={() => onMotion(action)}
            >
              {action}
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}
