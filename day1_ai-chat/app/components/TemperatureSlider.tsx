'use client';

interface TemperatureSliderProps {
  value: number;
  onChange: (value: number) => void;
}

export default function TemperatureSlider({ value, onChange }: TemperatureSliderProps) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor="temperature" className="text-sm text-gray-500 whitespace-nowrap">
        Temperature: {value.toFixed(1)}
      </label>
      <input
        id="temperature"
        type="range"
        min={0}
        max={2}
        step={0.1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-32 cursor-pointer appearance-none rounded-full bg-gray-200 accent-blue-600"
      />
    </div>
  );
}
