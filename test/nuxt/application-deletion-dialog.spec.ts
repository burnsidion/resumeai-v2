import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
import { computed, nextTick, shallowRef, type ShallowRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ApplicationDeletionDialog from '~/components/applications/ApplicationDeletionDialog.vue'
import type { ApplicationDeletionState } from '~/composables/useApplicationDeletion'
import type { ApplicationDetailViewModel } from '~~/shared/applications/view-model'

const { useApplicationDeletionMock } = vi.hoisted(() => ({
  useApplicationDeletionMock: vi.fn(),
}))

mockNuxtImport('useApplicationDeletion', () => useApplicationDeletionMock)

const application: ApplicationDetailViewModel = {
  appliedOn: null,
  company: 'Northstar Labs',
  createdAt: '2026-09-08T18:00:00.000Z',
  createdLabel: 'Sep 8, 2026',
  id: '4120cbac-ebf4-4580-8988-3fbc65ca9449',
  jobDescription: 'Build calm, accessible product experiences.',
  notes: null,
  postingUrl: null,
  readiness: {
    isReady: false,
    label: 'Not ready for tailoring',
    missingRequirements: [],
  },
  role: 'Senior Frontend Engineer',
  selectedBaseResume: null,
  status: 'draft',
  statusLabel: 'Draft',
  statusTone: 'neutral',
  updatedAt: '2026-09-08T18:00:00.000Z',
  updatedLabel: 'Sep 8, 2026',
}

let state: ShallowRef<ApplicationDeletionState>
let remove: ReturnType<typeof vi.fn>
let reset: ReturnType<typeof vi.fn>
let retry: ReturnType<typeof vi.fn>
let wrappers: VueWrapper[]

const setState = (nextState: ApplicationDeletionState): void => {
  state.value = nextState
}

const getButton = (
  wrapper: VueWrapper,
  label: string,
): DOMWrapper<HTMLButtonElement> => {
  const button = wrapper
    .findAll<HTMLButtonElement>('button')
    .find((candidate) => candidate.text().trim() === label)

  if (!button) {
    throw new Error(`Expected a button labelled ${label}.`)
  }

  return button
}

const mountDialog = (
  props: Partial<{
    application: ApplicationDetailViewModel
    hasUnsavedChanges: boolean
    open: boolean
  }> = {},
) =>
  mountSuspended(ApplicationDeletionDialog, {
    attachTo: document.body,
    props: {
      application,
      hasUnsavedChanges: false,
      open: true,
      ...props,
    },
  }).then((wrapper) => {
    wrappers.push(wrapper)
    return wrapper
  })

describe('application deletion dialog', () => {
  beforeEach(() => {
    state = shallowRef<ApplicationDeletionState>({ status: 'idle' })
    remove = vi.fn().mockResolvedValue(null)
    reset = vi.fn(() => setState({ status: 'idle' }))
    retry = vi.fn().mockResolvedValue(null)
    wrappers = []
    useApplicationDeletionMock.mockReset()
    useApplicationDeletionMock.mockReturnValue({
      canRetry: computed(
        () =>
          state.value.status === 'failure' &&
          state.value.failure.retryable === true,
      ),
      isBusy: computed(() => state.value.status === 'deleting'),
      remove,
      reset,
      retry,
      state,
    })
  })

  afterEach(() => {
    wrappers.forEach((wrapper) => wrapper.unmount())
    document.body.style.overflow = ''
  })

  it('makes permanent application deletion and base-resume preservation explicit', async () => {
    const wrapper = await mountDialog({ hasUnsavedChanges: true })
    const dialog = wrapper.get('[role="dialog"]')

    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(wrapper.text()).toContain('Delete this application?')
    expect(wrapper.text()).toContain('Senior Frontend Engineer')
    expect(wrapper.text()).toContain('Northstar Labs')
    expect(wrapper.text()).toContain('This cannot be undone')
    expect(wrapper.text()).toContain('working copy or finalized resume')
    expect(wrapper.text()).toContain('original base resume stays untouched')
    expect(wrapper.text()).toContain(
      'Unsaved edits on this page will not be saved',
    )
  })

  it('requests deletion only after explicit confirmation', async () => {
    remove.mockResolvedValue(application.id)
    const wrapper = await mountDialog()

    expect(remove).not.toHaveBeenCalled()
    await getButton(wrapper, 'Delete application').trigger('click')

    expect(remove).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledWith(application.id)
    expect(wrapper.emitted('deleted')).toEqual([[application.id]])
  })

  it('prevents dismissal and repeat confirmation while unresolved', async () => {
    setState({ applicationId: application.id, status: 'deleting' })
    const wrapper = await mountDialog()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await getButton(wrapper, 'Cancel').trigger('click')

    expect(wrapper.emitted('close')).toBeUndefined()
    expect(getButton(wrapper, 'Cancel').attributes('disabled')).toBeDefined()
    expect(
      getButton(wrapper, 'Deleting application…').attributes('disabled'),
    ).toBeDefined()
    expect(wrapper.get('[role="dialog"]').attributes('aria-busy')).toBe('true')
    expect(remove).not.toHaveBeenCalled()
  })

  it('shows sanitized recovery and retries only safe failures', async () => {
    setState({
      applicationId: application.id,
      failure: {
        code: 'authentication-unavailable',
        message:
          "We couldn't verify your session. Try deleting the application again.",
        recovery: 'retry',
        retryable: true,
      },
      status: 'failure',
    })
    retry.mockResolvedValue(application.id)
    const wrapper = await mountDialog()

    await getButton(wrapper, 'Try again').trigger('click')

    expect(retry).toHaveBeenCalledOnce()
    expect(remove).not.toHaveBeenCalled()
    expect(wrapper.emitted('deleted')).toEqual([[application.id]])
  })

  it.each([
    {
      button: 'Back to applications',
      recovery: 'back-to-applications' as const,
    },
    { button: 'Refresh application', recovery: 'refresh-application' as const },
    { button: 'Return to sign in', recovery: 'sign-in' as const },
  ])(
    'emits $recovery recovery without owning page behavior',
    async ({ button, recovery }) => {
      setState({
        applicationId: application.id,
        failure: {
          code:
            recovery === 'sign-in'
              ? 'authentication-required'
              : 'application-unavailable',
          message: 'Sanitized recovery guidance.',
          recovery,
          retryable: false,
        },
        status: 'failure',
      })
      const wrapper = await mountDialog()

      await getButton(wrapper, button).trigger('click')

      expect(wrapper.emitted('recovery-requested')).toEqual([[recovery]])
    },
  )

  it('traps focus, closes with Escape, and restores focus to its opener', async () => {
    const opener = document.createElement('button')
    opener.textContent = 'Delete application'
    document.body.append(opener)
    opener.focus()

    const wrapper = await mountDialog({ open: false })
    await wrapper.setProps({ open: true })
    await nextTick()

    const dialog = wrapper.get<HTMLElement>('[role="dialog"]')
    const cancelButton = getButton(wrapper, 'Cancel')
    const confirmButton = getButton(wrapper, 'Delete application')

    expect(document.activeElement).toBe(dialog.element)
    expect(document.body.style.overflow).toBe('hidden')

    cancelButton.element.focus()
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }),
    )
    expect(document.activeElement).toBe(confirmButton.element)

    confirmButton.element.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    expect(document.activeElement).toBe(cancelButton.element)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(1)

    await wrapper.setProps({ open: false })
    await nextTick()
    expect(document.activeElement).toBe(opener)
    expect(reset).toHaveBeenCalledOnce()

    opener.remove()
  })
})
