import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

import { useDashboard } from '../../app/composables/useDashboard'
import type { DashboardViewModel } from '../../shared/dashboard/view-model'
import { populatedDashboardViewModel } from '../fixtures/dashboard-view-model'

const { useFetchMock } = vi.hoisted(() => ({
  useFetchMock: vi.fn(),
}))

mockNuxtImport('useFetch', () => useFetchMock)

describe('dashboard composable', () => {
  it('loads the authenticated relative endpoint and validates its response', () => {
    const fetchState = {
      data: ref(populatedDashboardViewModel),
      status: ref('success'),
    }
    useFetchMock.mockReturnValue(fetchState)

    expect(useDashboard()).toBe(fetchState)
    expect(useFetchMock).toHaveBeenCalledOnce()

    const [endpoint, options] = useFetchMock.mock.calls[0] as [
      string,
      (
        | {
            key: string
            transform(response: unknown): DashboardViewModel
          }
        | undefined
      ),
    ]

    expect(endpoint).toBe('/api/dashboard')
    expect(options).toEqual(
      expect.objectContaining({
        key: 'dashboard',
        transform: expect.any(Function),
      }),
    )
    expect(options?.transform(populatedDashboardViewModel)).toEqual(
      populatedDashboardViewModel,
    )
    expect(() =>
      options?.transform({
        ...populatedDashboardViewModel,
        providerDetails: 'must not cross the dashboard boundary',
      }),
    ).toThrow()
  })
})
