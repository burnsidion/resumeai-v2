<script setup lang="ts">
import type { AuthenticationError } from '~~/shared/authentication/types'

defineProps<{
  email: string | null
  signOut: () => Promise<AuthenticationError | null>
}>()

const config = useRuntimeConfig()
const route = useRoute()

const primaryNavigation = [
  {
    icon: 'dashboard',
    label: 'Dashboard',
    to: '/dashboard',
  },
  {
    icon: 'applications',
    label: 'Applications',
  },
  {
    icon: 'resume',
    label: 'Base resumes',
  },
] as const

const secondaryNavigation = [
  {
    icon: 'help',
    label: 'Help',
  },
  {
    icon: 'settings',
    label: 'Settings',
  },
] as const
</script>

<template>
  <aside
    class="bg-panel border-line sticky top-0 hidden h-dvh w-[13.5rem] flex-col border-r xl:flex"
    aria-label="Authenticated application sidebar"
  >
    <div class="flex min-h-0 flex-1 flex-col px-3 py-6">
      <NuxtLink
        to="/dashboard"
        class="focus-visible:outline-focus mb-9 w-fit rounded-lg px-3 py-2 text-[1.0625rem] font-semibold tracking-[-0.025em]"
      >
        {{ config.public.appName }}
      </NuxtLink>

      <nav aria-label="Primary navigation">
        <ul class="space-y-1.5">
          <li v-for="item in primaryNavigation" :key="item.label">
            <NuxtLink
              v-if="'to' in item"
              :to="item.to"
              :aria-current="route.path === item.to ? 'page' : undefined"
              class="text-muted hover:bg-raised hover:text-foreground focus-visible:outline-focus flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors"
              :class="{
                'bg-raised text-accent': route.path === item.to,
              }"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                aria-hidden="true"
                class="size-5 shrink-0"
              >
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
              <span>{{ item.label }}</span>
            </NuxtLink>

            <div
              v-else
              aria-disabled="true"
              class="text-muted/60 flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium"
              title="This destination is not available yet"
            >
              <svg
                v-if="item.icon === 'applications'"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
                class="size-5 shrink-0"
              >
                <path
                  d="M9 7V5.75A1.75 1.75 0 0 1 10.75 4h2.5A1.75 1.75 0 0 1 15 5.75V7"
                />
                <rect x="3" y="7" width="18" height="13" rx="2" />
                <path d="M3 12.5h18M9.5 12.5v1h5v-1" />
              </svg>
              <svg
                v-else
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
                class="size-5 shrink-0"
              >
                <path d="M6 3h8l4 4v14H6z" />
                <path d="M14 3v5h5M9 13h6M9 17h6" />
              </svg>
              <span>{{ item.label }}</span>
              <span class="sr-only">Not available yet</span>
            </div>
          </li>
        </ul>
      </nav>

      <nav class="mt-auto" aria-label="Secondary navigation">
        <ul class="border-line space-y-1.5 border-t pt-5">
          <li v-for="item in secondaryNavigation" :key="item.label">
            <div
              aria-disabled="true"
              class="text-muted/60 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium"
              title="This destination is not available yet"
            >
              <svg
                v-if="item.icon === 'help'"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
                class="size-5 shrink-0"
              >
                <circle cx="12" cy="12" r="9" />
                <path
                  d="M9.7 9a2.4 2.4 0 1 1 3.7 2c-.8.5-1.4.9-1.4 2M12 17h.01"
                />
              </svg>
              <svg
                v-else
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
                class="size-5 shrink-0"
              >
                <circle cx="12" cy="12" r="3" />
                <path
                  d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"
                />
              </svg>
              <span>{{ item.label }}</span>
              <span class="sr-only">Not available yet</span>
            </div>
          </li>
        </ul>
      </nav>
    </div>

    <AuthIdentity :email="email" :sign-out="signOut" />
  </aside>
</template>
