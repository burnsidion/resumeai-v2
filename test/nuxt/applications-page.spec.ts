import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ApplicationsPageContent from '~/components/applications/ApplicationsPageContent.vue'
import ApplicationsPage from '~/pages/applications/index.vue'
import type { ApplicationListViewModel } from '~~/shared/applications/view-model'

const { navigateToMock, refreshMock, useApplicationsMock } = vi.hoisted(() => ({
  navigateToMock: vi.fn(),
  refreshMock: vi.fn(),
  useApplicationsMock: vi.fn(),
}))

mockNuxtImport('navigateTo', () => navigateToMock)
mockNuxtImport('useApplications', () => useApplicationsMock)

const populatedApplications: ApplicationListViewModel = {
  applications: [
    {
      company: 'Northstar Labs',
      id: '4120cbac-ebf4-4580-8988-3fbc65ca9449',
      readiness: {
        isReady: true,
        label: 'Ready for tailoring',
        missingRequirements: [],
      },
      role: 'Senior Frontend Engineer',
      status: 'draft',
      statusLabel: 'Draft',
      statusTone: 'neutral',
      updatedAt: '2026-09-08T18:00:00+00:00',
      updatedLabel: '8 Sep 2026',
    },
  ],
}

let applicationsData: Ref<ApplicationListViewModel | null>
let applicationsStatus: Ref<'error' | 'pending' | 'success'>

const setApplicationsState = (
  data: ApplicationListViewModel | null,
  status: 'error' | 'pending' | 'success',
): void => {
  applicationsData = ref(data)
  applicationsStatus = ref(status)
  useApplicationsMock.mockReturnValue({
    data: applicationsData,
    error: ref(
      status === 'error' ? new Error('private provider details') : null,
    ),
    refresh: refreshMock,
    status: applicationsStatus,
  })
}

describe('Applications page', () => {
  beforeEach(() => {
    navigateToMock.mockReset()
    navigateToMock.mockResolvedValue(undefined)
    refreshMock.mockReset()
    refreshMock.mockResolvedValue(undefined)
    useApplicationsMock.mockReset()
    setApplicationsState(populatedApplications, 'success')
  })

  it('renders the trusted collection and owns creation navigation', async () => {
    const wrapper = await mountSuspended(ApplicationsPage)

    expect(useApplicationsMock).toHaveBeenCalledOnce()
    expect(wrapper.getComponent(ApplicationsPageContent).props()).toMatchObject(
      {
        applications: populatedApplications,
      },
    )
    expect(wrapper.text()).toContain('Senior Frontend Engineer')

    await wrapper.get('button').trigger('click')

    expect(navigateToMock).toHaveBeenCalledOnce()
    expect(navigateToMock).toHaveBeenCalledWith('/applications/new')
  })

  it('treats an empty collection as a successful product state', async () => {
    setApplicationsState({ applications: [] }, 'success')

    const wrapper = await mountSuspended(ApplicationsPage)

    expect(wrapper.text()).toContain('Create your first application')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(false)
  })

  it('preserves the page shape while loading', async () => {
    setApplicationsState(null, 'pending')

    const wrapper = await mountSuspended(ApplicationsPage)

    expect(wrapper.get('[aria-busy="true"]')).toBeTruthy()
    expect(wrapper.get('h1').text()).toBe('Applications')
    expect(wrapper.text()).toContain('Loading applications…')
    expect(wrapper.findComponent(ApplicationsPageContent).exists()).toBe(false)
  })

  it('renders a sanitized recoverable error and retries the trusted request', async () => {
    setApplicationsState(null, 'error')

    const wrapper = await mountSuspended(ApplicationsPage)
    const error = wrapper.get('[role="alert"]')

    expect(error.text()).toContain('Applications unavailable')
    expect(error.text()).toContain('Your information has not been changed')
    expect(wrapper.text()).not.toContain('private provider details')
    expect(wrapper.findComponent(ApplicationsPageContent).exists()).toBe(false)

    await error.get('button').trigger('click')

    expect(refreshMock).toHaveBeenCalledOnce()
  })
})
