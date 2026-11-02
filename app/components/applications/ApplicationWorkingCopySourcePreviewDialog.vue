<script setup lang="ts">
import DocumentPreviewDialog from '~/components/documents/DocumentPreviewDialog.vue'
import type { ApplicationWorkingCopySourcePreviewRecovery } from '~/composables/useApplicationWorkingCopySourcePreview'

const props = defineProps<{
  applicationId: string
  filename: string
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  'focus-fallback-requested': []
  'recovery-requested': [
    recovery: Exclude<ApplicationWorkingCopySourcePreviewRecovery, 'retry'>,
  ]
}>()

const preview = useApplicationWorkingCopySourcePreview()

const documentName = computed(() =>
  preview.state.value.status === 'ready'
    ? preview.state.value.preview.originalFilename
    : props.filename,
)

const presentationState = computed(() => {
  const currentState = preview.state.value

  if (currentState.status === 'ready') {
    return { status: 'ready' as const, url: currentState.preview.url }
  }

  if (currentState.status === 'failure') {
    const actionLabels = {
      'back-to-applications': 'Back to applications',
      'refresh-application': 'Refresh application',
      retry: 'Try again',
      'sign-in': 'Return to sign in',
    } as const satisfies Record<
      ApplicationWorkingCopySourcePreviewRecovery,
      string
    >

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
  void preview.load(props.applicationId)
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
  [() => props.open, () => props.applicationId],
  ([open, applicationId], [previousOpen, previousApplicationId]) => {
    if (!open) {
      preview.reset()
      return
    }

    if (!previousOpen || applicationId !== previousApplicationId) {
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
    context-label="Working-copy source · Private · Immutable"
    :state="presentationState"
    @close="emit('close')"
    @error-action="requestErrorRecovery"
    @focus-fallback-requested="emit('focus-fallback-requested')"
  />
</template>
