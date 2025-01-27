// stores/index.js
import { createPinia } from 'pinia';

export const pinia = createPinia();

// Plugin to persist state in localStorage (optional)
pinia.use(({ store }) => {
  store.$subscribe((mutation, state) => {
    console.log('State changed:', mutation.type, state);
  });
});