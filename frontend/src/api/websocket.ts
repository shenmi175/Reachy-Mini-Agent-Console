import { API_BASE } from "./client";
import type { WsMessage } from "../types/agent";

interface SocketHandlers {
  onMessage: (message: WsMessage) => void;
  onOpen: () => void;
  onClose: () => void;
  onError: () => void;
}

export function websocketUrl(): string {
  const url = new URL(API_BASE);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  return url.toString();
}

export function createAgentSocket(handlers: SocketHandlers): WebSocket {
  const socket = new WebSocket(websocketUrl());

  socket.onopen = handlers.onOpen;
  socket.onclose = handlers.onClose;
  socket.onerror = handlers.onError;
  socket.onmessage = (event) => {
    try {
      handlers.onMessage(JSON.parse(event.data) as WsMessage);
    } catch {
      handlers.onMessage({
        type: "error",
        payload: { message: "Failed to parse WebSocket message" },
      });
    }
  };

  return socket;
}
