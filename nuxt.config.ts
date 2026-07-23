import tailwindcss from '@tailwindcss/vite'

import { parseEnvironment } from './config/environment'

const environment = parseEnvironment(process.env)

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  css: ['~/assets/css/main.css'],
  devtools: { enabled: true },
  modules: ['@nuxt/eslint'],
  runtimeConfig: {
    public: {
      appName: environment.NUXT_PUBLIC_APP_NAME,
      supabasePublishableKey: environment.NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      supabaseUrl: environment.NUXT_PUBLIC_SUPABASE_URL,
    },
  },
  typescript: {
    strict: true,
    typeCheck: true,
  },
  vite: {
    plugins: [tailwindcss()],
  },
})
