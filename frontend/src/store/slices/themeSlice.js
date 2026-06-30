import { createSlice } from '@reduxjs/toolkit';

const themeSlice = createSlice({
  name: 'theme',
  initialState: {
    darkMode: localStorage.getItem('darkMode') === 'true',
  },
  reducers: {
    toggleTheme: (state) => {
      state.darkMode = !state.darkMode;
      localStorage.setItem('darkMode', state.darkMode);
      document.documentElement.classList.toggle('dark', state.darkMode);
    },
    initTheme: (state) => {
      document.documentElement.classList.toggle('dark', state.darkMode);
    },
  },
});

export const { toggleTheme, initTheme } = themeSlice.actions;
export default themeSlice.reducer;
