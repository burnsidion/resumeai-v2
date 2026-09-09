<script setup lang="ts">
import type { BaseResumeManagementItemViewModel } from '~~/shared/base-resumes/view-model'

const props = defineProps<{
  disabled: boolean
  error?: string
  items: ReadonlyArray<BaseResumeManagementItemViewModel>
  modelValue: string | null
  status: 'error' | 'pending' | 'success'
}>()

const emit = defineEmits<{
  retry: []
  'update:modelValue': [value: string | null]
}>()

const descriptionId = useId()
const statusId = useId()
const firstOption = useTemplateRef<HTMLInputElement>('firstOption')

const selectResume = (id: string | null): void => {
  if (!props.disabled) {
    emit('update:modelValue', id)
  }
}

const focus = (): void => firstOption.value?.focus()

defineExpose({ focus })
</script>

<template>
  <div class="bg-surface border-line rounded-2xl border p-5 sm:p-6">
    <fieldset
      :disabled="disabled"
      :aria-describedby="`${descriptionId} ${statusId}`"
      :aria-busy="status === 'pending' || undefined"
      :aria-invalid="error ? 'true' : undefined"
      class="m-0 min-w-0 border-0 p-0 disabled:cursor-wait disabled:opacity-65"
    >
      <legend class="p-0 text-sm font-semibold">
        Base resume
        <span class="text-muted/65 ml-1 text-[0.6875rem] font-medium">
          Optional
        </span>
      </legend>
      <p :id="descriptionId" class="text-muted mt-2 text-xs leading-5">
        Choose the source you may tailor later. Your original PDF will never be
        changed.
      </p>

      <div class="mt-4 grid gap-2.5">
        <label
          class="border-line bg-canvas/50 hover:border-accent/30 hover:bg-raised/65 focus-within:outline-focus grid min-h-[4.25rem] cursor-pointer grid-cols-[1rem_minmax(0,1fr)] items-center gap-3 rounded-xl border p-3 transition-colors focus-within:outline-2 focus-within:outline-offset-2"
          :class="
            modelValue === null
              ? 'border-accent/50 bg-accent/[0.065]'
              : undefined
          "
        >
          <input
            ref="firstOption"
            type="radio"
            name="application-base-resume"
            :checked="modelValue === null"
            class="accent-accent size-4"
            @change="selectResume(null)"
          />
          <span class="min-w-0">
            <strong class="block text-xs font-semibold"
              >No base resume yet</strong
            >
            <span class="text-muted mt-1 block text-[0.6875rem]">
              You can choose one later
            </span>
          </span>
        </label>

        <label
          v-for="resume in items"
          :key="resume.id"
          class="border-line bg-canvas/50 hover:border-accent/30 hover:bg-raised/65 focus-within:outline-focus grid min-h-[4.25rem] cursor-pointer grid-cols-[1rem_2.25rem_minmax(0,1fr)] items-center gap-3 rounded-xl border p-3 transition-colors focus-within:outline-2 focus-within:outline-offset-2"
          :class="
            modelValue === resume.id
              ? 'border-accent/50 bg-accent/[0.065]'
              : undefined
          "
        >
          <input
            type="radio"
            name="application-base-resume"
            :value="resume.id"
            :checked="modelValue === resume.id"
            class="accent-accent size-4"
            @change="selectResume(resume.id)"
          />
          <span
            class="border-accent/25 bg-accent/[0.065] text-accent grid h-11 w-9 place-items-center rounded-lg border text-[0.5625rem] font-extrabold tracking-[0.08em]"
            aria-hidden="true"
          >
            PDF
          </span>
          <span class="min-w-0">
            <strong class="block truncate text-xs font-semibold">
              {{ resume.filename }}
            </strong>
            <span class="text-muted mt-1 block truncate text-[0.6875rem]">
              {{ resume.uploadedLabel }} · {{ resume.fileSizeLabel }}
            </span>
          </span>
        </label>
      </div>

      <div :id="statusId" class="mt-3 min-h-5 text-xs leading-5">
        <p v-if="error" class="text-danger font-medium" role="alert">
          {{ error }}
        </p>
        <p v-else-if="status === 'pending'" class="text-muted" role="status">
          Loading active base resumes…
        </p>
        <div
          v-else-if="status === 'error'"
          class="border-danger/25 bg-danger/[0.055] rounded-xl border p-3"
          role="alert"
        >
          <p class="text-foreground font-medium">
            Base resumes are unavailable.
          </p>
          <p class="text-muted mt-1">
            You can still save without one or try loading them again.
          </p>
          <button
            type="button"
            class="text-accent focus-visible:outline-focus mt-2 min-h-10 rounded-lg text-xs font-semibold disabled:cursor-wait disabled:opacity-60"
            :disabled="disabled"
            @click="emit('retry')"
          >
            Try again
          </button>
        </div>
        <p v-else-if="items.length === 0" class="text-muted">
          No active base resumes are available. You can add one later.
        </p>
        <p v-else class="text-muted">Only active base resumes are shown.</p>
      </div>
    </fieldset>
  </div>
</template>
