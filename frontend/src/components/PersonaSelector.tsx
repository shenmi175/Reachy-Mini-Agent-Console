import type { Persona } from "../types/agent";

interface Props {
  personas: Persona[];
  currentPersonaId: string;
  onSwitch: (personaId: string) => Promise<void>;
}

export default function PersonaSelector({ personas, currentPersonaId, onSwitch }: Props) {
  return (
    <section className="rounded-lg border border-slate-800 bg-[#11151d] p-4 shadow-xl shadow-black/20">
      <h2 className="mb-3 text-base font-semibold text-slate-100">Persona</h2>
      <div className="space-y-2">
        {personas.map((persona) => {
          const active = persona.id === currentPersonaId;
          return (
            <button
              key={persona.id}
              onClick={() => onSwitch(persona.id)}
              className={`w-full rounded-md border px-3 py-3 text-left transition ${
                active
                  ? "border-cyan-400 bg-cyan-500/10 text-cyan-100"
                  : "border-slate-700 bg-[#0b0f16] text-slate-200 hover:border-slate-500"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{persona.id}</span>
                <span className="text-xs text-slate-500">{persona.name}</span>
              </div>
              <div className="mt-1 text-xs leading-5 text-slate-400">{persona.style}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
