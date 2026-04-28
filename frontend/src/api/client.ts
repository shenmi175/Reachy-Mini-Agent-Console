import type {
  AgentEvent,
  AgentStatus,
  DialogueMessage,
  MotionTask,
  Persona,
  RobotStatus,
  SimStatePayload,
} from "../types/agent";

export const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://127.0.0.1:8710";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.detail ?? JSON.stringify(body);
    } catch {
      detail = await response.text();
    }
    throw new Error(detail || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const api = {
  startAgent: () => post<AgentStatus>("/api/agent/start"),
  stopAgent: () => post<AgentStatus>("/api/agent/stop"),
  resetAgent: () => post<AgentStatus>("/api/agent/reset"),
  emergencyStop: () => post<AgentStatus>("/api/agent/emergency_stop"),
  getAgentStatus: () => request<AgentStatus>("/api/agent/status"),
  injectEvent: (type: string) => post<AgentEvent>("/api/events/inject", { type }),
  getRecentEvents: () => request<{ events: AgentEvent[] }>("/api/events/recent"),
  getRobotStatus: () => request<RobotStatus>("/api/robot/status"),
  getSimState: () => request<SimStatePayload>("/api/robot/sim_state"),
  connectRobot: () => post<RobotStatus>("/api/robot/connect"),
  disconnectRobot: () => post<RobotStatus>("/api/robot/disconnect"),
  runRobotAction: (action: string) => post<MotionTask>("/api/robot/action", { action }),
  neutralRobot: () => post<MotionTask>("/api/robot/neutral"),
  getPersonas: () => request<{ personas: Persona[] }>("/api/personas"),
  getCurrentPersona: () => request<Persona>("/api/personas/current"),
  switchPersona: (persona_id: string) => post<Persona>("/api/personas/switch", { persona_id }),
  sendDialogue: (text: string) => post<DialogueMessage>("/api/dialogue/send", { text }),
  getDialogueHistory: () => request<{ messages: DialogueMessage[] }>("/api/dialogue/history"),
};
