import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
import { computed, nextTick, shallowRef, type ShallowRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import BaseResumeUploadDialog from '~/components/base-resumes/BaseResumeUploadDialog.vue'
import type { BaseResumeUploadState } from '~/composables/useBaseResumeUpload'
import type { UploadedBaseResume } from '~~/shared/base-resumes/upload'

const { useBaseResumeUploadMock } = vi.hoisted(() => ({
  useBaseResumeUploadMock: vi.fn(),
}))

mockNuxtImport('useBaseResumeUpload', () => useBaseResumeUploadMock)

const selectedFile = new File(['%PDF-1.7\n%%EOF'], 'Resume.pdf', {
  type: 'application/pdf',
})
const selection = {
  file: selectedFile,
  normalizedFilename: selectedFile.name,
}
const uploadedBaseResume: UploadedBaseResume = {
  activeSlot: 2,
  createdAt: '2026-08-08T05:00:00+00:00',
  id: 'aab0beaa-b348-4670-93c8-a27d6bdf7e69',
  originalFilename: selectedFile.name,
}

let state: ShallowRef<BaseResumeUploadState>
let selectFile: ReturnType<typeof vi.fn>
let uploadSelected: ReturnType<typeof vi.fn>
let reset: ReturnType<typeof vi.fn>
let wrappers: VueWrapper[]

const setState = (nextState: BaseResumeUploadState): void => {
  state.value = nextState
}

const getButton = (wrapper: VueWrapper, label: string): DOMWrapper<Element> => {
  const button = wrapper
    .findAll('button')
    .find((candidate) => candidate.text().trim() === label)

  if (!button) {
    throw new Error(`Expected a button labelled "${label}".`)
  }

  return button
}

const mountDialog = (
  props: Partial<{
    activeCount: number
    activeLimit: 3
    open: boolean
  }> = {},
) =>
  mountSuspended(BaseResumeUploadDialog, {
    attachTo: document.body,
    props: {
      activeCount: 1,
      activeLimit: 3,
      open: true,
      ...props,
    },
  }).then((wrapper) => {
    wrappers.push(wrapper)
    return wrapper
  })

describe('base resume upload dialog', () => {
  beforeEach(() => {
    state = shallowRef<BaseResumeUploadState>({ status: 'idle' })
    selectFile = vi.fn()
    uploadSelected = vi.fn().mockResolvedValue(null)
    reset = vi.fn(() => setState({ status: 'idle' }))
    wrappers = []
    useBaseResumeUploadMock.mockReset()
    useBaseResumeUploadMock.mockReturnValue({
      canRetry: computed(() => {
        const currentState = state.value

        return (
          currentState.status === 'failure' && currentState.failure.retryable
        )
      }),
      canSubmit: computed(() => state.value.status === 'ready'),
      isBusy: computed(
        () =>
          state.value.status === 'validating' ||
          state.value.status === 'uploading',
      ),
      reset,
      selectFile,
      state,
      uploadSelected,
    })
  })

  afterEach(() => {
    for (const wrapper of wrappers) {
      wrapper.unmount()
    }

    document.body.style.overflow = ''
  })

  it('renders the idle workflow with authoritative constraints and capacity', async () => {
    const wrapper = await mountDialog()
    const dialog = wrapper.get('[role="dialog"]')

    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.attributes('aria-labelledby')).toBeTruthy()
    expect(dialog.attributes('aria-describedby')).toBeTruthy()
    expect(wrapper.text()).toContain('Upload base resume')
    expect(wrapper.text()).toContain('PDF only')
    expect(wrapper.text()).toContain('Maximum 10 MiB')
    expect(wrapper.text()).toContain(
      '1 of 3 active resumes · 2 slots remaining',
    )
    expect(wrapper.text()).toContain('The original file is stored unchanged')
    expect(wrapper.get('input[type="file"]').attributes('accept')).toBe(
      '.pdf,application/pdf',
    )
    expect(document.body.style.overflow).toBe('hidden')

    const input = wrapper.get('input[type="file"]')

    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: {
        0: selectedFile,
        item: (index: number) => (index === 0 ? selectedFile : null),
        length: 1,
      },
    })
    await input.trigger('change')
    expect(selectFile).toHaveBeenCalledOnce()
    expect(selectFile).toHaveBeenCalledWith(selectedFile)
  })

  it('renders the selected, validating, uploading, and success states truthfully', async () => {
    setState({ selection, status: 'ready' })
    const wrapper = await mountDialog()

    expect(wrapper.text()).toContain('Resume.pdf')
    expect(
      wrapper
        .get('button[aria-label="Close upload dialog"]')
        .attributes('aria-label'),
    ).toBe('Close upload dialog')
    expect(getButton(wrapper, 'Upload resume').text()).toBe('Upload resume')

    setState({ file: selectedFile, status: 'validating' })
    await nextTick()
    expect(wrapper.text()).toContain(
      'Checking the filename, size, and PDF signature',
    )
    expect(wrapper.get('[role="dialog"]').attributes('aria-busy')).toBe('true')
    expect(wrapper.get('input[type="file"]').attributes()).toHaveProperty(
      'disabled',
    )

    setState({ selection, status: 'uploading' })
    await nextTick()
    expect(wrapper.text()).toContain('Uploading and securing your resume')
    expect(wrapper.text()).toContain('Keep this window open')
    expect(
      wrapper.get('button[aria-label="Close upload dialog"]').attributes(),
    ).toHaveProperty('disabled')

    setState({ baseResume: uploadedBaseResume, status: 'success' })
    await nextTick()
    expect(wrapper.text()).toContain('Upload complete')
    expect(wrapper.text()).toContain('Saved as active resume slot 2')
    expect(getButton(wrapper, 'Done').text()).toBe('Done')
  })

  it('submits the validated selection and emits the safe uploaded result', async () => {
    setState({ selection, status: 'ready' })
    uploadSelected.mockResolvedValue(uploadedBaseResume)
    const wrapper = await mountDialog()

    await getButton(wrapper, 'Upload resume').trigger('click')

    expect(uploadSelected).toHaveBeenCalledOnce()
    expect(wrapper.emitted('uploaded')).toEqual([[uploadedBaseResume]])
  })

  it('renders retryable and reconciliation-required failures without provider details', async () => {
    setState({
      failure: {
        code: 'base-resume-upload-unavailable',
        message: 'Resume upload is temporarily unavailable. Try again.',
        recovery: 'retry',
        retryable: true,
      },
      selection,
      status: 'failure',
    })
    const wrapper = await mountDialog()

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Resume upload is temporarily unavailable',
    )
    expect(getButton(wrapper, 'Try again').text()).toBe('Try again')

    await getButton(wrapper, 'Try again').trigger('click')
    expect(uploadSelected).toHaveBeenCalledOnce()

    setState({
      failure: {
        code: 'unknown',
        message:
          "We couldn't confirm whether the upload completed. Refresh your resumes before trying again.",
        recovery: 'refresh',
        retryable: false,
      },
      selection,
      status: 'failure',
    })
    await nextTick()

    expect(wrapper.find('input[type="file"]').exists()).toBe(false)
    expect(getButton(wrapper, 'Refresh resumes').text()).toBe('Refresh resumes')
    await getButton(wrapper, 'Refresh resumes').trigger('click')
    expect(wrapper.emitted('recovery-requested')).toEqual([['refresh']])
    expect(wrapper.text()).not.toContain('private provider detail')
  })

  it('prevents selection when all active slots are occupied', async () => {
    const wrapper = await mountDialog({ activeCount: 3 })

    expect(wrapper.text()).toContain(
      '3 of 3 active resumes · 0 slots remaining',
    )
    expect(wrapper.text()).toContain('All three resume slots are in use')
    expect(wrapper.find('input[type="file"]').exists()).toBe(false)
    expect(getButton(wrapper, 'Done').text()).toBe('Done')

    setState({ baseResume: uploadedBaseResume, status: 'success' })
    await nextTick()
    expect(wrapper.text()).toContain('Upload complete')
    expect(wrapper.text()).not.toContain('All three resume slots are in use')
  })

  it('traps focus, closes with Escape, and restores focus to its opener', async () => {
    const opener = document.createElement('button')
    opener.textContent = 'Open upload'
    document.body.append(opener)
    opener.focus()

    const wrapper = await mountDialog({ open: false })
    await wrapper.setProps({ open: true })
    await nextTick()

    const dialog = wrapper.get<HTMLElement>('[role="dialog"]')
    const closeButton = wrapper.get<HTMLButtonElement>(
      'button[aria-label="Close upload dialog"]',
    )
    const browseButton = getButton(wrapper, 'Browse PDF')

    expect(document.activeElement).toBe(dialog.element)

    closeButton.element.focus()
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }),
    )
    expect(document.activeElement).toBe(browseButton?.element)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(1)

    await wrapper.setProps({ open: false })
    await nextTick()
    expect(document.activeElement).toBe(opener)
    expect(document.body.style.overflow).toBe('')
    expect(reset).toHaveBeenCalledOnce()

    opener.remove()
  })

  it('cannot be dismissed or submitted again while an upload is unresolved', async () => {
    setState({ selection, status: 'uploading' })
    const wrapper = await mountDialog()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.trigger('click')

    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.find('button[type="button"]:not([disabled])').exists()).toBe(
      false,
    )
    expect(uploadSelected).not.toHaveBeenCalled()
  })
})
