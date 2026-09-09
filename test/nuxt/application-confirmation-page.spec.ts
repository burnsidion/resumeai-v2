import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ApplicationConfirmationPage from '~/pages/applications/[id].vue'
import type { ApplicationDetailResponse } from '~~/shared/applications/view-model'

const mocks = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  refresh: vi.fn(),
  useFetch: vi.fn(),
  useRoute: vi.fn(),
}))

mockNuxtImport('navigateTo', () => mocks.navigateTo)
mockNuxtImport('useFetch', () => mocks.useFetch)
mockNuxtImport('useRoute', () => mocks.useRoute)

const applicationId = '4120cbac-ebf4-4580-8988-3fbc65ca9449'
const response: ApplicationDetailResponse = {
  application: {
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
      id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
      isAvailable: true,
    },
    status: 'draft',
    statusLabel: 'Draft',
    statusTone: 'neutral',
    updatedAt: '2026-09-08T18:00:00.000Z',
    updatedLabel: 'Sep 8, 2026',
  },
}

describe('application confirmation page', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.navigateTo.mockResolvedValue(undefined)
    mocks.refresh.mockResolvedValue(undefined)
    mocks.useRoute.mockReturnValue({ params: { id: applicationId } })
    mocks.useFetch.mockReturnValue({
      data: ref(response),
      refresh: mocks.refresh,
      status: ref('success'),
    })
  })

  it('confirms the trusted application without exposing later editing or tailoring actions', async () => {
    const wrapper = await mountSuspended(ApplicationConfirmationPage)

    expect(mocks.useFetch).toHaveBeenCalledWith(
      `/api/applications/${applicationId}`,
      expect.objectContaining({
        key: `application-confirmation-${applicationId}`,
      }),
      expect.anything(),
    )
    expect(wrapper.get('h1').text()).toBe('Senior Frontend Engineer')
    expect(wrapper.text()).toContain('Northstar Labs')
    expect(wrapper.text()).toContain('Draft')
    expect(wrapper.text()).toContain('Ready for tailoring')
    expect(wrapper.text()).toContain('Frontend Engineering.pdf')
    expect(wrapper.text()).toContain('Tailoring has not started')
    expect(wrapper.text()).not.toContain('Edit details')
    expect(wrapper.findAll('button')).toHaveLength(1)
  })

  it('renders a restrained loading state', async () => {
    mocks.useFetch.mockReturnValue({
      data: ref(null),
      refresh: mocks.refresh,
      status: ref('pending'),
    })

    const wrapper = await mountSuspended(ApplicationConfirmationPage)

    expect(wrapper.get('[aria-busy="true"]').text()).toContain(
      'Loading your application',
    )
    expect(wrapper.text()).toContain('Confirming the saved details now')
  })

  it('keeps unavailable records private and offers read-only recovery', async () => {
    mocks.useFetch.mockReturnValue({
      data: ref(null),
      refresh: mocks.refresh,
      status: ref('error'),
    })

    const wrapper = await mountSuspended(ApplicationConfirmationPage)

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'We couldn’t load this application',
    )
    expect(wrapper.text()).not.toContain('Sensitive provider details')

    const buttons = wrapper.findAll('button')
    await buttons[0]?.trigger('click')
    await buttons[1]?.trigger('click')

    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(mocks.navigateTo).toHaveBeenCalledWith('/dashboard')
  })
})
