import React from 'react';

export default function NeumorphInput({
  label, id, error, icon, hint, className = '', ...props
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={id} className="text-xs font-semibold uppercase tracking-widest text-muted dark:text-darkMuted">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted dark:text-darkMuted pointer-events-none">
            {icon}
          </span>
        )}
        <input
          id={id}
          className={`neu-input ${icon ? 'pl-9' : ''} ${error ? 'ring-1 ring-red-400' : ''}`}
          {...props}
        />
      </div>
      {hint && !error && <p className="text-xs text-muted dark:text-darkMuted pl-1">{hint}</p>}
      {error && <p className="text-xs text-red-500 pl-1">{error}</p>}
    </div>
  );
}
