import React from 'react';

const sizeMap = { sm: 'neu-card-sm', md: 'neu-card', lg: 'neu-card-lg' };

export default function NeumorphCard({ children, className = '', size = 'md', hover = false, inset = false, onClick }) {
  const base = inset ? 'neu-inset' : sizeMap[size] || 'neu-card';
  const hoverClass = hover ? 'neu-card-hover cursor-pointer' : '';
  return (
    <div
      className={`${base} ${hoverClass} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
