'use client';

interface StopSequencesInputProps {
  value: string;
  onChange: (value: string) => void;
}

export default function StopSequencesInput({ value, onChange }: StopSequencesInputProps) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="stop-sequences" className="text-sm text-gray-500 whitespace-nowrap">
        Stop sequences
      </label>
      <input
        id="stop-sequences"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. oh no, stop"
        size={30}
        className="rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
      />
    </div>
  );
}
