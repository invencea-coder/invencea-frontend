/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
      colors: {
        surface: '#FDF5F5',
        highlight: '#FFFFFF',
        shadow: '#E8D5D5',
        primary: '#4A0000',
        accent: '#8B1A1A',
        muted: '#C4A0A0',
        success: '#2D6A4F',
        warning: '#B5451B',
        info: '#1B4B8B',
        darkSurface: '#3D0B0B',
        darkHighlight: '#521212',
        darkShadow: '#2A0707',
        darkText: '#FADADA',
        darkMuted: '#A06060',
      },
      borderRadius: {
        neu: '16px',
        'neu-sm': '10px',
        'neu-lg': '24px',
      },
      boxShadow: {
        neu: '8px 8px 16px #E8D5D5, -8px -8px 16px #FFFFFF',
        'neu-inset': 'inset 6px 6px 12px #E8D5D5, inset -6px -6px 12px #FFFFFF',
        'neu-sm': '4px 4px 8px #E8D5D5, -4px -4px 8px #FFFFFF',
        'neu-lg': '12px 12px 24px #E8D5D5, -12px -12px 24px #FFFFFF',
        'neu-dark': '8px 8px 16px #2A0707, -8px -8px 16px #521212',
        'neu-dark-inset': 'inset 6px 6px 12px #2A0707, inset -6px -6px 12px #521212',
        'neu-dark-sm': '4px 4px 8px #2A0707, -4px -4px 8px #521212',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease forwards',
        'slide-up': 'slideUp 0.4s ease forwards',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(20px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        pulseSoft: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.6 } },
      },
    },
  },
  plugins: [],
};
