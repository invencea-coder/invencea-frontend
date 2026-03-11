import React from 'react';

export default function NeumorphButton({
  children, onClick, variant = 'default', size = 'md',
  disabled = false, loading = false, className = '', type = 'button', icon,
}) {
  const sizeMap = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-7 py-3 text-base',
  };

  const variantMap = {
    default: 'neu-btn text-primary dark:text-darkText',
    primary: 'neu-btn neu-btn-primary',
    danger: 'neu-btn text-red-700 dark:text-red-400 hover:text-red-800',
    ghost: 'text-primary/60 dark:text-darkMuted hover:text-primary dark:hover:text-darkText transition-colors',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        inline-flex items-center gap-2 font-medium rounded-[10px] 
        transition-all duration-150 select-none
        disabled:opacity-40 disabled:cursor-not-allowed
        ${sizeMap[size]}
        ${variantMap[variant]}
        ${className}
      `}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : icon}
      {children}
    </button>
  );
}
