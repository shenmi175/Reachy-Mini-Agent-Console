import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import URDFLoader, { type URDFRobot } from "urdf-loader";

import type { ReachyStateFrame } from "../types/agent";
import { calculatePassiveJoints } from "../utils/kinematicsWasm";

const STEWART_JOINT_NAMES = [
  "stewart_1",
  "stewart_2",
  "stewart_3",
  "stewart_4",
  "stewart_5",
  "stewart_6",
] as const;

const PASSIVE_JOINT_NAMES = [
  "passive_1_x",
  "passive_1_y",
  "passive_1_z",
  "passive_2_x",
  "passive_2_y",
  "passive_2_z",
  "passive_3_x",
  "passive_3_y",
  "passive_3_z",
  "passive_4_x",
  "passive_4_y",
  "passive_4_z",
  "passive_5_x",
  "passive_5_y",
  "passive_5_z",
  "passive_6_x",
  "passive_6_y",
  "passive_6_z",
  "passive_7_x",
  "passive_7_y",
  "passive_7_z",
] as const;

const DEFAULT_HEAD_JOINTS = [
  0,
  -0.9848156658225817,
  1.2624661884298831,
  -0.24390294527381684,
  0.20555342557667577,
  -1.2363885150358267,
  1.0032234352772091,
] as const;

const DEFAULT_ANTENNAS = [-0.1745, 0.1745] as const;
const DEFAULT_HEAD_POSE = [
  0.911, 0.004, 0.413, -0.021,
  -0.004, 1, -0.001, 0.001,
  -0.413, -0.001, 0.911, -0.044,
  0, 0, 0, 1,
] as const;

interface Props {
  frame: ReachyStateFrame | null;
  onLoadStateChange?: (state: "loading" | "ready" | "error", message?: string) => void;
}

let cachedModelPromise: Promise<URDFRobot> | null = null;

function meshFilenameFromUrl(url: string) {
  return url.split("/").pop() ?? url;
}

function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return (object as THREE.Mesh).isMesh === true;
}

function getPrimaryMaterial(material: THREE.Material | THREE.Material[]) {
  return Array.isArray(material) ? material[0] : material;
}

function applyRobotMaterials(robot: URDFRobot) {
  robot.traverse((object) => {
    if (!isMesh(object)) return;

    object.castShadow = true;
    object.receiveShadow = true;

    const sourceMaterial = getPrimaryMaterial(object.material);
    const materialName = sourceMaterial?.name?.toLowerCase() ?? "";
    const stlName = String(object.userData.stlFileName ?? "").toLowerCase();
    const color =
      sourceMaterial && "color" in sourceMaterial && sourceMaterial.color instanceof THREE.Color
        ? sourceMaterial.color.getHex()
        : 0xffffff;

    if (object.geometry.attributes.normal) {
      object.geometry.deleteAttribute("normal");
    }
    object.geometry.computeVertexNormals();

    const isLens =
      materialName.includes("lens") ||
      stlName.includes("lens") ||
      stlName.includes("fisheye");
    const isAntenna = materialName.includes("antenna") || stlName.includes("antenna");
    const isCamera = materialName.includes("arducam") || stlName.includes("arducam");

    object.material = new THREE.MeshStandardMaterial({
      color: isLens ? 0x05070a : isAntenna ? 0x111827 : isCamera ? 0x2f3642 : color,
      flatShading: true,
      roughness: isLens ? 0.22 : 0.72,
      metalness: isAntenna || isLens ? 0.2 : 0.02,
      transparent: isLens,
      opacity: isLens ? 0.82 : 1,
    });
  });
}

async function loadRobotModel() {
  if (cachedModelPromise) {
    return cachedModelPromise;
  }

  cachedModelPromise = new Promise<URDFRobot>((resolve, reject) => {
    const manager = new THREE.LoadingManager();
    const loader = new URDFLoader(manager);
    let settled = false;

    manager.setURLModifier((url) => {
      if (!url.toLowerCase().endsWith(".stl")) {
        return url;
      }
      const filename = meshFilenameFromUrl(url);
      return `/robot-3d/meshes/${filename}`;
    });

    manager.onLoad = () => {
      settled = true;
    };

    manager.onError = (url) => {
      reject(new Error(`Failed to load robot mesh: ${url}`));
    };

    try {
      loader.load(
        "/robot-3d/reachy-mini.urdf",
        (loadedRobot) => {
          const finish = () => {
            applyRobotMaterials(loadedRobot);
            resolve(loadedRobot);
          };

          if (settled) {
            finish();
            return;
          }
          window.setTimeout(finish, 300);
        },
        undefined,
        (error) => reject(error instanceof Error ? error : new Error("Failed to load Reachy URDF")),
      );
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Failed to parse Reachy URDF"));
    }
  });

  return cachedModelPromise;
}

function setJoint(robot: URDFRobot, jointName: string, value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return;
  robot.setJointValue(jointName, value);
}

