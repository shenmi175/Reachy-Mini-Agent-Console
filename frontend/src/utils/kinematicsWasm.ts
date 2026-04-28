type KinematicsWasmModule = {
  default: () => Promise<unknown>;
  calculate_passive_joints: (headJoints: Float64Array, headPose: Float64Array) => Float64Array;
};

let loadPromise: Promise<KinematicsWasmModule> | null = null;

async function loadKinematicsWasm() {
  if (!loadPromise) {
    loadPromise = import("./kinematics-wasm/reachy_mini_kinematics_wasm.js").then(async (module) => {
      const wasm = module as KinematicsWasmModule;
      await wasm.default();
      return wasm;
    });
  }
  return loadPromise;
}

export async function calculatePassiveJoints(headJoints: number[], headPose: number[]) {
  const wasm = await loadKinematicsWasm();
  const result = wasm.calculate_passive_joints(new Float64Array(headJoints), new Float64Array(headPose));
  return Array.from(result);
}
