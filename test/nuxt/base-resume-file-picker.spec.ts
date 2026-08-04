import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

import BaseResumeFilePicker from '~/components/base-resumes/BaseResumeFilePicker.vue'

const createFileList = (...files: File[]): FileList =>
  ({
    ...files,
    item: (index: number) => files[index] ?? null,
    length: files.length,
  }) as FileList

describe('base resume file picker', () => {
  it('provides an accessible single-PDF browse control', async () => {
    const wrapper = await mountSuspended(BaseResumeFilePicker)
    const input = wrapper.get('input[type="file"]')
    const button = wrapper.get('button')

    expect(input.attributes('accept')).toBe('.pdf,application/pdf')
    expect(input.attributes()).not.toHaveProperty('multiple')
    expect(input.attributes('tabindex')).toBe('-1')
    expect(input.attributes('aria-hidden')).toBe('true')
    expect(button.text()).toBe('Browse PDF')
    expect(button.attributes('aria-describedby')).toBeTruthy()
    expect(wrapper.text()).toContain('Choose a PDF or drag and drop it here.')
  })

  it('opens the native file picker from the browse button', async () => {
    const wrapper = await mountSuspended(BaseResumeFilePicker)
    const input = wrapper.get('input[type="file"]')
    const click = vi.spyOn(input.element as HTMLInputElement, 'click')

    await wrapper.get('button').trigger('click')

    expect(click).toHaveBeenCalledOnce()
  })

  it('emits the first file selected through the native input', async () => {
    const wrapper = await mountSuspended(BaseResumeFilePicker)
    const input = wrapper.get('input[type="file"]')
    const selectedFile = new File(['resume'], 'resume.pdf', {
      type: 'application/pdf',
    })

    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: createFileList(selectedFile),
    })
    await input.trigger('change')

    expect(wrapper.emitted('file-selected')).toEqual([[selectedFile]])
  })

  it('shows drag feedback and emits only the first dropped file', async () => {
    const wrapper = await mountSuspended(BaseResumeFilePicker)
    const dropzone = wrapper.get('section')
    const selectedFile = new File(['resume'], 'resume.pdf', {
      type: 'application/pdf',
    })
    const ignoredFile = new File(['other'], 'other.pdf', {
      type: 'application/pdf',
    })
    const dataTransfer = {
      files: createFileList(selectedFile, ignoredFile),
      types: ['Files'],
    }

    await dropzone.trigger('dragenter', { dataTransfer })

    expect(dropzone.attributes('data-drag-active')).toBe('true')
    expect(wrapper.text()).toContain('Drop your PDF here')

    await dropzone.trigger('drop', { dataTransfer })

    expect(dropzone.attributes('data-drag-active')).toBeUndefined()
    expect(wrapper.emitted('file-selected')).toEqual([[selectedFile]])
  })

  it('prevents browse and drop selection while disabled', async () => {
    const wrapper = await mountSuspended(BaseResumeFilePicker, {
      props: { disabled: true },
    })
    const selectedFile = new File(['resume'], 'resume.pdf', {
      type: 'application/pdf',
    })

    await wrapper.get('section').trigger('drop', {
      dataTransfer: {
        files: createFileList(selectedFile),
        types: ['Files'],
      },
    })

    expect(wrapper.get('section').attributes('aria-disabled')).toBe('true')
    expect(wrapper.get('button').attributes()).toHaveProperty('disabled')
    expect(wrapper.get('input').attributes()).toHaveProperty('disabled')
    expect(wrapper.emitted('file-selected')).toBeUndefined()
  })
})
