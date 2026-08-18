import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import BaseResumeUploadDialog from '~/components/base-resumes/BaseResumeUploadDialog.vue'
import BaseResumesPage from '~/pages/base-resumes.vue'
import {
  baseResumesManagementViewModelSchema,
  type BaseResumesManagementViewModel,
} from '../../shared/base-resumes/view-model'

const { refreshMock, useBaseResumesMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  useBaseResumesMock: vi.fn(),
}))

mockNuxtImport('useBaseResumes', () => useBaseResumesMock)

const managementItems = [
  {
    activeSlot: 1 as const,
    createdAt: '2026-08-08T18:00:00+00:00',
    fileSizeLabel: '482 KiB',
    filename: 'Frontend Engineering.pdf',
    id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
    sizeBytes: 493_568,
    slotLabel: 'Slot 1',
    statusLabel: 'Active' as const,
    uploadedLabel: 'Uploaded August 8, 2026',
  },
  {
    activeSlot: 2 as const,
    createdAt: '2026-08-02T18:00:00+00:00',
    fileSizeLabel: '615 KiB',
    filename: 'Accessibility Specialist.pdf',
    id: '2d1f2ca0-a46e-42df-99c9-5a362f291a46',
    sizeBytes: 629_760,
    slotLabel: 'Slot 2',
    statusLabel: 'Active' as const,
    uploadedLabel: 'Uploaded August 2, 2026',
  },
  {
    activeSlot: 3 as const,
    createdAt: '2026-07-27T18:00:00+00:00',
    fileSizeLabel: '528 KiB',
    filename: 'Product Engineering.pdf',
    id: '7077c821-56ad-4a0a-921f-68a1020a5652',
    sizeBytes: 540_672,
    slotLabel: 'Slot 3',
    statusLabel: 'Active' as const,
    uploadedLabel: 'Uploaded July 27, 2026',
  },
]

const partialBaseResumes: BaseResumesManagementViewModel =
  baseResumesManagementViewModelSchema.parse({
    activeCount: 2,
    activeCountLabel: '2 active',
    activeLimit: 3,
    capacityAriaLabel: 'Two of three active resume slots used',
    capacityLabel: '2 of 3 resumes',
    capacityStatusLabel: 'One slot available',
    items: managementItems.slice(0, 2),
    remainingSlots: 1,
  })

const setBaseResumesState = (
  data: BaseResumesManagementViewModel | null,
  status: 'error' | 'pending' | 'success',
): void => {
  useBaseResumesMock.mockReturnValue({
    data: ref(data),
    error: ref(status === 'error' ? new Error('provider details') : null),
    refresh: refreshMock,
    status: ref(status),
  })
}

describe('Base Resumes page', () => {
  beforeEach(() => {
    refreshMock.mockReset()
    refreshMock.mockResolvedValue(undefined)
    useBaseResumesMock.mockReset()
    setBaseResumesState(partialBaseResumes, 'success')
  })

  it('renders trusted active-resume details and partial capacity', async () => {
    const wrapper = await mountSuspended(BaseResumesPage)

    expect(useBaseResumesMock).toHaveBeenCalledOnce()
    expect(wrapper.get('h1').text()).toBe('Base resumes')
    expect(wrapper.text()).toContain('2 of 3 resumes')
    expect(wrapper.text()).toContain('One slot available')
    expect(wrapper.text()).toContain('Frontend Engineering.pdf')
    expect(wrapper.text()).toContain('Accessibility Specialist.pdf')
    expect(wrapper.text()).toContain('482 KiB')
    expect(wrapper.text()).toContain('Uploaded August 8, 2026')
    expect(wrapper.text()).toContain('Original PDF preserved')
    expect(wrapper.text()).not.toContain('Retire resume')
    expect(wrapper.get('button').text().includes('Upload base resume')).toBe(
      true,
    )
    expect(wrapper.text()).toContain('Upload another base resume')
  })

  it('renders zero resumes as guidance with a real upload entry point', async () => {
    setBaseResumesState(
      baseResumesManagementViewModelSchema.parse({
        activeCount: 0,
        activeCountLabel: '0 active',
        activeLimit: 3,
        capacityAriaLabel: 'Zero of three active resume slots used',
        capacityLabel: '0 of 3 resumes',
        capacityStatusLabel: 'Three slots available',
        items: [],
        remainingSlots: 3,
      }),
      'success',
    )

    const wrapper = await mountSuspended(BaseResumesPage)

    expect(wrapper.text()).toContain('Add your first base resume')
    expect(wrapper.text()).toContain('PDF only · Maximum 10 MiB')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)

    const choosePdf = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Choose a PDF')

    await choosePdf?.trigger('click')

    expect(wrapper.findAll('[role="dialog"]')).toHaveLength(1)
  })

  it('renders full capacity without upload or retirement controls', async () => {
    setBaseResumesState(
      baseResumesManagementViewModelSchema.parse({
        activeCount: 3,
        activeCountLabel: '3 active',
        activeLimit: 3,
        capacityAriaLabel: 'All three active resume slots used',
        capacityLabel: '3 of 3 resumes',
        capacityStatusLabel: 'All active slots are in use',
        items: managementItems,
        remainingSlots: 0,
      }),
      'success',
    )

    const wrapper = await mountSuspended(BaseResumesPage)

    expect(wrapper.text()).toContain('All active slots are in use')
    expect(wrapper.text()).toContain('Product Engineering.pdf')
    expect(
      wrapper.findAll('button').some((button) => /upload/i.test(button.text())),
    ).toBe(false)
    expect(wrapper.text()).not.toContain('Retire')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('renders loading and sanitized recoverable failure states', async () => {
    setBaseResumesState(null, 'pending')
    const loadingWrapper = await mountSuspended(BaseResumesPage)

    expect(loadingWrapper.get('[aria-busy="true"]')).toBeTruthy()
    expect(loadingWrapper.text()).toContain('Loading base resumes')

    setBaseResumesState(null, 'error')
    const errorWrapper = await mountSuspended(BaseResumesPage)

    expect(errorWrapper.get('[role="alert"]').text()).toContain(
      'Base resumes unavailable',
    )
    expect(errorWrapper.text()).not.toContain('provider details')

    await errorWrapper.get('button').trigger('click')

    expect(refreshMock).toHaveBeenCalledOnce()
  })

  it('refreshes trusted page data after a confirmed upload', async () => {
    const wrapper = await mountSuspended(BaseResumesPage)
    const uploadButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Upload base resume')

    await uploadButton?.trigger('click')
    wrapper.getComponent(BaseResumeUploadDialog).vm.$emit('uploaded', {
      activeSlot: 3,
      createdAt: '2026-07-27T18:00:00+00:00',
      id: '7077c821-56ad-4a0a-921f-68a1020a5652',
      originalFilename: 'Product Engineering.pdf',
    })
    await flushPromises()

    expect(refreshMock).toHaveBeenCalledOnce()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
  })
})
