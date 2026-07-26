import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ShellSidebar from '~/components/shell/ShellSidebar.vue'
import AuthenticatedLayout from '~/layouts/authenticated.vue'
import type { AuthenticationSessionState } from '../../shared/authentication/types'

const { defaultAuthenticationState, useAuthenticationStateMock, useRouteMock } =
  vi.hoisted(() => {
    const session = {
      authenticated: true as const,
      user: {
        email: 'person@example.com',
        id: 'user-id',
      },
    }
    const state = {
      resolve: vi.fn().mockResolvedValue(session),
      session: {
        value: session,
      },
    }

    return {
      defaultAuthenticationState: state,
      useAuthenticationStateMock: vi.fn(() => state),
      useRouteMock: vi.fn(() => ({ path: '/dashboard' })),
    }
  })

mockNuxtImport('useAuthenticationState', () => useAuthenticationStateMock)
mockNuxtImport('useRoute', () => useRouteMock)

const authenticatedSession = {
  authenticated: true,
  user: {
    email: 'person@example.com',
    id: 'user-id',
  },
} satisfies AuthenticationSessionState

describe('authenticated shell', () => {
  beforeEach(() => {
    defaultAuthenticationState.resolve.mockClear()
    useAuthenticationStateMock.mockClear()
    useAuthenticationStateMock.mockReturnValue(defaultAuthenticationState)
    useRouteMock.mockClear()
    useRouteMock.mockReturnValue({ path: '/dashboard' })
  })

  it('renders the expanded navigation with an honest active and unavailable state', async () => {
    const wrapper = await mountSuspended(ShellSidebar, {
      props: {
        email: authenticatedSession.user.email,
        signOut: vi.fn().mockResolvedValue(null),
      },
    })

    expect(wrapper.get('nav[aria-label="Primary navigation"]')).toBeTruthy()
    expect(wrapper.get('nav[aria-label="Secondary navigation"]')).toBeTruthy()
    expect(
      wrapper
        .get('nav[aria-label="Primary navigation"] a[href="/dashboard"]')
        .attributes('aria-current'),
    ).toBe('page')
    expect(wrapper.text()).toContain('Applications')
    expect(wrapper.text()).toContain('Base resumes')
    expect(wrapper.text()).toContain('Help')
    expect(wrapper.text()).toContain('Settings')
    expect(wrapper.findAll('[aria-disabled="true"]')).toHaveLength(4)
    expect(wrapper.text()).toContain('person@example.com')
  })

  it('consumes the middleware-resolved authentication state without resolving a second session on mount', async () => {
    const resolve = vi.fn().mockResolvedValue(authenticatedSession)
    useAuthenticationStateMock.mockReturnValue({
      resolve,
      session: {
        value: authenticatedSession,
      },
    })

    const wrapper = await mountSuspended(AuthenticatedLayout, {
      slots: {
        default: '<p>Dashboard content</p>',
      },
    })

    expect(wrapper.text()).toContain('Dashboard content')
    expect(wrapper.text()).toContain('person@example.com')
    expect(resolve).toHaveBeenCalledTimes(1)
  })
})
