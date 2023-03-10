/**
 * main.ts
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

// Components
import App from './App.vue'
import axios from 'axios'
import VueAxios from 'vue-axios'
import { initializeApp } from 'firebase/app'
// Composables
import { createApp } from 'vue'
// Plugins
import { registerPlugins } from '@/plugins'

const app = createApp(App)
app.use(VueAxios, axios)
app.provide('axios', app.config.globalProperties.axios)

registerPlugins(app)

app.mount('#app')
