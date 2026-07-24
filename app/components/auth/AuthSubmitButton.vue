<script setup lang="ts">
withDefaults(
  defineProps<{
    disabled?: boolean
    pending?: boolean
    pendingLabel?: string
  }>(),
  {
    disabled: false,
    pending: false,
    pendingLabel: 'Please wait',
  },
)
</script>

<template>
  <button
    type="submit"
    :disabled="disabled || pending"
    class="bg-accent text-canvas hover:bg-focus focus-visible:outline-focus disabled:bg-high disabled:text-muted flex h-[3.125rem] w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-[background-color,color,transform] hover:-translate-y-px active:translate-y-0 disabled:transform-none disabled:cursor-not-allowed"
  >
    <span
      v-if="pending"
      class="auth-spinner border-canvas/25 border-t-canvas size-4 rounded-full border-2"
      aria-hidden="true"
    />
    <span>{{ pending ? pendingLabel : undefined }}</span>
    <span v-if="!pending"><slot /></span>
  </button>
</template>
