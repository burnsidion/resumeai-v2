import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'

import DocumentPreviewDialog from '~/components/documents/DocumentPreviewDialog.vue'

const previewUrl =
  'http://127.0.0.1:54321/storage/v1/object/sign/base-resumes/signed-token'

let wrappers: VueWrapper[] = []

const mountDialog = (
  props: Partial<{
    contextLabel: string
    documentName: string
    open: boolean
    state:
      | { status: 'loading' }
      | { status: 'ready'; url: string }
      | { actionLabel: string; message: string; status: 'failure' }
  }> = {},
) =>
  mountSuspended(DocumentPreviewDialog, {
    attachTo: document.body,
    props: {
      contextLabel: 'Original PDF · Private · Immutable',
      documentName: 'Frontend Engineering.pdf',
      open: true,
      state: { status: 'loading' },
      ...props,
    },
  }).then((wrapper) => {
    wrappers.push(wrapper)
    return wrapper
  })

afterEach(() => {
  wrappers.forEach((wrapper) => wrapper.unmount())
  wrappers = []
  document.body.style.overflow = ''
})

describe('document preview dialog', () => {
  it('renders a truthful private-document loading state', async () => {
    const wrapper = await mountDialog()
    const dialog = wrapper.get('[role="dialog"]')

    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.attributes('aria-labelledby')).toBeTruthy()
    expect(dialog.attributes('aria-describedby')).toBeTruthy()
    expect(dialog.attributes('aria-busy')).toBe('true')
    expect(wrapper.text()).toContain('Frontend Engineering.pdf')
    expect(wrapper.text()).toContain('Original PDF · Private · Immutable')
    expect(wrapper.get('[role="status"]').text()).toContain(
      'Preparing secure preview',
    )
    expect(wrapper.text()).toContain(
      'Creating short-lived access to your private original PDF',
    )
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.find('a[target="_blank"]').exists()).toBe(false)
    expect(dialog.classes()).toContain('h-dvh')
    expect(dialog.classes()).toContain('sm:max-w-6xl')
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('renders the native PDF surface with an always-available fallback', async () => {
    const wrapper = await mountDialog({
      state: { status: 'ready', url: previewUrl },
    })
    const iframe = wrapper.get('iframe')
    const fallbackLinks = wrapper.findAll('a[target="_blank"]')

    expect(iframe.attributes('src')).toBe(previewUrl)
    expect(iframe.attributes('title')).toBe(
      'Preview of Frontend Engineering.pdf',
    )
    expect(iframe.attributes('referrerpolicy')).toBe('no-referrer')
    expect(iframe.attributes('sandbox')).toBeUndefined()
    expect(wrapper.get('[role="dialog"]').attributes('aria-busy')).toBeFalsy()
    expect(fallbackLinks).toHaveLength(1)

    fallbackLinks.forEach((link) => {
      expect(link.attributes('href')).toBe(previewUrl)
      expect(link.attributes('rel')).toBe('noopener noreferrer')
      expect(link.text()).toContain('Open in new tab')
    })
  })

  it('presents only the supplied safe failure and delegates its action', async () => {
    const wrapper = await mountDialog({
      state: {
        actionLabel: 'Try again',
        message: 'Resume preview is temporarily unavailable. Try again.',
        status: 'failure',
      },
    })

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Resume preview is temporarily unavailable',
    )
    expect(wrapper.text()).not.toContain('private provider detail')
    expect(wrapper.find('iframe').exists()).toBe(false)

    await wrapper.get('button:not([aria-label])').trigger('click')

    expect(wrapper.emitted('error-action')).toHaveLength(1)
  })

  it('closes from the close control, backdrop, or Escape even while loading', async () => {
    const wrapper = await mountDialog()

    await wrapper
      .get('button[aria-label="Close document preview"]')
      .trigger('click')
    await wrapper.trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(wrapper.emitted('close')).toHaveLength(3)
  })

  it('traps focus and restores it to the opening control', async () => {
    const opener = document.createElement('button')
    opener.textContent = 'Preview selected resume'
    document.body.append(opener)
    opener.focus()

    const wrapper = await mountDialog({ open: false })
    await wrapper.setProps({ open: true })
    await nextTick()

    const dialog = wrapper.get<HTMLElement>('[role="dialog"]')
    const closeButton = wrapper.get<HTMLButtonElement>(
      'button[aria-label="Close document preview"]',
    )

    expect(document.activeElement).toBe(dialog.element)

    closeButton.element.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    expect(document.activeElement).toBe(closeButton.element)

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }),
    )
    expect(document.activeElement).toBe(closeButton.element)

    await wrapper.setProps({ open: false })
    await nextTick()

    expect(document.activeElement).toBe(opener)
    expect(document.body.style.overflow).toBe('')
    expect(wrapper.emitted('focus-fallback-requested')).toBeUndefined()

    opener.remove()
  })

  it('requests owning-surface focus recovery if the opener disappears', async () => {
    const opener = document.createElement('button')
    opener.textContent = 'Preview transient resume'
    document.body.append(opener)
    opener.focus()

    const wrapper = await mountDialog({ open: false })
    await wrapper.setProps({ open: true })
    await nextTick()

    opener.remove()
    await wrapper.setProps({ open: false })
    await nextTick()

    expect(wrapper.emitted('focus-fallback-requested')).toHaveLength(1)
  })
})
