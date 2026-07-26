<script setup lang="ts">
import type { AuthenticationError } from '~~/shared/authentication/types'

const props = defineProps<{
  email: string | null
  signOut: () => Promise<AuthenticationError | null>
}>()

const headingId = useId()
const error = ref<AuthenticationError | null>(null)
const hydrated = ref(false)
const pending = ref(false)
const accountLabel = computed(() => props.email ?? 'Authenticated account')
const accountInitial = computed(
  () => props.email?.trim().charAt(0).toUpperCase() || 'A',
)

onMounted(() => {
  hydrated.value = true
})

const handleSignOut = async () => {
  if (!hydrated.value || pending.value) {
    return
  }

  error.value = null
  pending.value = true

  try {
    error.value = await props.signOut()
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section :aria-labelledby="headingId" class="border-line border-t p-4">
    <div class="flex items-center gap-3">
      <span
        class="border-accent text-accent grid size-10 shrink-0 place-items-center rounded-full border text-sm font-semibold"
        aria-hidden="true"
      >
        {{ accountInitial }}
      </span>
      <div class="min-w-0">
        <h2 :id="headingId" class="text-xs font-semibold">Signed in</h2>
        <p class="text-muted mt-1 truncate text-xs" :title="email ?? undefined">
          {{ accountLabel }}
        </p>
      </div>
    </div>

    <div class="mt-4 space-y-3">
      <AuthNotice v-if="error" :message="error.message" tone="danger" />
      <button
        type="button"
        :disabled="!hydrated || pending"
        class="border-line bg-raised text-foreground hover:bg-high focus-visible:outline-focus disabled:text-muted flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed"
        @click="handleSignOut"
      >
        <span
          v-if="pending"
          class="auth-spinner border-muted/30 border-t-muted size-4 rounded-full border-2"
          aria-hidden="true"
        />
        <span>{{ pending ? 'Signing out' : 'Sign out' }}</span>
      </button>
    </div>
  </section>
</template>
