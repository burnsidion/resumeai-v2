<script setup lang="ts">
withDefaults(
  defineProps<{
    message: string
    tone?: 'danger' | 'info' | 'success'
  }>(),
  {
    tone: 'info',
  },
)

const toneClasses = {
  danger: 'border-danger/35 bg-danger/8 text-danger',
  info: 'border-accent/30 bg-accent/8 text-foreground',
  success: 'border-success/30 bg-success/8 text-foreground',
} as const
</script>

<template>
  <div
    :class="toneClasses[tone]"
    class="rounded-xl border px-3.5 py-3 text-sm leading-5"
    :role="tone === 'danger' ? 'alert' : 'status'"
  >
    {{ message }}
  </div>
</template>
