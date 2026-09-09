import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import type { Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ApplicationCreationForm from '~/components/applications/ApplicationCreationForm.vue'
import ApplicationCreationPage from '~/pages/applications/new.vue'
import type { ApplicationCreationState } from '~/composables/useApplicationCreation'
import type { CreateApplicationRequest } from '~~/shared/applications/management'
import type { ApplicationDetailViewModel } from '~~/shared/applications/view-model'
import type { BaseResumesManagementViewModel } from '~~/shared/base-resumes/view-model'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  navigateTo: vi.fn(),
  refreshBaseResumes: vi.fn(),
  reset: vi.fn(),
  retry: vi.fn(),
  useApplicationCreation: vi.fn(),
  useBaseResumes: vi.fn(),
}))

mockNuxtImport('navigateTo', () => mocks.navigateTo)
mockNuxtImport('useApplicationCreation', () => mocks.useApplicationCreation)
mockNuxtImport('useBaseResumes', () => mocks.useBaseResumes)

const application: ApplicationDetailViewModel = {
  appliedOn: null,
  company: 'Northstar Labs',
  createdAt: '2026-09-08T18:00:00.000Z',
  createdLabel: 'Sep 8, 2026',
  id: '4120cbac-ebf4-4580-8988-3fbc65ca9449',
  jobDescription: null,
  notes: null,
  postingUrl: null,
  readiness: {
    isReady: false,
    label: 'Not ready for tailoring',
    missingRequirements: [
      { id: 'job-description', label: 'Add a job description' },
      { id: 'base-resume', label: 'Select an active base resume' },
    ],
  },
  role: 'Senior Frontend Engineer',
  selectedBaseResume: null,
  status: 'draft',
  statusLabel: 'Draft',
  statusTone: 'neutral',
  updatedAt: '2026-09-08T18:00:00.000Z',
  updatedLabel: 'Sep 8, 2026',
}

const input: CreateApplicationRequest = {
  company: application.company,
  jobDescription: null,
  notes: null,
  postingUrl: null,
  role: application.role,
  selectedBaseResumeId: null,
}

const baseResumes: BaseResumesManagementViewModel = {
  activeCount: 1,
  activeCountLabel: '1 active resume',
  activeLimit: 3,
  capacityAriaLabel: '1 of 3 active resume slots in use',
  capacityLabel: '1 of 3 active',
  capacityStatusLabel: '2 resume slots available',
  items: [
    {
      activeSlot: 1,
      createdAt: '2026-09-01T18:00:00.000Z',
      fileSizeLabel: '482 KiB',
      filename: 'Frontend Engineering.pdf',
      id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
      sizeBytes: 493_568,
      slotLabel: 'Slot 1',
      statusLabel: 'Active',
      uploadedLabel: 'Uploaded September 1, 2026',
    },
  ],
  remainingSlots: 2,
}

let creationState: Ref<ApplicationCreationState>

describe('application creation page', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    creationState = ref<ApplicationCreationState>({ status: 'idle' })
    mocks.navigateTo.mockResolvedValue(undefined)
    mocks.create.mockResolvedValue(application)
    mocks.retry.mockResolvedValue(application)
    mocks.refreshBaseResumes.mockResolvedValue(undefined)
    mocks.useApplicationCreation.mockReturnValue({
      create: mocks.create,
      isBusy: computed(() => creationState.value.status === 'creating'),
      reset: mocks.reset,
      retry: mocks.retry,
      state: readonly(creationState),
    })
    mocks.useBaseResumes.mockReturnValue({
      data: ref(baseResumes),
      refresh: mocks.refreshBaseResumes,
      status: ref('success'),
    })
  })

  it('composes the protected creation experience from existing client abstractions', async () => {
    const wrapper = await mountSuspended(ApplicationCreationPage)
    const form = wrapper.getComponent(ApplicationCreationForm)

    expect(wrapper.get('h1').text()).toBe('Create application')
    expect(wrapper.text()).toContain('Creates as Draft')
    expect(wrapper.text()).toContain('Frontend Engineering.pdf')
    expect(form.props('baseResumes')).toEqual(baseResumes.items)
    expect(mocks.useBaseResumes).toHaveBeenCalledOnce()
    expect(mocks.useApplicationCreation).toHaveBeenCalledOnce()
  })

  it('navigates only after creation returns the confirmed application', async () => {
    const wrapper = await mountSuspended(ApplicationCreationPage)
    const submit = wrapper.getComponent(ApplicationCreationForm).props('submit')

    await expect(submit(input)).resolves.toEqual(application)

    expect(mocks.create).toHaveBeenCalledWith(input)
    expect(mocks.navigateTo).toHaveBeenCalledWith(
      `/applications/${application.id}`,
    )
  })

  it('returns to the dashboard from cancellation and uncertain-save recovery', async () => {
    const wrapper = await mountSuspended(ApplicationCreationPage)
    const form = wrapper.getComponent(ApplicationCreationForm)

    form.vm.$emit('cancel')
    form.vm.$emit('recovery-requested', 'check-dashboard')
    await flushPromises()

    expect(mocks.navigateTo).toHaveBeenCalledTimes(2)
    expect(mocks.navigateTo).toHaveBeenNthCalledWith(1, '/dashboard')
    expect(mocks.navigateTo).toHaveBeenNthCalledWith(2, '/dashboard')
  })

  it('owns retry, resume refresh, and expired-session navigation', async () => {
    const wrapper = await mountSuspended(ApplicationCreationPage)
    const form = wrapper.getComponent(ApplicationCreationForm)

    form.vm.$emit('recovery-requested', 'retry')
    await flushPromises()
    expect(mocks.retry).toHaveBeenCalledOnce()
    expect(mocks.navigateTo).toHaveBeenCalledWith(
      `/applications/${application.id}`,
    )

    form.vm.$emit('recovery-requested', 'refresh-base-resumes')
    await flushPromises()
    expect(mocks.refreshBaseResumes).toHaveBeenCalledOnce()
    expect(mocks.reset).toHaveBeenCalledOnce()

    form.vm.$emit('recovery-requested', 'sign-in')
    await flushPromises()
    expect(mocks.navigateTo).toHaveBeenCalledWith('/sign-in', {
      replace: true,
    })
  })
})
