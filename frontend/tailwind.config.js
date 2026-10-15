export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
      boxShadow: { glow: '0 10px 40px -10px rgba(14,165,233,.45)' },
    },
  },
  plugins: [],
};
