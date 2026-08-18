<script setup lang="ts">
import ShellNavigationIcon from '~/components/shell/ShellNavigationIcon.vue'
import type { AuthenticationError } from '~~/shared/authentication/types'

const props = defineProps<{
  email: string | null
  signOut: () => Promise<AuthenticationError | null>
}>()

const config = useRuntimeConfig()
const route = useRoute()
const mobileNavigationId = useId()
const mobileNavigationHeadingId = useId()
const compactAccountHeadingId = useId()
const mobileNavigationOpen = ref(false)
const compactAccountOpen = ref(false)
const mobileMenuButton = useTemplateRef<HTMLButtonElement>('mobileMenuButton')
const mobileDrawer = useTemplateRef<HTMLElement>('mobileDrawer')
const compactAccountButton = useTemplateRef<HTMLButtonElement>(
  'compactAccountButton',
)
const compactAccountPanel = useTemplateRef<HTMLElement>('compactAccountPanel')
let previousBodyOverflow = ''

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
    to: '/base-resumes',
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

const accountInitial = computed(
  () => props.email?.trim().charAt(0).toUpperCase() || 'A',
)

const isCurrentRoute = (destination: string): boolean =>
  route.path === destination || route.path.startsWith(`${destination}/`)

const getFocusableElements = (container: HTMLElement | null): HTMLElement[] =>
  Array.from(
    container?.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]',
    ) ?? [],
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.hasAttribute('disabled') &&
      element.getAttribute('aria-hidden') !== 'true',
  )

const closeMobileNavigation = (restoreFocus = true): void => {
  if (!mobileNavigationOpen.value) {
    return
  }

  mobileNavigationOpen.value = false
  document.body.style.overflow = previousBodyOverflow

  if (restoreFocus) {
    nextTick(() => mobileMenuButton.value?.focus())
  }
}

const openMobileNavigation = async (): Promise<void> => {
  if (mobileNavigationOpen.value) {
    return
  }

  compactAccountOpen.value = false
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  mobileNavigationOpen.value = true

  await nextTick()
  getFocusableElements(mobileDrawer.value)[0]?.focus()
}

const closeCompactAccount = (restoreFocus = true): void => {
  if (!compactAccountOpen.value) {
    return
  }

  compactAccountOpen.value = false

  if (restoreFocus) {
    nextTick(() => compactAccountButton.value?.focus())
  }
}

const toggleCompactAccount = async (): Promise<void> => {
  if (compactAccountOpen.value) {
    closeCompactAccount()
    return
  }

  compactAccountOpen.value = true
  await nextTick()
  compactAccountPanel.value?.focus()
}

const handleNavigationSelection = (): void => {
  closeMobileNavigation()
  closeCompactAccount(false)
}

const handleDocumentKeydown = (event: KeyboardEvent): void => {
  if (mobileNavigationOpen.value) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMobileNavigation()
      return
    }

    if (event.key !== 'Tab') {
      return
    }

    const focusableElements = getFocusableElements(mobileDrawer.value)

    if (focusableElements.length === 0) {
      event.preventDefault()
      mobileDrawer.value?.focus()
      return
    }

    const firstElement = focusableElements[0]
    const lastElement = focusableElements.at(-1)
    const activeElement = document.activeElement

    if (
      event.shiftKey &&
      (activeElement === firstElement ||
        !mobileDrawer.value?.contains(activeElement))
    ) {
      event.preventDefault()
      lastElement?.focus()
    } else if (
      !event.shiftKey &&
      (activeElement === lastElement ||
        !mobileDrawer.value?.contains(activeElement))
    ) {
      event.preventDefault()
      firstElement?.focus()
    }

    return
  }

  if (compactAccountOpen.value && event.key === 'Escape') {
    event.preventDefault()
    closeCompactAccount()
  }
}

const handleDocumentPointerdown = (event: PointerEvent): void => {
  if (!compactAccountOpen.value || !(event.target instanceof Node)) {
    return
  }

  if (
    compactAccountPanel.value?.contains(event.target) ||
    compactAccountButton.value?.contains(event.target)
  ) {
    return
  }

  closeCompactAccount(false)
}

