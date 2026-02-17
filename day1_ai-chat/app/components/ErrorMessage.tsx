'use client';

interface ErrorMessageProps {
  error: Error;
  onRetry: () => void;
}

export default function ErrorMessage({ error, onRetry }: ErrorMessageProps) {
  const errorText = error.message || 'Something went wrong. Please try again.';

  return (
    <div className="mx-4 mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
      <svg
        className="h-5 w-5 flex-shrink-0 text-red-500"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
      <p className="flex-1 text-sm text-red-700">{errorText}</p>
      <button
        onClick={onRetry}
        className="text-sm font-medium text-red-700 underline transition-colors hover:text-red-900"
      >
        Retry
      </button>
    </div>
  );
}
