/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Nunito"', '"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
