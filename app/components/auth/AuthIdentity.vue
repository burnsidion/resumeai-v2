<script setup lang="ts">
import type { AuthenticationError } from '~~/shared/authentication/types'

const props = defineProps<{
  email: string | null
  signOut: () => Promise<AuthenticationError | null>
}>()

const headingId = useId()
const error = ref<AuthenticationError | null>(null)
const pending = ref(false)

const handleSignOut = async () => {
  if (pending.value) {
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
  <section
    :aria-labelledby="headingId"
    class="auth-elevation bg-surface border-line w-full max-w-lg rounded-[1.25rem] border p-6 sm:p-8"
  >
    <p
      class="text-success mb-3 text-xs font-semibold tracking-[0.16em] uppercase"
    >
      Signed in
    </p>
    <h1
      :id="headingId"
      class="text-[1.75rem] leading-tight font-semibold tracking-[-0.035em]"
    >
      Your session is active.
    </h1>
    <div class="border-line mt-7 border-t pt-6">
      <template v-if="email">
        <p class="text-muted text-sm">Signed in as</p>
        <p class="mt-2 text-sm font-medium break-all">{{ email }}</p>
      </template>
      <p v-else class="text-muted text-sm leading-6">
        Your authenticated account is ready.
      </p>
    </div>
    <div class="border-line mt-7 space-y-4 border-t pt-6">
      <AuthNotice v-if="error" :message="error.message" tone="danger" />
      <button
        type="button"
        :disabled="pending"
        class="border-line bg-raised text-foreground hover:bg-high focus-visible:outline-focus disabled:text-muted flex h-11 w-full items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed"
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