watch(
  () => route.path,
  () => {
    closeMobileNavigation(false)
    closeCompactAccount(false)
  },
)

onMounted(() => {
  document.addEventListener('keydown', handleDocumentKeydown)
  document.addEventListener('pointerdown', handleDocumentPointerdown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleDocumentKeydown)
  document.removeEventListener('pointerdown', handleDocumentPointerdown)

  if (mobileNavigationOpen.value) {
    document.body.style.overflow = previousBodyOverflow
  }
})
</script>

<template>
  <div class="contents">
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
                :aria-current="isCurrentRoute(item.to) ? 'page' : undefined"
                class="text-muted hover:bg-raised hover:text-foreground focus-visible:outline-focus flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors"
                :class="{
                  'bg-raised text-accent': isCurrentRoute(item.to),
                }"
                @click="handleNavigationSelection"
              >
                <ShellNavigationIcon :icon="item.icon" />
                <span>{{ item.label }}</span>
              </NuxtLink>

              <div
                v-else
                aria-disabled="true"
                class="text-muted/60 flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium"
                title="This destination is not available yet"
              >
                <ShellNavigationIcon :icon="item.icon" />
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
                <ShellNavigationIcon :icon="item.icon" />
                <span>{{ item.label }}</span>
                <span class="sr-only">Not available yet</span>
              </div>
            </li>
          </ul>
        </nav>
      </div>

      <AuthIdentity :email="email" :sign-out="signOut" />
    </aside>

    <aside
      class="bg-panel border-line sticky top-0 hidden h-dvh w-[4.5rem] flex-col items-center border-r px-2 py-5 md:flex xl:hidden"
      aria-label="Collapsed authenticated navigation"
    >
      <NuxtLink
        to="/dashboard"
        :aria-label="config.public.appName"
        class="border-accent/30 text-accent focus-visible:outline-focus grid size-10 place-items-center rounded-xl border text-xs font-extrabold"
      >
        RA
      </NuxtLink>

      <nav class="mt-8 w-full" aria-label="Collapsed primary navigation">
        <ul class="space-y-2">
          <li v-for="item in primaryNavigation" :key="item.label">
            <NuxtLink
              v-if="'to' in item"
              :to="item.to"
              :aria-label="item.label"
              :title="item.label"
              :aria-current="isCurrentRoute(item.to) ? 'page' : undefined"
              class="text-muted hover:bg-raised hover:text-foreground focus-visible:outline-focus relative grid min-h-12 place-items-center rounded-xl transition-colors"
              :class="{
                'bg-raised text-accent': isCurrentRoute(item.to),
              }"
              @click="handleNavigationSelection"
            >
              <span
                v-if="isCurrentRoute(item.to)"
                class="bg-accent absolute top-2 bottom-2 -left-2 w-0.5 rounded-full"
                aria-hidden="true"
              />
              <ShellNavigationIcon :icon="item.icon" />
            </NuxtLink>

            <div
              v-else
              :aria-label="`${item.label}, not available yet`"
              aria-disabled="true"
              :title="`${item.label} · Not available yet`"
              class="text-muted/45 grid min-h-12 place-items-center rounded-xl"
            >
              <ShellNavigationIcon :icon="item.icon" />
            </div>
          </li>
        </ul>
      </nav>

      <nav
        class="border-line mt-auto w-full border-t pt-3"
        aria-label="Collapsed secondary navigation"
      >
        <ul class="space-y-1">
          <li v-for="item in secondaryNavigation" :key="item.label">
            <div
              :aria-label="`${item.label}, not available yet`"
              aria-disabled="true"
              :title="`${item.label} · Not available yet`"
              class="text-muted/45 grid min-h-11 place-items-center rounded-xl"
            >
              <ShellNavigationIcon :icon="item.icon" />
            </div>
          </li>
        </ul>
      </nav>

      <div class="relative mt-3">
        <button
          ref="compactAccountButton"
          type="button"
          class="border-accent text-accent focus-visible:outline-focus grid size-10 place-items-center rounded-full border text-xs font-bold"
          aria-label="Open account menu"
          aria-haspopup="dialog"
          :aria-expanded="compactAccountOpen"
          :aria-controls="
            compactAccountOpen ? compactAccountHeadingId : undefined
          "
          @click="toggleCompactAccount"
        >
          {{ accountInitial }}
        </button>

        <section
          v-if="compactAccountOpen"
          :id="compactAccountHeadingId"
          ref="compactAccountPanel"
          role="dialog"
          aria-label="Account menu"
          tabindex="-1"
          class="bg-panel border-line auth-elevation absolute bottom-0 left-[calc(100%+0.75rem)] z-40 w-72 rounded-2xl border outline-none"
        >
          <AuthIdentity :email="email" :sign-out="signOut" />
        </section>
      </div>
    </aside>

    <header
      class="bg-panel/96 border-line fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between border-b px-4 backdrop-blur-md md:hidden"
    >
      <NuxtLink
        to="/dashboard"
        class="focus-visible:outline-focus rounded-lg text-base font-semibold tracking-[-0.025em]"
      >
        {{ config.public.appName }}
      </NuxtLink>
      <button
        ref="mobileMenuButton"
        type="button"
        class="border-line text-foreground focus-visible:outline-focus grid size-11 place-items-center rounded-xl border"
        aria-label="Open navigation"
        :aria-expanded="mobileNavigationOpen"
        :aria-controls="mobileNavigationId"
        @click="openMobileNavigation"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          aria-hidden="true"
          class="size-5"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
    </header>

    <div
      v-if="mobileNavigationOpen"
      class="bg-canvas/75 fixed inset-x-0 top-16 bottom-0 z-40 backdrop-blur-sm md:hidden"
      @click.self="closeMobileNavigation()"
    >
      <section
        :id="mobileNavigationId"
        ref="mobileDrawer"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="mobileNavigationHeadingId"
        tabindex="-1"
        class="bg-panel border-line flex h-full w-[min(22rem,calc(100%-2rem))] flex-col border-r outline-none"
      >
        <header
          class="border-line flex min-h-16 items-center justify-between border-b px-5"
        >
          <h2 :id="mobileNavigationHeadingId" class="text-sm font-semibold">
            Navigation
          </h2>
          <button
            type="button"
            class="text-muted hover:bg-raised hover:text-foreground focus-visible:outline-focus grid size-11 place-items-center rounded-xl"
            aria-label="Close navigation"
            @click="closeMobileNavigation()"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              aria-hidden="true"
              class="size-5"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div class="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5">
          <nav aria-label="Mobile primary navigation">
            <ul class="space-y-1.5">
              <li v-for="item in primaryNavigation" :key="item.label">
                <NuxtLink
                  v-if="'to' in item"
                  :to="item.to"
                  :aria-current="isCurrentRoute(item.to) ? 'page' : undefined"
                  class="text-muted hover:bg-raised hover:text-foreground focus-visible:outline-focus flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors"
                  :class="{
                    'bg-raised text-accent': isCurrentRoute(item.to),
                  }"
                  @click="handleNavigationSelection"
                >
                  <ShellNavigationIcon :icon="item.icon" />
                  <span>{{ item.label }}</span>
                </NuxtLink>

                <div
                  v-else
                  aria-disabled="true"
                  class="text-muted/50 flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium"
                >
                  <ShellNavigationIcon :icon="item.icon" />
                  <span>{{ item.label }}</span>
                  <span class="sr-only">Not available yet</span>
                </div>
              </li>
            </ul>
          </nav>

          <nav class="mt-auto pt-8" aria-label="Mobile secondary navigation">
            <ul class="border-line space-y-1.5 border-t pt-4">
              <li v-for="item in secondaryNavigation" :key="item.label">
                <div
                  aria-disabled="true"
                  class="text-muted/50 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium"
                >
                  <ShellNavigationIcon :icon="item.icon" />
                  <span>{{ item.label }}</span>
                  <span class="sr-only">Not available yet</span>
                </div>
              </li>
            </ul>
          </nav>
        </div>

        <AuthIdentity :email="email" :sign-out="signOut" />
      </section>
    </div>
  </div>
</template>
