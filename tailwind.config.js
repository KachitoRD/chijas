/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./admin.html",
    "./owner.html",
    "./legal.html",
    "./overlay.html",
    "./**/*.{html,js}",
  ],
  safelist: [
    // Emerald colors with opacity
    { pattern: /^bg-emerald-(300|400|500|600)(\/(10|20|30|40))?/ },
    { pattern: /^border-emerald-(300|400|500|600)(\/(10|20|30|40))?/ },
    { pattern: /^text-emerald-/ },
    
    // Zinc colors
    { pattern: /^(bg|border|text)-zinc-/ },
    
    // Amber colors
    { pattern: /^(bg|border|text)-amber-/ },
    
    // Rose colors
    { pattern: /^(bg|border|text)-rose-/ },
    
    // White with opacity
    { pattern: /^(bg|border)-white(\/(10|20|30|40|50))?/ },
    
    // Rounded
    { pattern: /^rounded-(xl|lg|full)/ },
    
    // Borders
    { pattern: /^border(-[btlrxy])?/ },
    
    // Common utilities
    'grid', 'flex', 'inline-flex', 'absolute', 'relative', 'fixed',
    'min-h-screen', 'min-h-full', 'w-full', 'h-full',
    'px-4', 'py-6', 'gap-4', 'gap-6', 'gap-10',
    'text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl',
    'font-bold', 'font-semibold', 'font-medium',
    'hover:border-emerald-300/40', 'hover:text-emerald-200',
    'focus:border-emerald-300/60', 'focus:outline-none',
    'placeholder:text-zinc-500',
    'col-span-full',
    'max-w-6xl', 'mx-auto',
    'overflow-hidden', 'overflow-y-auto',
    'bg-cover', 'bg-center', 'bg-contain',
    'object-cover',
    'shrink-0',
    'sr-only',
    'hidden',
    'tabular-nums',
  ],
  theme: {
    extend: {
      colors: {
        emerald: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#145231',
          950: '#052e16',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      maxWidth: {
        '6xl': '72rem',
      },
    },
  },
  plugins: [],
}

