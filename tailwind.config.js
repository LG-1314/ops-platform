/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 深蓝专业风主题 token（与 shared/constants.ts、renderer/theme.ts 保持一致）
        primary: {
          DEFAULT: '#1E3A8A',
          dark: '#172554',
          light: '#3949AB',
        },
        surface: '#F5F7FA',
        card: '#FFFFFF',
        status: {
          ok: '#2E7D32',
          warn: '#ED6C02',
          error: '#D32F2F',
          unknown: '#9E9E9E',
        },
      },
      backgroundColor: {
        surface: '#F5F7FA',
      },
      borderRadius: {
        card: '12px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(16, 24, 40, 0.08), 0 1px 2px rgba(16, 24, 40, 0.04)',
      },
    },
  },
  plugins: [],
}
