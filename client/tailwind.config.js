/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#1b1b22',
        surface: '#25252d',
        'surface-high': '#30303a',
        'surface-highest': '#3a3a46',
        outline: '#34343f',
        text: '#f3f4f6',
        muted: '#979cab',
        primary: '#6867f0',
        'primary-strong': '#7473f6',
        danger: '#dc4f6b',
        'danger-strong': '#eb5d79',
        success: '#52c97d',
        warning: '#f2a64b',
      },
      boxShadow: {
        panel: 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 26px 50px rgba(0, 0, 0, 0.26)',
        action: 'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      letterSpacing: {
        brand: '-0.045em',
      },
    },
  },
  plugins: [],
};