function matrixFromPose(pose: ReachyStateFrame["head_pose"]) {
  if (Array.isArray(pose) && pose.length === 16) {
    return pose;
  }
  if (pose && typeof pose === "object" && "m" in pose && Array.isArray(pose.m) && pose.m.length === 16) {
    return pose.m;
  }
  return null;
}

function poseMatrixForFrame(frame: ReachyStateFrame | null) {
  return (
    matrixFromPose(frame?.head_pose ?? null) ??
    matrixFromPose(frame?.target_head_pose ?? null) ??
    Array.from(DEFAULT_HEAD_POSE)
  );
}

function jointsForFrame(frame: ReachyStateFrame | null) {
  return Array.isArray(frame?.head_joints) && frame.head_joints.length >= 7
    ? frame.head_joints.slice(0, 7)
    : Array.from(DEFAULT_HEAD_JOINTS);
}

function applyPose(robot: URDFRobot, frame: ReachyStateFrame | null, computedPassiveJoints: number[] | null) {
  const headJoints = frame?.head_joints;

  if (Array.isArray(headJoints) && headJoints.length >= 7) {
    setJoint(robot, "yaw_body", headJoints[0]);
    STEWART_JOINT_NAMES.forEach((jointName, index) => {
      setJoint(robot, jointName, headJoints[index + 1]);
    });
  } else {
    setJoint(robot, "yaw_body", frame?.target_body_yaw ?? frame?.body_yaw ?? DEFAULT_HEAD_JOINTS[0]);
    STEWART_JOINT_NAMES.forEach((jointName, index) => setJoint(robot, jointName, DEFAULT_HEAD_JOINTS[index + 1]));
  }

  const passiveJoints = frame?.passive_joints ?? computedPassiveJoints;
  if (Array.isArray(passiveJoints) && passiveJoints.length >= PASSIVE_JOINT_NAMES.length) {
    PASSIVE_JOINT_NAMES.forEach((jointName, index) => {
      setJoint(robot, jointName, passiveJoints[index]);
    });
  }

  const antennas =
    frame?.target_antennas_position ??
    frame?.target_antennas ??
    frame?.antennas_position ??
    DEFAULT_ANTENNAS;

  if (Array.isArray(antennas) && antennas.length >= 2) {
    setJoint(robot, "left_antenna", -antennas[1]);
    setJoint(robot, "right_antenna", -antennas[0]);
  }

  robot.updateMatrixWorld(true);
}

export default function ReachyUrdfModel({ frame, onLoadStateChange }: Props) {
  const [robot, setRobot] = useState<URDFRobot | null>(null);
  const [computedPassiveJoints, setComputedPassiveJoints] = useState<number[] | null>(null);
  const frameRef = useRef<ReachyStateFrame | null>(frame);
  const computedPassiveRef = useRef<number[] | null>(null);
  const lastVersionRef = useRef<number>(-1);

  frameRef.current = frame;
  computedPassiveRef.current = computedPassiveJoints;

  const passiveInput = useMemo(() => {
    const passiveJoints = frame?.passive_joints;
    if (Array.isArray(passiveJoints) && passiveJoints.length >= PASSIVE_JOINT_NAMES.length) {
      return null;
    }
    return {
      version: frame?.dataVersion ?? 0,
      joints: jointsForFrame(frame),
      pose: poseMatrixForFrame(frame),
    };
  }, [frame]);

  useEffect(() => {
    if (!passiveInput) {
      setComputedPassiveJoints(null);
      return;
    }

    let cancelled = false;
    calculatePassiveJoints(passiveInput.joints, passiveInput.pose)
      .then((joints) => {
        if (!cancelled) {
          setComputedPassiveJoints(joints.length >= PASSIVE_JOINT_NAMES.length ? joints : null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setComputedPassiveJoints(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [passiveInput]);

  useEffect(() => {
    let mounted = true;
    onLoadStateChange?.("loading");

    loadRobotModel()
      .then((model) => {
        if (!mounted) return;
        const clone = model.clone(true) as URDFRobot;
        applyPose(clone, frameRef.current, computedPassiveRef.current);
        setRobot(clone);
        onLoadStateChange?.("ready");
      })
      .catch((error) => {
        if (!mounted) return;
        onLoadStateChange?.("error", error instanceof Error ? error.message : "Reachy model failed to load");
      });

    return () => {
      mounted = false;
    };
  }, [onLoadStateChange]);

  useFrame(() => {
    if (!robot) return;
    const currentFrame = frameRef.current;
    const nextVersion = currentFrame?.dataVersion ?? 0;
    if (nextVersion === lastVersionRef.current) return;
    lastVersionRef.current = nextVersion;
    applyPose(robot, currentFrame, computedPassiveRef.current);
  });

  useLayoutEffect(() => {
    if (!robot) return;
    applyPose(robot, frameRef.current, computedPassiveJoints);
  }, [robot, computedPassiveJoints]);

  if (!robot) {
    return null;
  }

  return (
    <group position={[0, -0.03, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <primitive object={robot} rotation={[-Math.PI / 2, 0, 0]} />
    </group>
  );
}
