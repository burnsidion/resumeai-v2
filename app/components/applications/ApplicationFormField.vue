<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    autocomplete?: string
    disabled?: boolean
    error?: string
    hint?: string
    id: string
    inputmode?: 'text' | 'url'
    label: string
    maxlength?: number
    modelValue: string
    multiline?: boolean
    name?: string
    optional?: boolean
    placeholder?: string
    rows?: number
    type?: 'text' | 'url'
  }>(),
  {
    autocomplete: undefined,
    disabled: false,
    error: undefined,
    hint: undefined,
    inputmode: undefined,
    maxlength: undefined,
    multiline: false,
    name: undefined,
    optional: false,
    placeholder: undefined,
    rows: 4,
    type: 'text',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const input = useTemplateRef<HTMLInputElement | HTMLTextAreaElement>('input')
const supportingTextId = computed(() =>
  props.error || props.hint ? `${props.id}-supporting-text` : undefined,
)

const updateValue = (event: Event): void => {
  emit(
    'update:modelValue',
    (event.target as HTMLInputElement | HTMLTextAreaElement).value,
  )
}

const focus = (): void => input.value?.focus()

defineExpose({ focus })
</script>

<template>
  <div class="grid min-w-0 gap-2">
    <label :for="id" class="w-fit text-xs font-semibold sm:text-sm">
      {{ label }}
      <span
        v-if="optional"
        class="text-muted/65 ml-1 text-[0.6875rem] font-medium"
      >
        Optional
      </span>
    </label>

    <textarea
      v-if="multiline"
      :id="id"
      ref="input"
      :value="modelValue"
      :name="name ?? id"
      :autocomplete="autocomplete"
      :disabled="disabled"
      :maxlength="maxlength"
      :placeholder="placeholder"
      :rows="rows"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="supportingTextId"
      class="bg-canvas/65 text-foreground placeholder:text-muted/50 border-line hover:border-muted/50 focus:border-focus focus:ring-focus/15 disabled:bg-high/50 disabled:text-muted min-h-28 w-full resize-y rounded-xl border px-3.5 py-3 font-[inherit] text-sm leading-6 transition-[border-color,box-shadow,background-color] focus:ring-4 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
      :class="error ? 'border-danger/70 ring-danger/10 ring-4' : undefined"
      @input="updateValue"
    />

    <input
      v-else
      :id="id"
      ref="input"
      :value="modelValue"
      :type="type"
      :name="name ?? id"
      :autocomplete="autocomplete"
      :disabled="disabled"
      :inputmode="inputmode"
      :maxlength="maxlength"
      :placeholder="placeholder"
      :required="!optional"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="supportingTextId"
      class="bg-canvas/65 text-foreground placeholder:text-muted/50 border-line hover:border-muted/50 focus:border-focus focus:ring-focus/15 disabled:bg-high/50 disabled:text-muted min-h-12 w-full rounded-xl border px-3.5 text-sm transition-[border-color,box-shadow,background-color] focus:ring-4 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
      :class="error ? 'border-danger/70 ring-danger/10 ring-4' : undefined"
      @input="updateValue"
    />

    <p
      v-if="error || hint"
      :id="supportingTextId"
      :class="error ? 'text-danger font-medium' : 'text-muted'"
      class="text-xs leading-5"
    >
      {{ error ?? hint }}
    </p>
  </div>
</template>
