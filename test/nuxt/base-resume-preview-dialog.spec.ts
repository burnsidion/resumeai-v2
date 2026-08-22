import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
import { computed, nextTick, shallowRef, type ShallowRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import BaseResumePreviewDialog from '~/components/base-resumes/BaseResumePreviewDialog.vue'
import DocumentPreviewDialog from '~/components/documents/DocumentPreviewDialog.vue'
import type { BaseResumePreviewState } from '~/composables/useBaseResumePreview'
import type { BaseResumeManagementItemViewModel } from '~~/shared/base-resumes/view-model'

const { useBaseResumePreviewMock } = vi.hoisted(() => ({
  useBaseResumePreviewMock: vi.fn(),
}))

mockNuxtImport('useBaseResumePreview', () => useBaseResumePreviewMock)

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
const previewUrl =
  'http://127.0.0.1:54321/storage/v1/object/sign/base-resumes/signed-token'

let state: ShallowRef<BaseResumePreviewState>
let load: ReturnType<typeof vi.fn>
let reset: ReturnType<typeof vi.fn>
let retry: ReturnType<typeof vi.fn>
let wrappers: VueWrapper[]

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
  mountSuspended(BaseResumePreviewDialog, {
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

describe('base resume preview dialog', () => {
  beforeEach(() => {
    state = shallowRef<BaseResumePreviewState>({ status: 'idle' })
    load = vi.fn().mockResolvedValue(null)
    reset = vi.fn(() => {
      state.value = { status: 'idle' }
    })
    retry = vi.fn().mockResolvedValue(null)
    wrappers = []
    useBaseResumePreviewMock.mockReset()
    useBaseResumePreviewMock.mockReturnValue({
      canRetry: computed(
        () =>
          state.value.status === 'failure' &&
          state.value.failure.retryable === true,
      ),
      isLoading: computed(() => state.value.status === 'loading'),
      load,
      reset,
      retry,
      state,
    })
  })

  afterEach(() => {
    wrappers.forEach((wrapper) => wrapper.unmount())
    document.body.style.overflow = ''
  })

  it('loads the selected resume once when opened and resets when closed', async () => {
    const wrapper = await mountDialog({ open: false })

    expect(load).not.toHaveBeenCalled()

    await wrapper.setProps({ open: true })
    await nextTick()

    expect(reset).toHaveBeenCalledOnce()
    expect(load).toHaveBeenCalledOnce()
    expect(load).toHaveBeenCalledWith(resume.id)
    expect(wrapper.text()).toContain('Preparing secure preview')

    await wrapper.setProps({ open: false })
    await nextTick()

    expect(reset).toHaveBeenCalledTimes(2)
  })

  it('presents the server-confirmed PDF without owning browser rendering', async () => {
    const wrapper = await mountDialog()
    state.value = {
      preview: {
        baseResumeId: resume.id,
        expiresAt: '2026-08-22T06:05:00+00:00',
        originalFilename: 'Server-confirmed Resume.pdf',
        url: previewUrl,
      },
      status: 'ready',
    }
    await nextTick()

    expect(wrapper.text()).toContain('Server-confirmed Resume.pdf')
    expect(wrapper.text()).toContain('Original PDF · Private · Immutable')
    expect(wrapper.get('iframe').attributes('src')).toBe(previewUrl)
    expect(wrapper.findAll('a[target="_blank"]')).toHaveLength(1)
  })

  it('retries a retry-safe failure without delegating page recovery', async () => {
    const wrapper = await mountDialog()
    state.value = {
      baseResumeId: resume.id,
      failure: {
        code: 'authentication-unavailable',
        message:
          "We couldn't verify your session. Try opening the preview again.",
        recovery: 'retry',
        retryable: true,
      },
      status: 'failure',
    }
    await nextTick()

    await getButton(wrapper, 'Try again').trigger('click')

    expect(retry).toHaveBeenCalledOnce()
    expect(wrapper.emitted('recovery-requested')).toBeUndefined()
  })

  it.each([
    { button: 'Refresh resumes', recovery: 'refresh' as const },
    { button: 'Return to sign in', recovery: 'sign-in' as const },
  ])(
    'delegates $recovery recovery without owning page navigation',
    async ({ button, recovery }) => {
      const wrapper = await mountDialog()
      state.value = {
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
      }
      await nextTick()

      await getButton(wrapper, button).trigger('click')

      expect(wrapper.emitted('recovery-requested')).toEqual([[recovery]])
      expect(retry).not.toHaveBeenCalled()
    },
  )

  it('reloads when the selected resume changes while open', async () => {
    const wrapper = await mountDialog()
    const otherResume: BaseResumeManagementItemViewModel = {
      ...resume,
      activeSlot: 2,
      filename: 'Product Resume.pdf',
      id: '30f11597-ad03-4ccc-81f1-858c3e6d6bdb',
      slotLabel: 'Slot 2',
    }

    expect(load).toHaveBeenCalledWith(resume.id)
    await wrapper.setProps({ resume: otherResume })
    await nextTick()

    expect(reset).toHaveBeenCalledTimes(2)
    expect(load).toHaveBeenNthCalledWith(2, otherResume.id)
    expect(wrapper.text()).toContain('Product Resume.pdf')
  })

  it('forwards close and focus-recovery events to its owning surface', async () => {
    const wrapper = await mountDialog()

    await wrapper
      .get('button[aria-label="Close document preview"]')
      .trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)

    wrapper
      .getComponent(DocumentPreviewDialog)
      .vm.$emit('focus-fallback-requested')
    await nextTick()

    expect(wrapper.emitted('focus-fallback-requested')).toHaveLength(1)
  })
})
