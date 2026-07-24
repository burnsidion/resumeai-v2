<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    autocomplete?: string
    disabled?: boolean
    error?: string
    hint?: string
    id: string
    inputmode?: 'email' | 'text'
    label: string
    modelValue: string
    name?: string
    type?: 'email' | 'password' | 'text'
  }>(),
  {
    autocomplete: undefined,
    disabled: false,
    error: undefined,
    hint: undefined,
    inputmode: undefined,
    name: undefined,
    type: 'text',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const input = useTemplateRef<HTMLInputElement>('input')
const passwordIsVisible = ref(false)
const supportingTextId = computed(() =>
  props.error || props.hint ? `${props.id}-supporting-text` : undefined,
)
const resolvedType = computed(() =>
  props.type === 'password' && passwordIsVisible.value ? 'text' : props.type,
)

const focus = () => input.value?.focus()

defineExpose({ focus })
</script>

<template>
  <div>
    <div class="mb-2 flex items-baseline justify-between gap-4">
      <label :for="id" class="text-sm font-medium">
        {{ label }}
      </label>
      <button
        v-if="type === 'password'"
        class="text-muted hover:text-foreground disabled:text-muted/50 rounded-sm text-xs font-medium transition-colors"
        type="button"
        :disabled="disabled"
        :aria-label="passwordIsVisible ? `Hide ${label}` : `Show ${label}`"
        @click="passwordIsVisible = !passwordIsVisible"
      >
        {{ passwordIsVisible ? 'Hide' : 'Show' }}
      </button>
    </div>

    <input
      :id="id"
      ref="input"
      :value="modelValue"
      :type="resolvedType"
      :autocomplete="autocomplete"
      :inputmode="inputmode"
      :name="name ?? id"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="supportingTextId"
      class="bg-raised text-foreground placeholder:text-muted/60 border-line hover:border-muted/60 focus:border-focus focus:ring-focus/15 disabled:bg-high/60 disabled:text-muted h-[3.125rem] w-full rounded-xl border px-3.5 text-[0.9375rem] transition-[border-color,box-shadow,background-color] focus:ring-4 focus:outline-none disabled:cursor-not-allowed"
      @input="
        emit('update:modelValue', ($event.target as HTMLInputElement).value)
      "
    />

    <p
      v-if="error || hint"
      :id="supportingTextId"
      :class="error ? 'text-danger' : 'text-muted'"
      class="mt-2 text-xs leading-5"
      :aria-live="error ? 'polite' : undefined"
    >
      {{ error ?? hint }}
    </p>
  </div>
</template>
