import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "./api/client";
import { createAgentSocket } from "./api/websocket";
import ActionQueue from "./components/ActionQueue";
import ControlPanel from "./components/ControlPanel";
import DebugConsole from "./components/DebugConsole";
import DialoguePanel from "./components/DialoguePanel";
import EventTimeline from "./components/EventTimeline";
import PersonaSelector from "./components/PersonaSelector";
import SimulationViewport from "./components/SimulationViewport";
import StatusPanel from "./components/StatusPanel";
import type {
  AgentEvent,
  AgentStatus,
  DialogueMessage,
  MotionTask,
  Persona,
  RobotStatus,
  SnapshotPayload,
  WsMessage,
} from "./types/agent";

const fallbackPersona: Persona = {
  id: "friendly",
  name: "小跃",
  style: "友好、主动、轻微活泼",
  proactive_level: 0.7,
  greetings: [],
  motions: {},
};

const fallbackAgent: AgentStatus = {
  running: false,
  state: "stopped",
  current_persona: fallbackPersona,
  last_event: null,
  current_task: null,
  queue_length: 0,
  cooldowns: {},
};

const fallbackRobot: RobotStatus = {
  mode: "mock",
  connected: false,
  target: "mock",
  message: "Backend not connected yet",
};

function appendUniqueById<T extends { id: string }>(items: T[], item: T, limit = 200) {
  const next = [...items.filter((existing) => existing.id !== item.id), item];
  return next.slice(-limit);
}

function activeQueueLength(actions: MotionTask[]) {
  return actions.filter((task) => task.status === "pending" || task.status === "running").length;
}

