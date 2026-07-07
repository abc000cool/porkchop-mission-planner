export default function App() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="font-mono text-xs tracking-[0.3em] text-accent uppercase">
        Mission Control Initializing
      </div>
      <h1 className="text-3xl font-semibold text-text-hi">
        Porkchop <span className="text-text-lo">/</span> Interplanetary Mission
        Planner
      </h1>
      <p className="font-mono text-sm text-text-mid">
        T-minus: deployment pipeline verified. Physics core loading next.
      </p>
    </div>
  );
}
