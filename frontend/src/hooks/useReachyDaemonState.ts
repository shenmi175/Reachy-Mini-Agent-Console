import { useEffect, useMemo, useRef, useState } from "react";

import type { ReachyStateFrame } from "../types/agent";

export interface ReachyDaemonState {
  connected: boolean;
  frame: ReachyStateFrame | null;
  wsUrl: string;
  error?: string;
  lastMessageAt?: string;
}

const DEFAULT_STATE: ReachyDaemonState = {
  connected: false,
  frame: null,
  wsUrl: "",
};

const STATE_WS_FREQUENCY_HZ = "12";

function normalizeTarget(target: string) {
  return target
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^wss?:\/\//, "")
    .replace(/\/+$/, "");
}

function buildStateWsUrl(target: string) {
  const normalizedTarget = normalizeTarget(target || "127.0.0.1:8001");
  const params = new URLSearchParams({
    frequency: STATE_WS_FREQUENCY_HZ,
    with_head_pose: "true",
    with_head_joints: "true",
    with_body_yaw: "true",
    with_target_body_yaw: "true",
    with_antenna_positions: "true",
    with_target_antenna_positions: "true",
    with_passive_joints: "true",
    use_pose_matrix: "true",
  });

  return `ws://${normalizedTarget}/api/state/ws/full?${params.toString()}`;
}

function normalizeFrame(raw: unknown, dataVersion: number): ReachyStateFrame | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const payload = raw as ReachyStateFrame & { data?: ReachyStateFrame };
  const frame = payload.data && typeof payload.data === "object" ? payload.data : payload;
  return {
    ...frame,
    dataVersion,
  };
}

export function useReachyDaemonState(daemonTarget: string, enabled = true): ReachyDaemonState {
  const dataVersionRef = useRef(0);
  const [state, setState] = useState<ReachyDaemonState>(DEFAULT_STATE);
  const wsUrl = useMemo(() => buildStateWsUrl(daemonTarget), [daemonTarget]);

  useEffect(() => {
    if (!enabled) {
      setState((current) => ({ ...current, connected: false, wsUrl }));
      return;
    }

    let active = true;
    let reconnectTimer = 0;
    let socket: WebSocket | null = null;

    const connect = () => {
      socket = new WebSocket(wsUrl);
      setState((current) => ({ ...current, wsUrl, error: undefined }));

      socket.onopen = () => {
        if (!active) return;
        setState((current) => ({ ...current, connected: true, wsUrl, error: undefined }));
      };

      socket.onmessage = (event) => {
        if (!active) return;
        try {
          const parsed = JSON.parse(String(event.data));
          const frame = normalizeFrame(parsed, ++dataVersionRef.current);
          if (!frame) return;
          setState({
            connected: true,
            frame,
            wsUrl,
            lastMessageAt: new Date().toISOString(),
          });
        } catch (error) {
          setState((current) => ({
            ...current,
            connected: false,
            wsUrl,
            error: error instanceof Error ? error.message : "Invalid daemon state frame",
          }));
        }
      };

      socket.onerror = () => {
        if (!active) return;
        setState((current) => ({
          ...current,
          connected: false,
          wsUrl,
          error: "Reachy daemon state WebSocket unavailable",
        }));
      };

      socket.onclose = () => {
        if (!active) return;
        setState((current) => ({ ...current, connected: false, wsUrl }));
        reconnectTimer = window.setTimeout(connect, 1500);
      };
    };

    connect();

    return () => {
      active = false;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [enabled, wsUrl]);

  return state;
}
