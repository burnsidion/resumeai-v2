<script setup lang="ts">
import type { DeepReadonly } from 'vue'

import type {
  ApplicationWorkingCopyActionRecovery,
  ApplicationWorkingCopyActionState,
} from '~/composables/useApplicationWorkingCopyActions'
import type { ApplicationWorkingCopyReview } from '~~/shared/tailoring/review'

type MobileReviewSection = 'changes' | 'proposal' | 'source'
type PendingAction = 'accept' | 'discard' | 'revision'

const props = defineProps<{
  actionState: DeepReadonly<ApplicationWorkingCopyActionState>
  review: DeepReadonly<ApplicationWorkingCopyReview>
}>()

const emit = defineEmits<{
  'accept-requested': []
  'action-recovery-requested': [recovery: ApplicationWorkingCopyActionRecovery]
  'action-retry-requested': []
  'discard-requested': []
  'revision-requested': [guidance: string]
  'source-preview-requested': []
}>()

const activeMobileSection = ref<MobileReviewSection>('source')
const sourceTabId = useId()
const proposalTabId = useId()
const changesTabId = useId()
const sourcePanelId = useId()
const proposalPanelId = useId()
const changesPanelId = useId()
const revisionGuidanceId = useId()

const isAccepted = computed(() => props.review.workingCopy.state === 'accepted')
const canTakeAction = computed(
  () => !isAccepted.value && props.actionState.status !== 'submitting',
)
const actionFailure = computed(() =>
  props.actionState.status === 'failure' ? props.actionState.failure : null,
)
const actionInProgress = computed(() =>
  props.actionState.status === 'submitting' ? props.actionState.action : null,
)
const pendingAction = ref<PendingAction | null>(null)
const revisionGuidance = ref('')

const changeLabel = (
  kind: ApplicationWorkingCopyReview['changes'][number]['changes'][number]['kind'],
): string => {
  switch (kind) {
    case 'omitted':
      return 'Omitted'
    case 'reordered':
      return 'Reordered'
    case 'rewritten':
      return 'Reworded'
  }
}

const beginAction = (action: PendingAction): void => {
  if (canTakeAction.value) {
    pendingAction.value = action
  }
}

const cancelAction = (): void => {
  if (canTakeAction.value) {
    pendingAction.value = null
  }
}

const submitAction = (): void => {
  if (!pendingAction.value || !canTakeAction.value) {
    return
  }

  if (pendingAction.value === 'accept') {
    emit('accept-requested')
    return
  }

  if (pendingAction.value === 'discard') {
    emit('discard-requested')
    return
  }

  emit('revision-requested', revisionGuidance.value)
}

const requestActionRecovery = (): void => {
  if (actionFailure.value) {
    emit('action-recovery-requested', actionFailure.value.recovery)
  }
}
</script>

