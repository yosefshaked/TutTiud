import type { Config } from 'tailwindcss'
import tailwindcssAnimate from 'tailwindcss-animate'
import tailwindcssRtl from 'tailwindcss-rtl'
import forms from '@tailwindcss/forms'

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      colors: {
        border: 'hsl(210 10% 86%)',
        input: 'hsl(210 10% 94%)',
        ring: 'hsl(210 100% 50%)',
        background: 'hsl(210 20% 98%)',
        foreground: 'hsl(210 25% 10%)',
        primary: {
          DEFAULT: 'hsl(217 91% 60%)',
          foreground: '#ffffff'
        },
        secondary: {
          DEFAULT: 'hsl(210 16% 92%)',
          foreground: 'hsl(210 25% 10%)'
        },
        muted: {
          DEFAULT: 'hsl(210 16% 96%)',
          foreground: 'hsl(210 25% 40%)'
        },
        accent: {
          DEFAULT: 'hsl(210 100% 88%)',
          foreground: 'hsl(210 30% 15%)'
        },
        destructive: {
          DEFAULT: 'hsl(0 72% 51%)',
          foreground: '#ffffff'
        },
        card: {
          DEFAULT: '#ffffff',
          foreground: 'hsl(210 25% 10%)'
        }
      },
      borderRadius: {
        lg: '0.5rem',
        md: 'calc(0.5rem - 2px)',
        sm: 'calc(0.5rem - 4px)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [tailwindcssAnimate, tailwindcssRtl, forms]
}

export default config
