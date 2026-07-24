<script setup lang="ts">
defineProps<{
  description: string
  eyebrow?: string
  title: string
}>()

const headingId = useId()
</script>

<template>
  <section
    :aria-labelledby="headingId"
    class="auth-elevation bg-surface border-line rounded-[1.25rem] border p-6 sm:p-8"
  >
    <header class="mb-7">
      <p
        v-if="eyebrow"
        class="text-accent mb-3 text-xs font-semibold tracking-[0.16em] uppercase"
      >
        {{ eyebrow }}
      </p>
      <h1
        :id="headingId"
        class="text-[1.75rem] leading-tight font-semibold tracking-[-0.035em]"
      >
        {{ title }}
      </h1>
      <p class="text-muted mt-3 text-[0.9375rem] leading-6">
        {{ description }}
      </p>
    </header>

    <slot />

    <footer v-if="$slots.footer" class="border-line mt-7 border-t pt-6">
      <slot name="footer" />
    </footer>
  </section>
</template>