<template>
  <section
    class="border-line bg-surface mt-8 rounded-2xl border p-5 sm:p-6"
    aria-labelledby="working-copy-review-heading"
  >
    <p
      class="text-xs font-semibold tracking-[0.14em] uppercase"
      :class="isAccepted ? 'text-success' : 'text-accent'"
    >
      {{
        isAccepted ? 'Working copy accepted' : 'Working copy ready for review'
      }}
    </p>
    <div
      class="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
    >
      <div class="max-w-3xl">
        <h2
          id="working-copy-review-heading"
          tabindex="-1"
          class="text-lg font-semibold tracking-[-0.02em] outline-none"
        >
          {{
            isAccepted
              ? 'This complete working copy has been accepted'
              : 'Review the complete working copy'
          }}
        </h2>
        <p class="text-muted mt-2 text-sm leading-6">
          <template v-if="isAccepted">
            Your original PDF remains unchanged. A separate future step will
            create an immutable finalized resume.
          </template>
          <template v-else>
            This is a machine-generated working copy based on your selected
            source resume and job description. Review it carefully before
            accepting it.
          </template>
        </p>
      </div>
      <button
        type="button"
        class="border-line bg-panel hover:bg-raised focus-visible:outline-focus inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border px-4 text-sm font-semibold transition-colors"
        @click="emit('source-preview-requested')"
      >
        Original PDF
      </button>
    </div>

    <p class="text-muted mt-4 text-xs leading-5">
      Source resume:
      <span class="text-foreground font-medium">{{
        review.source.filename
      }}</span>
      <span class="ml-1">· interpreted text is shown below for comparison</span>
    </p>

    <div
      class="border-line bg-canvas/35 mt-6 rounded-xl border p-1 lg:hidden"
      role="tablist"
      aria-label="Working-copy review sections"
    >
      <button
        :id="sourceTabId"
        type="button"
        role="tab"
        :aria-controls="sourcePanelId"
        :aria-selected="activeMobileSection === 'source'"
        class="focus-visible:outline-focus min-h-10 flex-1 rounded-lg px-3 text-xs font-semibold transition-colors"
        :class="
          activeMobileSection === 'source'
            ? 'bg-raised text-foreground shadow-sm'
            : 'text-muted hover:text-foreground'
        "
        @click="activeMobileSection = 'source'"
      >
        Source
      </button>
      <button
        :id="proposalTabId"
        type="button"
        role="tab"
        :aria-controls="proposalPanelId"
        :aria-selected="activeMobileSection === 'proposal'"
        class="focus-visible:outline-focus min-h-10 flex-1 rounded-lg px-3 text-xs font-semibold transition-colors"
        :class="
          activeMobileSection === 'proposal'
            ? 'bg-raised text-foreground shadow-sm'
            : 'text-muted hover:text-foreground'
        "
        @click="activeMobileSection = 'proposal'"
      >
        Working copy
      </button>
      <button
        :id="changesTabId"
        type="button"
        role="tab"
        :aria-controls="changesPanelId"
        :aria-selected="activeMobileSection === 'changes'"
        class="focus-visible:outline-focus min-h-10 flex-1 rounded-lg px-3 text-xs font-semibold transition-colors"
        :class="
          activeMobileSection === 'changes'
            ? 'bg-raised text-foreground shadow-sm'
            : 'text-muted hover:text-foreground'
        "
        @click="activeMobileSection = 'changes'"
      >
        Changes
      </button>
    </div>

    <div class="mt-5 lg:hidden">
      <section
        v-if="activeMobileSection === 'source'"
        :id="sourcePanelId"
        role="tabpanel"
        :aria-labelledby="sourceTabId"
        class="border-line bg-canvas/25 rounded-xl border p-4"
      >
        <p
          class="text-accent text-xs font-semibold tracking-[0.12em] uppercase"
        >
          Source
        </p>
        <h3 class="mt-2 text-sm font-semibold">{{ review.source.filename }}</h3>
        <div class="mt-5 grid gap-5">
          <section
            v-for="section in review.source.sections"
            :key="section.heading"
          >
            <h4 class="text-sm font-semibold">{{ section.heading }}</h4>
            <ul class="text-muted mt-2 grid gap-2 text-sm leading-6">
              <li v-for="item in section.items" :key="item">{{ item }}</li>
            </ul>
          </section>
        </div>
      </section>

      <section
        v-else-if="activeMobileSection === 'proposal'"
        :id="proposalPanelId"
        role="tabpanel"
        :aria-labelledby="proposalTabId"
        class="border-line bg-canvas/25 rounded-xl border p-4"
      >
        <p
          class="text-accent text-xs font-semibold tracking-[0.12em] uppercase"
        >
          Working copy
        </p>
        <p class="text-muted mt-2 text-sm">Machine-generated proposal</p>
        <div class="mt-5 grid gap-5">
          <section
            v-for="section in review.proposal.sections"
            :key="section.heading"
          >
            <h4 class="text-sm font-semibold">{{ section.heading }}</h4>
            <ul class="text-muted mt-2 grid gap-2 text-sm leading-6">
              <li v-for="item in section.items" :key="item">{{ item }}</li>
            </ul>
          </section>
        </div>
      </section>

      <section
        v-else
        :id="changesPanelId"
        role="tabpanel"
        :aria-labelledby="changesTabId"
        class="border-line bg-canvas/25 rounded-xl border p-4"
      >
        <p
          class="text-accent text-xs font-semibold tracking-[0.12em] uppercase"
        >
          Changes
        </p>
        <p class="text-muted mt-2 text-sm">
          Material changes by source section.
        </p>
        <div v-if="review.changes.length > 0" class="mt-5 grid gap-4">
          <section v-for="group in review.changes" :key="group.sectionHeading">
            <h4 class="text-sm font-semibold">{{ group.sectionHeading }}</h4>
            <ul class="mt-2 grid gap-3">
              <li v-for="change in group.changes" :key="change.explanation">
                <p class="text-accent text-xs font-semibold">
                  {{ changeLabel(change.kind) }}
                </p>
                <p class="text-muted mt-1 text-sm leading-6">
                  {{ change.explanation }}
                </p>
              </li>
            </ul>
          </section>
        </div>
        <p v-else class="text-muted mt-5 text-sm leading-6">
          No material changes were identified in this proposal.
        </p>
      </section>
    </div>

    <div class="mt-6 hidden gap-5 lg:grid lg:grid-cols-2">
      <section
        class="border-line bg-canvas/25 rounded-xl border p-5"
        aria-labelledby="source-document-heading"
      >
        <p
          class="text-accent text-xs font-semibold tracking-[0.12em] uppercase"
        >
          Source
        </p>
        <h3 id="source-document-heading" class="mt-2 text-sm font-semibold">
          {{ review.source.filename }}
        </h3>
        <p class="text-muted mt-1 text-xs">Interpreted source content</p>
        <div class="mt-5 grid gap-5">
          <section
            v-for="section in review.source.sections"
            :key="section.heading"
          >
            <h4 class="text-sm font-semibold">{{ section.heading }}</h4>
            <ul class="text-muted mt-2 grid gap-2 text-sm leading-6">
              <li v-for="item in section.items" :key="item">{{ item }}</li>
            </ul>
          </section>
        </div>
      </section>

      <section
        class="border-accent/25 bg-accent/[0.025] rounded-xl border p-5"
        aria-labelledby="proposal-document-heading"
      >
        <p
          class="text-accent text-xs font-semibold tracking-[0.12em] uppercase"
        >
          Working copy
        </p>
        <h3 id="proposal-document-heading" class="mt-2 text-sm font-semibold">
          Machine-generated proposal
        </h3>
        <p class="text-muted mt-1 text-xs">Review before accepting</p>
        <div class="mt-5 grid gap-5">
          <section
            v-for="section in review.proposal.sections"
            :key="section.heading"
          >
            <h4 class="text-sm font-semibold">{{ section.heading }}</h4>
            <ul class="text-muted mt-2 grid gap-2 text-sm leading-6">
              <li v-for="item in section.items" :key="item">{{ item }}</li>
            </ul>
          </section>
        </div>
      </section>
    </div>

    <section
      class="border-line bg-canvas/25 mt-5 rounded-xl border p-4"
      aria-labelledby="working-copy-changes-heading"
    >
      <div>
        <p
          class="text-accent text-xs font-semibold tracking-[0.12em] uppercase"
        >
          Changes
        </p>
        <h3
          id="working-copy-changes-heading"
          class="mt-2 text-sm font-semibold"
        >
          Material changes by section
        </h3>
      </div>
      <div
        v-if="review.changes.length > 0"
        class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <section v-for="group in review.changes" :key="group.sectionHeading">
          <h4 class="text-sm font-semibold">{{ group.sectionHeading }}</h4>
          <ul class="mt-2 grid gap-3">
            <li v-for="change in group.changes" :key="change.explanation">
              <p class="text-accent text-xs font-semibold">
                {{ changeLabel(change.kind) }}
              </p>
              <p class="text-muted mt-1 text-xs leading-5">
                {{ change.explanation }}
              </p>
            </li>
          </ul>
        </section>
      </div>
      <p v-else class="text-muted mt-4 text-sm leading-6">
        No material changes were identified in this proposal.
      </p>
    </section>

    <section
      v-if="!isAccepted"
      class="border-line bg-panel mt-5 rounded-xl border p-4 sm:p-5"
      aria-labelledby="working-copy-actions-heading"
    >
      <p class="text-accent text-xs font-semibold tracking-[0.12em] uppercase">
        Your decision
      </p>
      <h3
        id="working-copy-actions-heading"
        class="mt-2 text-base font-semibold"
      >
        Keep, revise, or discard this complete proposal
      </h3>
      <p class="text-muted mt-2 max-w-3xl text-sm leading-6">
        These choices apply to the whole working copy. Your original PDF stays
        unchanged either way.
      </p>

      <div
        v-if="actionInProgress"
        class="border-accent/30 bg-accent/[0.045] mt-5 rounded-xl border px-4 py-3"
        role="status"
        aria-live="polite"
      >
        <p class="flex items-center gap-3 text-sm font-medium">
          <span
            class="border-muted border-t-accent size-4 shrink-0 rounded-full border-2 motion-safe:animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          {{
            actionInProgress === 'accept'
              ? 'Accepting this working copy…'
              : actionInProgress === 'discard'
                ? 'Discarding this working copy…'
                : 'Preparing a revised working copy…'
          }}
        </p>
        <p class="text-muted mt-1 pl-7 text-xs leading-5">
          Keep this page open until the result is confirmed.
        </p>
      </div>

      <div
        v-else-if="actionFailure"
        class="border-danger/30 bg-danger/[0.055] mt-5 rounded-xl border px-4 py-3"
        role="alert"
      >
        <p class="text-sm font-semibold">Working-copy update needs attention</p>
        <p class="text-muted mt-1 text-sm leading-6">
          {{ actionFailure.message }}
        </p>
        <div class="mt-4 flex flex-wrap gap-3">
          <button
            v-if="actionFailure.recovery === 'retry'"
            type="button"
            class="border-danger/30 bg-danger/10 text-danger hover:bg-danger/15 focus-visible:outline-focus min-h-10 rounded-xl border px-4 text-sm font-semibold transition-colors"
            @click="emit('action-retry-requested')"
          >
            Try again
          </button>
          <button
            v-else
            type="button"
            class="border-line bg-panel hover:bg-raised focus-visible:outline-focus min-h-10 rounded-xl border px-4 text-sm font-semibold transition-colors"
            @click="requestActionRecovery"
          >
            {{
              actionFailure.recovery === 'sign-in'
                ? 'Return to sign in'
                : actionFailure.recovery === 'back-to-applications'
                  ? 'Back to applications'
                  : 'Refresh application'
            }}
          </button>
        </div>
      </div>

      <div v-else-if="pendingAction" class="mt-5">
        <div
          class="rounded-xl border p-4"
          :class="
            pendingAction === 'discard'
              ? 'border-danger/30 bg-danger/[0.04]'
              : 'border-accent/25 bg-accent/[0.035]'
          "
          role="region"
          aria-label="Confirm working-copy decision"
        >
          <template v-if="pendingAction === 'accept'">
            <p class="text-sm font-semibold">Accept this working copy?</p>
            <p class="text-muted mt-1 text-sm leading-6">
              This accepts the complete proposal as the current working copy. A
              later step will create the final immutable PDF.
            </p>
          </template>
          <template v-else-if="pendingAction === 'discard'">
            <p class="text-danger text-sm font-semibold">
              Discard this working copy?
            </p>
            <p class="text-muted mt-1 text-sm leading-6">
              The complete proposal will be removed. Your original PDF and
              application stay unchanged.
            </p>
          </template>
          <template v-else>
            <label :for="revisionGuidanceId" class="text-sm font-semibold">
              What should change?
            </label>
            <p class="text-muted mt-1 text-sm leading-6">
              Optional guidance helps shape a new complete proposal. The current
              proposal stays available if a revision cannot be made.
            </p>
            <textarea
              :id="revisionGuidanceId"
              v-model="revisionGuidance"
              class="border-line bg-canvas text-foreground placeholder:text-muted focus-visible:outline-focus mt-4 min-h-28 w-full resize-y rounded-xl border px-3 py-2.5 text-sm leading-6"
              maxlength="1000"
              placeholder="For example: emphasize the accessibility and product-impact work already shown in my source resume."
            />
            <p class="text-muted mt-1 text-right text-xs" aria-live="polite">
              {{ revisionGuidance.length }} / 1000
            </p>
          </template>

          <div class="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              class="focus-visible:outline-focus min-h-11 rounded-xl px-5 text-sm font-semibold transition-colors"
              :class="
                pendingAction === 'discard'
                  ? 'border-danger/30 bg-danger/12 text-danger hover:bg-danger/18 border'
                  : 'bg-accent text-canvas hover:bg-focus'
              "
              @click="submitAction"
            >
              {{
                pendingAction === 'accept'
                  ? 'Accept working copy'
                  : pendingAction === 'discard'
                    ? 'Discard working copy'
                    : 'Request revision'
              }}
            </button>
            <button
              type="button"
              class="border-line bg-panel hover:bg-raised focus-visible:outline-focus min-h-11 rounded-xl border px-4 text-sm font-semibold transition-colors"
              @click="cancelAction"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      <div v-else class="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          class="bg-accent text-canvas hover:bg-focus focus-visible:outline-focus min-h-11 rounded-xl px-5 text-sm font-semibold transition-colors"
          @click="beginAction('accept')"
        >
          Accept working copy
        </button>
        <button
          type="button"
          class="border-line bg-panel hover:bg-raised focus-visible:outline-focus min-h-11 rounded-xl border px-4 text-sm font-semibold transition-colors"
          @click="beginAction('revision')"
        >
          Request revision
        </button>
        <button
          type="button"
          class="border-danger/30 bg-danger/10 text-danger hover:bg-danger/15 focus-visible:outline-focus min-h-11 rounded-xl border px-4 text-sm font-semibold transition-colors"
          @click="beginAction('discard')"
        >
          Discard
        </button>
      </div>
    </section>
  </section>
</template>
