import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Box, ExternalLink, RotateCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as THREE from "three";

import { api } from "../api/client";
import { useReachyDaemonState } from "../hooks/useReachyDaemonState";
import type { MotionTask, ReachyStateFrame, RobotStatus, SimStatePayload } from "../types/agent";
import ReachyUrdfModel from "./ReachyUrdfModel";

interface Props {
  robot: RobotStatus;
  actions: MotionTask[];
  daemonTarget: string;
}

function radiansToDegrees(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  return (value * 180) / Math.PI;
}

function latestAction(actions: MotionTask[]) {
  return [...actions].reverse().find((task) => task.status === "running" || task.status === "done") ?? null;
}

function metricFrame(frame: ReachyStateFrame | null | undefined) {
  const antennas = frame?.target_antennas_position ?? frame?.target_antennas ?? frame?.antennas_position ?? [0, 0];
  return {
    bodyYaw: radiansToDegrees(frame?.target_body_yaw ?? frame?.body_yaw),
    leftAntenna: radiansToDegrees(antennas[0] ?? 0),
    rightAntenna: radiansToDegrees(antennas[1] ?? 0),
    headJoints: Array.isArray(frame?.head_joints) ? frame.head_joints.length : 0,
  };
}

export default function SimulationViewport({ robot, actions, daemonTarget }: Props) {
  const [view, setView] = useState<"live3d" | "dashboard">("live3d");
  const [simState, setSimState] = useState<SimStatePayload | null>(null);
  const [iframeLoading, setIframeLoading] = useState(false);
  const [modelLoadState, setModelLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [modelLoadMessage, setModelLoadMessage] = useState<string | undefined>();
  const daemonUrl = `http://${daemonTarget}/`;
  const action = latestAction(actions);
  const daemonState = useReachyDaemonState(daemonTarget, view === "live3d");
  const liveFrame = daemonState.frame ?? simState?.state ?? null;

  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    const poll = async () => {
      try {
        const next = await api.getSimState();
        if (!cancelled) {
          setSimState(next);
        }
      } catch (error) {
        if (!cancelled) {
          setSimState({
            available: false,
            target: daemonTarget,
            error: error instanceof Error ? error.message : "Simulation state unavailable",
          });
        }
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(poll, robot.connected ? 1200 : 2500);
        }
      }
    };

    poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [daemonTarget, robot.connected]);

  const handleModelLoadState = useCallback((state: "loading" | "ready" | "error", message?: string) => {
    setModelLoadState(state);
    setModelLoadMessage(message);
  }, []);

  const metrics = useMemo(() => metricFrame(liveFrame), [liveFrame]);
  const statusText = daemonState.connected
    ? "state ws live"
    : simState?.available
      ? `${simState.daemon?.state ?? "running"} · REST`
      : "unavailable";

  return (
    <section className="rounded-lg border border-slate-800 bg-[#11151d] p-4 shadow-xl shadow-black/20">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Live 3D Simulation</h2>
          <div className="mt-1 font-mono text-xs text-slate-500">{daemonTarget}</div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs ${
              daemonState.connected || simState?.available
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-red-500/15 text-red-300"
            }`}
          >
            {statusText}
          </span>
          <div className="flex rounded-md border border-slate-700 bg-[#0b0f16] p-1">
            <button
              onClick={() => setView("live3d")}
              className={`rounded px-2 py-1 text-xs ${view === "live3d" ? "bg-cyan-500 text-slate-950" : "text-slate-300"}`}
            >
              Live 3D
            </button>
            <button
              onClick={() => setView("dashboard")}
              className={`rounded px-2 py-1 text-xs ${view === "dashboard" ? "bg-cyan-500 text-slate-950" : "text-slate-300"}`}
            >
              Daemon
            </button>
          </div>
          <a
            href={daemonUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:border-cyan-500 hover:text-cyan-200"
            title="Open daemon dashboard"
          >
            <ExternalLink size={15} />
          </a>
        </div>
      </div>

      <div className="relative min-h-[520px] overflow-hidden rounded-md border border-slate-800 bg-[#070b12]">
        {view === "dashboard" ? (
          <>
            {iframeLoading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#080b11] text-sm text-slate-500">
                <RotateCw className="mr-2 animate-spin" size={16} />
                Loading
              </div>
            ) : null}
            <iframe
              title="Reachy daemon dashboard"
              src={daemonUrl}
              className="h-[540px] w-full border-0 bg-white"
              onLoad={() => setIframeLoading(false)}
              onLoadStart={() => setIframeLoading(true)}
            />
          </>
        ) : (
          <>
            <Canvas
              camera={{ position: [-0.28, 0.35, 0.58], fov: 48 }}
              dpr={[1, 2]}
              shadows
              gl={{
                antialias: true,
                alpha: false,
                preserveDrawingBuffer: true,
                powerPreference: "high-performance",
                toneMapping: THREE.ACESFilmicToneMapping,
                toneMappingExposure: 1,
              }}
              className="w-full"
              style={{ width: "100%", height: "560px", display: "block" }}
              onCreated={({ gl }) => {
                gl.setClearColor(0x070b12, 1);
                gl.sortObjects = false;
              }}
            >
              <color attach="background" args={["#070b12"]} />
              <fog attach="fog" args={["#070b12", 0.9, 2.2]} />
              <ambientLight intensity={0.45} />
              <directionalLight position={[2, 4, 2]} intensity={2.1} castShadow />
              <directionalLight position={[-2, 1.5, 1.5]} intensity={0.5} />
              <directionalLight position={[0, 2.2, -2]} intensity={0.9} color="#6ee7f9" />
              <gridHelper args={[1.25, 16, "#334155", "#172033"]} position={[0, -0.035, 0]} />
              <ReachyUrdfModel frame={liveFrame} onLoadStateChange={handleModelLoadState} />
              <OrbitControls
                enablePan={false}
                enableRotate={true}
                enableZoom={true}
                enableDamping={true}
                dampingFactor={0.05}
                target={[0, 0.18, 0]}
                minDistance={0.2}
                maxDistance={0.8}
              />
            </Canvas>

            <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-slate-800 bg-[#0b0f16]/90 px-3 py-2 font-mono text-xs text-slate-400">
              <div>robot={robot.mode}</div>
              <div>connected={String(robot.connected)}</div>
              <div>last_action={robot.last_action ?? action?.action ?? "none"}</div>
              <div>model={modelLoadState}</div>
            </div>

            <div className="absolute bottom-4 left-4 right-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              <Metric label="Body Yaw" value={`${metrics.bodyYaw.toFixed(1)} deg`} />
              <Metric label="Antenna L" value={`${metrics.leftAntenna.toFixed(1)} deg`} />
              <Metric label="Antenna R" value={`${metrics.rightAntenna.toFixed(1)} deg`} />
              <Metric label="Head Joints" value={metrics.headJoints ? `${metrics.headJoints}` : "n/a"} />
            </div>

            {modelLoadState === "loading" ? (
              <div className="absolute inset-0 flex items-center justify-center bg-[#070b12]/55 text-sm text-slate-300">
                <RotateCw className="mr-2 animate-spin" size={16} />
                Loading Reachy Mini model
              </div>
            ) : null}

            {modelLoadState === "error" ? (
              <div className="absolute right-4 top-4 max-w-sm rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {modelLoadMessage ?? "Reachy Mini model failed to load"}
              </div>
            ) : null}

            {!daemonState.connected ? (
              <div className="absolute right-4 top-4 max-w-sm rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                {daemonState.error ?? "Waiting for daemon state WebSocket"}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-[#0b0f16]/95 px-3 py-2">
      <div className="text-[11px] uppercase text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-sm text-slate-100">{value}</div>
    </div>
  );
}
