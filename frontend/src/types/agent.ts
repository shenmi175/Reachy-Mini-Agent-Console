export type AgentState =
  | "stopped"
  | "idle"
  | "greeting"
  | "listening"
  | "thinking"
  | "speaking"
  | "acting"
  | "error";

export type MotionStatus = "pending" | "running" | "done" | "failed" | "cancelled";

export interface Persona {
  id: string;
  name: string;
  style: string;
  proactive_level: number;
  greetings: string[];
  motions: Record<string, string>;
}

export interface AgentEvent {
  id: string;
  type: string;
  source: string;
  priority: number;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface DialogueMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  persona_id?: string | null;
  timestamp: string;
}

export interface MotionTask {
  id: string;
  action: string;
  status: MotionStatus;
  source: string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  error?: string | null;
}

export interface RobotStatus {
  mode: "mock" | "reachy" | string;
  connected: boolean;
  target: string;
  last_action?: string | null;
  message?: string;
  connection_mode?: string;
  media_backend?: string;
}

export interface SimStatePayload {
  available: boolean;
  target: string;
  error?: string;
  state?: ReachyStateFrame;
  daemon?: {
    state?: string;
    simulation_enabled?: boolean | null;
    mockup_sim_enabled?: boolean | null;
    no_media?: boolean;
    error?: string | null;
    backend_status?: Record<string, unknown> | null;
  };
}

export interface ReachyPoseObject {
  x?: number;
  y?: number;
  z?: number;
  roll?: number;
  pitch?: number;
  yaw?: number;
}

export interface ReachyPoseMatrix {
  m?: number[];
}

export interface ReachyStateFrame {
  control_mode?: string | null;
  head_pose?: ReachyPoseObject | ReachyPoseMatrix | number[] | null;
  target_head_pose?: ReachyPoseObject | ReachyPoseMatrix | number[] | null;
  head_joints?: number[] | null;
  target_head_joints?: number[] | null;
  body_yaw?: number | null;
  target_body_yaw?: number | null;
  antennas_position?: number[] | null;
  target_antennas_position?: number[] | null;
  target_antennas?: number[] | null;
  passive_joints?: number[] | null;
  timestamp?: string | null;
  dataVersion?: number;
}

export interface AgentStatus {
  running: boolean;
  state: AgentState;
  current_persona: Persona;
  last_event?: AgentEvent | null;
  current_task?: MotionTask | null;
  queue_length: number;
  cooldowns: Record<string, unknown>;
  robot?: RobotStatus;
}

export interface SnapshotPayload {
  agent: AgentStatus;
  robot: RobotStatus;
  events: AgentEvent[];
  dialogue: DialogueMessage[];
  actions: MotionTask[];
  personas: Persona[];
  debug: WsMessage[];
  motion_actions: string[];
  reachy_target: string;
}

export interface WsMessage {
  type: string;
  payload: Record<string, unknown>;
  timestamp?: string;
}

export const MANUAL_EVENTS = [
  "face_seen",
  "face_lost",
  "user_speaking",
  "user_stopped_speaking",
  "idle_timeout",
  "hand_wave",
  "phone_seen",
  "danger_detected",
] as const;

export const DEFAULT_MOTIONS = [
  "neutral",
  "look_left",
  "look_right",
  "look_up",
  "look_down",
  "nod",
  "shake_head",
  "antenna_wave",
] as const;
