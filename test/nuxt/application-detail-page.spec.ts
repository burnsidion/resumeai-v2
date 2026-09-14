import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import type { Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ApplicationEditingForm from '~/components/applications/ApplicationEditingForm.vue'
import ApplicationDetailPage from '~/pages/applications/[id].vue'
import type { ApplicationEditingState } from '~/composables/useApplicationEditing'
import type { UpdateApplicationRequest } from '~~/shared/applications/management'
import type {
  ApplicationDetailResponse,
  ApplicationDetailViewModel,
} from '~~/shared/applications/view-model'
import type { BaseResumesManagementViewModel } from '~~/shared/base-resumes/view-model'

const mocks = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  onBeforeRouteLeave: vi.fn(),
  refreshApplication: vi.fn(),
  refreshBaseResumes: vi.fn(),
  resetEditing: vi.fn(),
  retryEditing: vi.fn(),
  saveApplication: vi.fn(),
  useApplicationEditing: vi.fn(),
  useBaseResumes: vi.fn(),
  useFetch: vi.fn(),
  useRoute: vi.fn(),
}))

mockNuxtImport('navigateTo', () => mocks.navigateTo)
mockNuxtImport('onBeforeRouteLeave', () => mocks.onBeforeRouteLeave)
mockNuxtImport('useApplicationEditing', () => mocks.useApplicationEditing)
mockNuxtImport('useBaseResumes', () => mocks.useBaseResumes)
mockNuxtImport('useFetch', () => mocks.useFetch)
mockNuxtImport('useRoute', () => mocks.useRoute)

const applicationId = '4120cbac-ebf4-4580-8988-3fbc65ca9449'
const resumeId = '465e390d-f7cd-4f11-ac19-80a6cf9760fb'
const application: ApplicationDetailViewModel = {
  appliedOn: null,
  company: 'Northstar Labs',
  createdAt: '2026-09-08T18:00:00.000Z',
  createdLabel: 'Sep 8, 2026',
  id: applicationId,
  jobDescription: 'Build calm, accessible product experiences.',
  notes: null,
  postingUrl: null,
  readiness: {
    isReady: true,
    label: 'Ready for tailoring',
    missingRequirements: [],
  },
  role: 'Senior Frontend Engineer',
  selectedBaseResume: {
    availabilityLabel: 'Active',
    filename: 'Frontend Engineering.pdf',
    id: resumeId,
    isAvailable: true,
  },
  status: 'draft',
  statusLabel: 'Draft',
  statusTone: 'neutral',
  updatedAt: '2026-09-08T18:00:00.000Z',
  updatedLabel: 'Sep 8, 2026',
}
const updatedApplication: ApplicationDetailViewModel = {
  ...application,
  company: 'Northstar Product Labs',
  role: 'Staff Frontend Engineer',
  status: 'interviewing',
  statusLabel: 'Interviewing',
  statusTone: 'attention',
  updatedAt: '2026-09-13T18:00:00.000Z',
  updatedLabel: 'Sep 13, 2026',
}
const response: ApplicationDetailResponse = { application }
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
      id: resumeId,
      sizeBytes: 493_568,
      slotLabel: 'Slot 1',
      statusLabel: 'Active',
      uploadedLabel: 'Uploaded September 1, 2026',
    },
  ],
  remainingSlots: 2,
}
const updateInput: UpdateApplicationRequest = {
  appliedOn: null,
  company: updatedApplication.company,
  expectedUpdatedAt: application.updatedAt,
  jobDescription: application.jobDescription,
  notes: null,
  postingUrl: null,
  role: updatedApplication.role,
  selectedBaseResumeId: resumeId,
  status: updatedApplication.status,
}

let applicationData: Ref<ApplicationDetailResponse | null>
let applicationError: Ref<unknown>
let applicationRequestStatus: Ref<'error' | 'pending' | 'success'>
let baseResumeRequestStatus: Ref<'error' | 'pending' | 'success'>
let editingState: Ref<ApplicationEditingState>

const getButton = (wrapper: VueWrapper, label: string) => {
  const button = wrapper
    .findAll('button')
    .find((candidate) => candidate.text().trim() === label)

  if (!button) {
    throw new Error(`Expected a ${label} button.`)
  }

  return button
}

