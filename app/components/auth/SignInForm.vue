<script setup lang="ts">
import { createAuthenticationError } from '~~/shared/authentication/errors'
import {
  signInCredentialsSchema,
  type SignInCredentials,
} from '~~/shared/authentication/schemas'
import type { AuthenticationError } from '~~/shared/authentication/types'

const props = defineProps<{
  submit: (
    credentials: SignInCredentials,
  ) => Promise<AuthenticationError | null>
}>()

interface FocusableField {
  focus(): void
}

const email = ref('')
const password = ref('')
const pending = ref(false)
const providerError = ref<AuthenticationError | null>(null)
const fieldErrors = reactive<{
  email?: string
  password?: string
}>({})
const emailField = ref<FocusableField | null>(null)
const passwordField = ref<FocusableField | null>(null)

watch(email, () => {
  fieldErrors.email = undefined
  providerError.value = null
})

watch(password, () => {
  fieldErrors.password = undefined
  providerError.value = null
})

const focusFirstInvalidField = async () => {
  await nextTick()

  if (fieldErrors.email) {
    emailField.value?.focus()
  } else if (fieldErrors.password) {
    passwordField.value?.focus()
  }
}

const handleSubmit = async () => {
  if (pending.value) {
    return
  }

  providerError.value = null
  fieldErrors.email = undefined
  fieldErrors.password = undefined

  const result = signInCredentialsSchema.safeParse({
    email: email.value,
    password: password.value,
  })

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors
    fieldErrors.email = errors.email?.[0]
    fieldErrors.password = errors.password?.[0]
    await focusFirstInvalidField()
    return
  }

  pending.value = true

  try {
    providerError.value = await props.submit(result.data)
  } catch {
    providerError.value = createAuthenticationError('unknown')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <form
    class="space-y-5"
    novalidate
    :aria-busy="pending"
    @submit.prevent="handleSubmit"
  >
    <AuthNotice
      v-if="providerError"
      :message="providerError.message"
      tone="danger"
    />

    <AuthFormField
      id="sign-in-email"
      ref="emailField"
      v-model="email"
      autocomplete="email"
      inputmode="email"
      label="Email address"
      name="email"
      type="email"
      :disabled="pending"
      :error="fieldErrors.email"
    />

    <AuthFormField
      id="sign-in-password"
      ref="passwordField"
      v-model="password"
      autocomplete="current-password"
      label="Password"
      name="password"
      type="password"
      :disabled="pending"
      :error="fieldErrors.password"
    />

    <AuthSubmitButton :pending="pending" pending-label="Signing in">
      Sign in
    </AuthSubmitButton>
  </form>
</template>