export default function App() {
  const [backendConnected, setBackendConnected] = useState(false);
  const [agent, setAgent] = useState<AgentStatus>(fallbackAgent);
  const [robot, setRobot] = useState<RobotStatus>(fallbackRobot);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [dialogue, setDialogue] = useState<DialogueMessage[]>([]);
  const [actions, setActions] = useState<MotionTask[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([fallbackPersona]);
  const [debugMessages, setDebugMessages] = useState<WsMessage[]>([]);
  const [motionActions, setMotionActions] = useState<string[]>([]);
  const [reachyTarget, setReachyTarget] = useState("127.0.0.1:8001");
  const [controlsOpen, setControlsOpen] = useState(true);

  const addDebug = useCallback((message: string, type = "debug_log") => {
    setDebugMessages((current) =>
      [
        ...current,
        {
          type,
          payload: { message },
          timestamp: new Date().toISOString(),
        },
      ].slice(-200),
    );
  }, []);

  const syncActions = useCallback((task: MotionTask) => {
    setActions((current) => {
      const next = appendUniqueById(current, task, 100);
      setAgent((agentStatus) => ({
        ...agentStatus,
        queue_length: activeQueueLength(next),
        current_task: next.find((item) => item.status === "running") ?? null,
      }));
      return next;
    });
  }, []);

  const syncEvent = useCallback((event: AgentEvent) => {
    setEvents((current) => appendUniqueById(current, event));
    setAgent((current) => ({
      ...current,
      last_event: event,
    }));
  }, []);

  const handleSocketMessage = useCallback(
    (message: WsMessage) => {
      if (message.type === "snapshot") {
        const snapshot = message.payload as unknown as SnapshotPayload;
        setAgent(snapshot.agent ?? fallbackAgent);
        setRobot(snapshot.robot ?? fallbackRobot);
        setEvents(snapshot.events ?? []);
        setDialogue(snapshot.dialogue ?? []);
        setActions(snapshot.actions ?? []);
        setPersonas(snapshot.personas?.length ? snapshot.personas : [fallbackPersona]);
        setDebugMessages(snapshot.debug ?? []);
        setMotionActions(snapshot.motion_actions ?? []);
        setReachyTarget(snapshot.reachy_target ?? "127.0.0.1:8001");
        return;
      }

      if (message.type === "event_received") {
        syncEvent(message.payload as unknown as AgentEvent);
        return;
      }

      if (message.type === "agent_state_changed") {
        const nextState = String(message.payload.new_state) as AgentStatus["state"];
        setAgent((current) => ({
          ...current,
          state: nextState,
          running: nextState !== "stopped",
        }));
        return;
      }

      if (
        message.type === "action_queued" ||
        message.type === "action_started" ||
        message.type === "action_finished"
      ) {
        syncActions(message.payload as unknown as MotionTask);
        return;
      }

      if (message.type === "dialogue_message") {
        setDialogue((current) => appendUniqueById(current, message.payload as unknown as DialogueMessage));
        return;
      }

      if (message.type === "robot_status_changed") {
        setRobot(message.payload as unknown as RobotStatus);
        return;
      }

      if (message.type === "debug_log" || message.type === "error") {
        setDebugMessages((current) => [...current, message].slice(-200));
      }
    },
    [syncActions, syncEvent],
  );

  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;
    let reconnectTimer = 0;

    const connect = () => {
      socket = createAgentSocket({
        onMessage: handleSocketMessage,
        onOpen: () => setBackendConnected(true),
        onClose: () => {
          setBackendConnected(false);
          if (active) {
            reconnectTimer = window.setTimeout(connect, 1500);
          }
        },
        onError: () => setBackendConnected(false),
      });
    };

    connect();
    return () => {
      active = false;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [handleSocketMessage]);

  useEffect(() => {
    const loadInitial = async () => {
      try {
        const [agentStatus, robotStatus, personaList, recentEvents, dialogueHistory] = await Promise.all([
          api.getAgentStatus(),
          api.getRobotStatus(),
          api.getPersonas(),
          api.getRecentEvents(),
          api.getDialogueHistory(),
        ]);
        setAgent(agentStatus);
        setRobot(robotStatus);
        setPersonas(personaList.personas);
        setEvents(recentEvents.events);
        setDialogue(dialogueHistory.messages);
      } catch (error) {
        addDebug(error instanceof Error ? error.message : "Initial backend load failed", "error");
      }
    };

    loadInitial();
  }, [addDebug]);

  const currentPersonaId = agent.current_persona.id;
  const robotLabel = useMemo(() => {
    if (robot.mode === "reachy" && robot.connected) {
      return "Robot Connected";
    }
    if (!robot.connected) {
      return "Robot Disconnected";
    }
    return "Mock Mode";
  }, [robot]);
  const gridClass = controlsOpen
    ? "xl:grid-cols-[280px_minmax(0,1fr)_340px]"
    : "xl:grid-cols-[280px_minmax(0,1fr)_56px]";

  const run = useCallback(
    async <T,>(operation: () => Promise<T>, onSuccess?: (value: T) => void) => {
      try {
        const value = await operation();
        onSuccess?.(value);
      } catch (error) {
        addDebug(error instanceof Error ? error.message : "Operation failed", "error");
      }
    },
    [addDebug],
  );

  return (
    <div className="min-h-screen bg-[#090b10] px-4 py-4 text-slate-100 md:px-6">
      <header className="mb-4 rounded-lg border border-slate-800 bg-[#11151d] px-4 py-4 shadow-xl shadow-black/20">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-50">Reachy Agent Console</h1>
            <div className="mt-1 text-sm text-slate-500">Reachy daemon target: {reachyTarget}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-full px-3 py-1 text-sm ${
                backendConnected ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
              }`}
            >
              Backend {backendConnected ? "Connected" : "Disconnected"}
            </span>
            <span className="rounded-full bg-cyan-500/15 px-3 py-1 text-sm text-cyan-300">{robotLabel}</span>
            <span
              className={`rounded-full px-3 py-1 text-sm ${
                agent.running ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-600/30 text-slate-300"
              }`}
            >
              Agent {agent.running ? "Running" : "Stopped"}
            </span>
          </div>
        </div>
      </header>

      <main className={`grid grid-cols-1 gap-4 ${gridClass}`}>
        <aside className="space-y-4">
          <StatusPanel agent={agent} robot={robot} backendConnected={backendConnected} />
        </aside>

        <section className="space-y-4">
          <SimulationViewport robot={robot} actions={actions} daemonTarget={reachyTarget} />
          <EventTimeline events={events} />
          <DialoguePanel messages={dialogue} onSend={(text) => run(() => api.sendDialogue(text))} />
          <ActionQueue actions={actions} />
          <DebugConsole messages={debugMessages} />
        </section>

        <aside className="space-y-4">
          <button
            onClick={() => setControlsOpen((open) => !open)}
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-800 bg-[#11151d] px-3 py-2 text-sm text-slate-300 shadow-xl shadow-black/20 transition hover:border-cyan-500/60 hover:text-cyan-200"
            title={controlsOpen ? "Collapse controls" : "Expand controls"}
          >
            {controlsOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            {controlsOpen ? <span>Collapse</span> : null}
          </button>
          {controlsOpen ? (
            <>
              <ControlPanel
                motionActions={motionActions}
                onStart={() => run(api.startAgent, setAgent)}
                onStop={() => run(api.stopAgent, setAgent)}
                onReset={() => run(api.resetAgent, setAgent)}
                onEmergencyStop={() => run(api.emergencyStop, setAgent)}
                onConnectRobot={() => run(api.connectRobot, setRobot)}
                onDisconnectRobot={() => run(api.disconnectRobot, setRobot)}
                onInjectEvent={(eventType) => run(() => api.injectEvent(eventType), syncEvent)}
                onMotion={(action) => run(() => api.runRobotAction(action))}
              />
              <PersonaSelector
                personas={personas}
                currentPersonaId={currentPersonaId}
                onSwitch={(personaId) =>
                  run(() => api.switchPersona(personaId), (persona) =>
                    setAgent((current) => ({
                      ...current,
                      current_persona: persona,
                    })),
                  )
                }
              />
            </>
          ) : null}
        </aside>
      </main>
    </div>
  );
}
