// Planted bad component — do not import. Used to test code-reviewer profile.
// Deliberately violates R2 (inline props type), R3 (default export), R4 (no paired test).

export default function BadButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="p-2 bg-blue-500 text-white">
      {label}
    </button>
  );
}
