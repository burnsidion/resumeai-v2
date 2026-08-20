import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { ref, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import BaseResumeRetirementDialog from '~/components/base-resumes/BaseResumeRetirementDialog.vue'
import BaseResumeUploadDialog from '~/components/base-resumes/BaseResumeUploadDialog.vue'
import BaseResumesPage from '~/pages/base-resumes.vue'
import {
  baseResumesManagementViewModelSchema,
  type BaseResumesManagementViewModel,
} from '../../shared/base-resumes/view-model'

const { navigateToMock, refreshMock, useBaseResumesMock } = vi.hoisted(() => ({
  navigateToMock: vi.fn(),
  refreshMock: vi.fn(),
  useBaseResumesMock: vi.fn(),
}))

mockNuxtImport('useBaseResumes', () => useBaseResumesMock)
mockNuxtImport('navigateTo', () => navigateToMock)

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

let baseResumesData: Ref<BaseResumesManagementViewModel | null>
let baseResumesStatus: Ref<'error' | 'pending' | 'success'>

const setBaseResumesState = (
  data: BaseResumesManagementViewModel | null,
  status: 'error' | 'pending' | 'success',
): void => {
  baseResumesData = ref(data)
  baseResumesStatus = ref(status)
  useBaseResumesMock.mockReturnValue({
    data: baseResumesData,
    error: ref(status === 'error' ? new Error('provider details') : null),
    refresh: refreshMock,
    status: baseResumesStatus,
  })
}

describe('Base Resumes page', () => {
  beforeEach(() => {
    navigateToMock.mockReset()
    navigateToMock.mockResolvedValue(undefined)
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
    expect(
      wrapper
        .findAll('button')
        .filter((button) => button.text().trim() === 'Retire resume'),
    ).toHaveLength(2)
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

  it('renders full capacity with retirement guidance but no upload controls', async () => {
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
    expect(wrapper.text()).toContain(
      'Retire a resume to make another active slot available.',
    )
    expect(
      wrapper
        .findAll('button')
        .filter((button) => button.text().trim() === 'Retire resume'),
    ).toHaveLength(3)
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

  it('opens confirmation for the selected resume without retiring immediately', async () => {
    const wrapper = await mountSuspended(BaseResumesPage)
    const retireButtons = wrapper
      .findAll('button')
      .filter((button) => button.text().trim() === 'Retire resume')

    await retireButtons[1]?.trigger('click')

    const dialog = wrapper.getComponent(BaseResumeRetirementDialog)
    expect(dialog.props('resume')).toEqual(managementItems[1])
    expect(dialog.text()).toContain('Accessibility Specialist.pdf')
    expect(dialog.text()).toContain('Slot 2 will become available')
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('reconciles the active collection and capacity through trusted refresh', async () => {
    const refreshedBaseResumes = baseResumesManagementViewModelSchema.parse({
      activeCount: 1,
      activeCountLabel: '1 active',
      activeLimit: 3,
      capacityAriaLabel: 'One of three active resume slots used',
      capacityLabel: '1 of 3 resumes',
      capacityStatusLabel: 'Two slots available',
      items: [managementItems[1]],
      remainingSlots: 2,
    })
    refreshMock.mockImplementationOnce(async () => {
      baseResumesData.value = refreshedBaseResumes
      baseResumesStatus.value = 'success'
    })
    const wrapper = await mountSuspended(BaseResumesPage, {
      attachTo: document.body,
    })
    const retireButton = wrapper
      .findAll('button')
      .find(
        (button) =>
          button.attributes('aria-label') === 'Retire Frontend Engineering.pdf',
      )

    retireButton?.element.focus()
    await retireButton?.trigger('click')
    wrapper.getComponent(BaseResumeRetirementDialog).vm.$emit('retired', {
      id: managementItems[0]!.id,
      retiredAt: '2026-08-19T20:00:00+00:00',
    })
    await flushPromises()

    expect(refreshMock).toHaveBeenCalledOnce()
    expect(wrapper.findComponent(BaseResumeRetirementDialog).exists()).toBe(
      false,
    )
    expect(wrapper.text()).not.toContain('Frontend Engineering.pdf')
    expect(wrapper.text()).toContain('Accessibility Specialist.pdf')
    expect(wrapper.text()).toContain('1 of 3 resumes')
    expect(wrapper.text()).toContain('Two slots available')
    expect(wrapper.text()).toContain('Upload another base resume')
    expect(document.activeElement).toBe(wrapper.get('h1').element)

    wrapper.unmount()
  })

  it.each([{ recovery: 'refresh' as const }, { recovery: 'sign-in' as const }])(
    'keeps $recovery recovery at the page boundary',
    async ({ recovery }) => {
      const wrapper = await mountSuspended(BaseResumesPage)
      const retireButton = wrapper
        .findAll('button')
        .find(
          (button) =>
            button.attributes('aria-label') ===
            'Retire Frontend Engineering.pdf',
        )

      await retireButton?.trigger('click')
      wrapper
        .getComponent(BaseResumeRetirementDialog)
        .vm.$emit('recovery-requested', recovery)
      await flushPromises()

      expect(wrapper.findComponent(BaseResumeRetirementDialog).exists()).toBe(
        false,
      )

      if (recovery === 'refresh') {
        expect(refreshMock).toHaveBeenCalledOnce()
        expect(navigateToMock).not.toHaveBeenCalled()
      } else {
        expect(refreshMock).not.toHaveBeenCalled()
        expect(navigateToMock).toHaveBeenCalledWith('/sign-in')
      }
    },
  )

  it('keeps an uncertain retirement open when trusted refresh fails', async () => {
    refreshMock.mockImplementationOnce(async () => {
      baseResumesStatus.value = 'error'
    })
    const wrapper = await mountSuspended(BaseResumesPage)
    const retireButton = wrapper
      .findAll('button')
      .find(
        (button) =>
          button.attributes('aria-label') === 'Retire Frontend Engineering.pdf',
      )

    await retireButton?.trigger('click')
    wrapper
      .getComponent(BaseResumeRetirementDialog)
      .vm.$emit('recovery-requested', 'refresh')
    await flushPromises()

    expect(refreshMock).toHaveBeenCalledOnce()
    expect(wrapper.findComponent(BaseResumeRetirementDialog).exists()).toBe(
      true,
    )
  })
})
