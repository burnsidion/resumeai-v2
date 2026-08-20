import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
import { computed, nextTick, shallowRef, type ShallowRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import BaseResumeRetirementDialog from '~/components/base-resumes/BaseResumeRetirementDialog.vue'
import type { BaseResumeRetirementState } from '~/composables/useBaseResumeRetirement'
import type { RetiredBaseResume } from '~~/shared/base-resumes/retirement'
import type { BaseResumeManagementItemViewModel } from '~~/shared/base-resumes/view-model'

const { useBaseResumeRetirementMock } = vi.hoisted(() => ({
  useBaseResumeRetirementMock: vi.fn(),
}))

mockNuxtImport('useBaseResumeRetirement', () => useBaseResumeRetirementMock)

const resume: BaseResumeManagementItemViewModel = {
  activeSlot: 1,
  createdAt: '2026-08-08T18:00:00+00:00',
  fileSizeLabel: '482 KiB',
  filename: 'Frontend Engineering.pdf',
  id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
  sizeBytes: 493_568,
  slotLabel: 'Slot 1',
  statusLabel: 'Active',
  uploadedLabel: 'Uploaded August 8, 2026',
}
const retiredResume: RetiredBaseResume = {
  id: resume.id,
  retiredAt: '2026-08-19T20:00:00+00:00',
}

let state: ShallowRef<BaseResumeRetirementState>
let reset: ReturnType<typeof vi.fn>
let retire: ReturnType<typeof vi.fn>
let retry: ReturnType<typeof vi.fn>
let wrappers: VueWrapper[]

const setState = (nextState: BaseResumeRetirementState): void => {
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
    throw new Error(`Expected a button labelled "${label}".`)
  }

  return button
}

const mountDialog = (
  props: Partial<{
    open: boolean
    resume: BaseResumeManagementItemViewModel
  }> = {},
) =>
  mountSuspended(BaseResumeRetirementDialog, {
    attachTo: document.body,
    props: {
      open: true,
      resume,
      ...props,
    },
  }).then((wrapper) => {
    wrappers.push(wrapper)
    return wrapper
  })

describe('base resume retirement dialog', () => {
  beforeEach(() => {
    state = shallowRef<BaseResumeRetirementState>({ status: 'idle' })
    reset = vi.fn(() => setState({ status: 'idle' }))
    retire = vi.fn().mockResolvedValue(null)
    retry = vi.fn().mockResolvedValue(null)
    wrappers = []
    useBaseResumeRetirementMock.mockReset()
    useBaseResumeRetirementMock.mockReturnValue({
      canRetry: computed(
        () =>
          state.value.status === 'failure' &&
          state.value.failure.retryable === true,
      ),
      isBusy: computed(() => state.value.status === 'retiring'),
      reset,
      retire,
      retry,
      state,
    })
  })

  afterEach(() => {
    wrappers.forEach((wrapper) => wrapper.unmount())
    document.body.style.overflow = ''
  })

  it('describes retirement and preservation without deletion language', async () => {
    const wrapper = await mountDialog()
    const dialog = wrapper.get('[role="dialog"]')

    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.attributes('aria-labelledby')).toBeTruthy()
    expect(dialog.attributes('aria-describedby')).toBeTruthy()
    expect(wrapper.text()).toContain('Retire this base resume?')
    expect(wrapper.text()).toContain('Frontend Engineering.pdf')
    expect(wrapper.text()).toContain('Slot 1 will become available')
    expect(wrapper.text()).toContain('The original PDF stays preserved')
    expect(wrapper.text()).toContain(
      'Historical application references will remain unchanged',
    )
    expect(wrapper.text().toLowerCase()).not.toContain('delete')
  })

  it('requests retirement only after explicit confirmation', async () => {
    retire.mockResolvedValue(retiredResume)
    const wrapper = await mountDialog()

    expect(retire).not.toHaveBeenCalled()
    await getButton(wrapper, 'Retire resume').trigger('click')

    expect(retire).toHaveBeenCalledOnce()
    expect(retire).toHaveBeenCalledWith(resume.id)
    expect(wrapper.emitted('retired')).toEqual([[retiredResume]])
  })

  it('prevents dismissal and repeat confirmation while unresolved', async () => {
    setState({ baseResumeId: resume.id, status: 'retiring' })
    const wrapper = await mountDialog()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.trigger('click')
    await getButton(wrapper, 'Cancel').trigger('click')

    expect(wrapper.emitted('close')).toBeUndefined()
    expect(getButton(wrapper, 'Cancel').attributes('disabled')).toBeDefined()
    expect(
      getButton(wrapper, 'Retiring resume…').attributes('disabled'),
    ).toBeDefined()
    expect(wrapper.get('[role="dialog"]').attributes('aria-busy')).toBe('true')
    expect(retire).not.toHaveBeenCalled()
  })

  it('shows only sanitized recovery and retries the same operation safely', async () => {
    setState({
      baseResumeId: resume.id,
      failure: {
        code: 'authentication-unavailable',
        message:
          "We couldn't verify your session. Try retiring the resume again.",
        recovery: 'retry',
        retryable: true,
      },
      status: 'failure',
    })
    retry.mockResolvedValue(retiredResume)
    const wrapper = await mountDialog()

    expect(wrapper.get('[role="alert"]').text()).toContain(
      "We couldn't verify your session",
    )
    expect(wrapper.text()).not.toContain('private provider detail')

    await getButton(wrapper, 'Try again').trigger('click')

    expect(retry).toHaveBeenCalledOnce()
    expect(retire).not.toHaveBeenCalled()
    expect(wrapper.emitted('retired')).toEqual([[retiredResume]])
  })

  it.each([
    { button: 'Refresh resumes', recovery: 'refresh' as const },
    { button: 'Return to sign in', recovery: 'sign-in' as const },
  ])(
    'emits $recovery recovery without owning page behavior',
    async ({ button, recovery }) => {
      setState({
        baseResumeId: resume.id,
        failure: {
          code:
            recovery === 'sign-in'
              ? 'authentication-required'
              : 'base-resume-unavailable',
          message: 'Sanitized recovery guidance.',
          recovery,
          retryable: false,
        },
        status: 'failure',
      })
      const wrapper = await mountDialog()

      await getButton(wrapper, button).trigger('click')

      expect(wrapper.emitted('recovery-requested')).toEqual([[recovery]])
      expect(retire).not.toHaveBeenCalled()
      expect(retry).not.toHaveBeenCalled()
    },
  )

  it('announces confirmed success and allows dismissal', async () => {
    setState({ baseResume: retiredResume, status: 'success' })
    const wrapper = await mountDialog()

    expect(wrapper.get('[role="status"]').text()).toContain(
      'Retirement confirmed',
    )
    expect(wrapper.text()).toContain(
      'The active slot can now be used by another base resume',
    )

    await getButton(wrapper, 'Done').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('traps focus, closes with Escape, and restores focus to its opener', async () => {
    const opener = document.createElement('button')
    opener.textContent = 'Retire selected resume'
    document.body.append(opener)
    opener.focus()

    const wrapper = await mountDialog({ open: false })
    await wrapper.setProps({ open: true })
    await nextTick()

    const dialog = wrapper.get<HTMLElement>('[role="dialog"]')
    const cancelButton = getButton(wrapper, 'Cancel')
    const confirmButton = getButton(wrapper, 'Retire resume')

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
    expect(document.body.style.overflow).toBe('')
    expect(reset).toHaveBeenCalledOnce()

    opener.remove()
  })
})