describe('application detail page', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    applicationData = ref(response)
    applicationError = ref(null)
    applicationRequestStatus = ref('success')
    baseResumeRequestStatus = ref('success')
    editingState = ref<ApplicationEditingState>({ status: 'idle' })

    mocks.navigateTo.mockResolvedValue(undefined)
    mocks.refreshApplication.mockImplementation(async () => {
      applicationData.value = response
      applicationError.value = null
      applicationRequestStatus.value = 'success'
    })
    mocks.refreshBaseResumes.mockResolvedValue(undefined)
    mocks.saveApplication.mockResolvedValue(updatedApplication)
    mocks.retryEditing.mockResolvedValue(updatedApplication)
    mocks.useRoute.mockReturnValue({ params: { id: applicationId } })
    mocks.useFetch.mockReturnValue({
      data: applicationData,
      error: applicationError,
      refresh: mocks.refreshApplication,
      status: applicationRequestStatus,
    })
    mocks.useBaseResumes.mockReturnValue({
      data: ref(baseResumes),
      refresh: mocks.refreshBaseResumes,
      status: baseResumeRequestStatus,
    })
    mocks.useApplicationEditing.mockReturnValue({
      isBusy: computed(() => editingState.value.status === 'saving'),
      reset: mocks.resetEditing,
      retry: mocks.retryEditing,
      save: mocks.saveApplication,
      state: readonly(editingState),
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(window, 'confirm')
    vi.restoreAllMocks()
  })

  it('composes the editable workspace from the trusted detail and resume loaders', async () => {
    const wrapper = await mountSuspended(ApplicationDetailPage)
    const form = wrapper.getComponent(ApplicationEditingForm)

    expect(mocks.useFetch).toHaveBeenCalledWith(
      `/api/applications/${applicationId}`,
      expect.objectContaining({ key: `application-detail-${applicationId}` }),
      expect.anything(),
    )
    expect(mocks.useBaseResumes).toHaveBeenCalledOnce()
    expect(mocks.useApplicationEditing).toHaveBeenCalledOnce()
    expect(wrapper.get('h1').text()).toBe('Senior Frontend Engineer')
    expect(wrapper.text()).toContain('Northstar Labs')
    expect(wrapper.text()).toContain('Updated Sep 8, 2026')
    expect(form.props('application')).toEqual(application)
    expect(form.props('baseResumes')).toEqual(baseResumes.items)
    expect(form.props('baseResumesStatus')).toBe('success')
    expect(wrapper.text()).not.toContain('Application saved')
  })

  it('replaces the editing snapshot only after a confirmed update', async () => {
    const wrapper = await mountSuspended(ApplicationDetailPage)
    const submit = wrapper.getComponent(ApplicationEditingForm).props('submit')

    await expect(submit(updateInput)).resolves.toEqual(updatedApplication)
    await flushPromises()

    expect(mocks.saveApplication).toHaveBeenCalledWith(
      applicationId,
      updateInput,
    )
    expect(applicationData.value).toEqual({ application: updatedApplication })
    expect(wrapper.get('h1').text()).toBe('Staff Frontend Engineer')
    expect(wrapper.text()).toContain('Northstar Product Labs')
    expect(wrapper.text()).toContain('Updated Sep 13, 2026')
    expect(wrapper.get('[role="status"]').text()).toContain(
      'Changes to Staff Frontend Engineer were saved.',
    )
    expect(mocks.resetEditing).toHaveBeenCalledOnce()
  })

  it('asks before leaving with unsaved changes and respects cancellation', async () => {
    const confirm = vi.fn().mockReturnValue(false)
    Object.defineProperty(window, 'confirm', {
      configurable: true,
      value: confirm,
    })
    const wrapper = await mountSuspended(ApplicationDetailPage)
    const form = wrapper.getComponent(ApplicationEditingForm)

    form.vm.$emit('dirty-changed', true)
    form.vm.$emit('cancel')
    await flushPromises()

    expect(confirm).toHaveBeenCalledOnce()
    expect(mocks.navigateTo).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    form.vm.$emit('cancel')
    await flushPromises()

    expect(mocks.navigateTo).toHaveBeenCalledWith('/applications')
  })

  it('coordinates explicit save and resume recovery without bypassing the form', async () => {
    const wrapper = await mountSuspended(ApplicationDetailPage)
    const form = wrapper.getComponent(ApplicationEditingForm)

    form.vm.$emit('recovery-requested', 'refresh-base-resumes')
    await flushPromises()
    expect(mocks.refreshBaseResumes).toHaveBeenCalledOnce()
    expect(mocks.resetEditing).toHaveBeenCalledOnce()

    form.vm.$emit('details-changed')
    expect(mocks.resetEditing).toHaveBeenCalledTimes(2)

    form.vm.$emit('recovery-requested', 'retry')
    await flushPromises()
    expect(mocks.retryEditing).toHaveBeenCalledOnce()
    expect(applicationData.value).toEqual({ application: updatedApplication })
    expect(mocks.resetEditing).toHaveBeenCalledTimes(3)
  })

  it('reloads trusted state after an uncertain or conflicting save', async () => {
    const wrapper = await mountSuspended(ApplicationDetailPage)
    const form = wrapper.getComponent(ApplicationEditingForm)

    form.vm.$emit('dirty-changed', true)
    form.vm.$emit('recovery-requested', 'refresh-application')
    await flushPromises()

    expect(mocks.refreshApplication).toHaveBeenCalledOnce()
    expect(applicationData.value).toEqual(response)
    expect(mocks.resetEditing).toHaveBeenCalledOnce()
    expect(wrapper.get('h1').text()).toBe('Senior Frontend Engineer')
  })

  it.each([
    {
      expectedHeading: 'This application can’t be opened',
      expectedLabel: 'Application unavailable',
      statusCode: 404,
    },
    {
      expectedHeading: 'This application can’t be opened',
      expectedLabel: 'Application unavailable',
      statusCode: 400,
    },
  ])(
    'uses the same safe unavailable state for a $statusCode response',
    async ({ expectedHeading, expectedLabel, statusCode }) => {
      applicationData.value = null
      applicationError.value = {
        data: { message: 'Sensitive provider details' },
        statusCode,
      }
      applicationRequestStatus.value = 'error'

      const wrapper = await mountSuspended(ApplicationDetailPage)

      expect(wrapper.get('[role="alert"]').text()).toContain(expectedLabel)
      expect(wrapper.get('h1').text()).toBe(expectedHeading)
      expect(wrapper.text()).toContain(
        'It may no longer exist, or it may not be available to your account.',
      )
      expect(wrapper.text()).not.toContain('Sensitive provider details')
      expect(wrapper.text()).not.toContain('Try again')
    },
  )

  it('offers retry for transient loading failures without exposing provider details', async () => {
    applicationData.value = null
    applicationError.value = {
      data: { message: 'Sensitive provider details' },
      statusCode: 503,
    }
    applicationRequestStatus.value = 'error'

    const wrapper = await mountSuspended(ApplicationDetailPage)

    expect(wrapper.get('h1').text()).toBe('We couldn’t load this application')
    expect(wrapper.text()).not.toContain('Sensitive provider details')

    await getButton(wrapper, 'Try again').trigger('click')
    await flushPromises()

    expect(mocks.refreshApplication).toHaveBeenCalledOnce()
    expect(wrapper.findComponent(ApplicationEditingForm).exists()).toBe(true)
  })

  it('offers a trusted sign-in recovery when the session expires', async () => {
    applicationData.value = null
    applicationError.value = { statusCode: 401 }
    applicationRequestStatus.value = 'error'

    const wrapper = await mountSuspended(ApplicationDetailPage)

    expect(wrapper.get('h1').text()).toBe('Sign in to continue')
    await getButton(wrapper, 'Return to sign in').trigger('click')
    await flushPromises()

    expect(mocks.navigateTo).toHaveBeenCalledWith('/sign-in', {
      replace: true,
    })
  })

  it('renders a restrained loading state', async () => {
    applicationData.value = null
    applicationRequestStatus.value = 'pending'

    const wrapper = await mountSuspended(ApplicationDetailPage)

    expect(wrapper.get('[aria-busy="true"]').text()).toContain(
      'Loading your application',
    )
    expect(wrapper.text()).toContain('Preparing the latest saved details')
  })
})
