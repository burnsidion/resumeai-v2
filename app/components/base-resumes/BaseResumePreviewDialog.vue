<script setup lang="ts">
import DocumentPreviewDialog from '~/components/documents/DocumentPreviewDialog.vue'
import type { BaseResumePreviewRecovery } from '~/composables/useBaseResumePreview'
import type { BaseResumeManagementItemViewModel } from '~~/shared/base-resumes/view-model'

const props = defineProps<{
  open: boolean
  resume: BaseResumeManagementItemViewModel
}>()

const emit = defineEmits<{
  close: []
  'focus-fallback-requested': []
  'recovery-requested': [recovery: 'refresh' | 'sign-in']
}>()

const preview = useBaseResumePreview()

const documentName = computed(() =>
  preview.state.value.status === 'ready'
    ? preview.state.value.preview.originalFilename
    : props.resume.filename,
)

const presentationState = computed(() => {
  const currentState = preview.state.value

  if (currentState.status === 'ready') {
    return {
      status: 'ready' as const,
      url: currentState.preview.url,
    }
  }

  if (currentState.status === 'failure') {
    const actionLabels = {
      refresh: 'Refresh resumes',
      retry: 'Try again',
      'sign-in': 'Return to sign in',
    } as const satisfies Record<BaseResumePreviewRecovery, string>

    return {
      actionLabel: actionLabels[currentState.failure.recovery],
      message: currentState.failure.message,
      status: 'failure' as const,
    }
  }

  return { status: 'loading' as const }
})

const loadPreview = (): void => {
  preview.reset()
  void preview.load(props.resume.id)
}

const requestErrorRecovery = (): void => {
  const currentState = preview.state.value

  if (currentState.status !== 'failure') {
    return
  }

  if (currentState.failure.recovery === 'retry') {
    void preview.retry()
    return
  }

  emit('recovery-requested', currentState.failure.recovery)
}

watch(
  [() => props.open, () => props.resume.id],
  ([open, baseResumeId], [previousOpen, previousBaseResumeId]) => {
    if (!open) {
      preview.reset()
      return
    }

    if (!previousOpen || baseResumeId !== previousBaseResumeId) {
      loadPreview()
    }
  },
)

onMounted(() => {
  if (props.open) {
    loadPreview()
  }
})

onBeforeUnmount(preview.reset)
</script>

<template>
  <DocumentPreviewDialog
    :open="open"
    :document-name="documentName"
    context-label="Original PDF · Private · Immutable"
    :state="presentationState"
    @close="emit('close')"
    @error-action="requestErrorRecovery"
    @focus-fallback-requested="emit('focus-fallback-requested')"
  />
</template>
