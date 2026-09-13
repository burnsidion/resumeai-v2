import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import ApplicationListItem from '~/components/applications/ApplicationListItem.vue'
import ApplicationsPageContent from '~/components/applications/ApplicationsPageContent.vue'
import {
  applicationListViewModelSchema,
  type ApplicationListViewModel,
} from '~~/shared/applications/view-model'

const readyApplication = {
  company: 'Northstar Labs',
  id: '4120cbac-ebf4-4580-8988-3fbc65ca9449',
  readiness: {
    isReady: true as const,
    label: 'Ready for tailoring' as const,
    missingRequirements: [] as [],
  },
  role: 'Senior Frontend Engineer',
  status: 'draft' as const,
  statusLabel: 'Draft',
  statusTone: 'neutral' as const,
  updatedAt: '2026-09-08T18:00:00+00:00',
  updatedLabel: '8 Sep 2026',
}

const incompleteApplication = {
  company: 'Lantern Health',
  id: '46ef9556-ec56-4281-b589-f985069b7c37',
  readiness: {
    isReady: false as const,
    label: 'Not ready for tailoring' as const,
    missingRequirements: [
      { id: 'job-description' as const, label: 'Add a job description' },
      { id: 'base-resume' as const, label: 'Select an active base resume' },
    ],
  },
  role: 'Product Engineer',
  status: 'applied' as const,
  statusLabel: 'Applied',
  statusTone: 'info' as const,
  updatedAt: '2026-09-07T18:00:00+00:00',
  updatedLabel: '7 Sep 2026',
}

const populatedApplications: ApplicationListViewModel =
  applicationListViewModelSchema.parse({
    applications: [readyApplication, incompleteApplication],
  })

describe('application list item', () => {
  it('renders one accessible route with trusted summary fields', async () => {
    const wrapper = await mountSuspended(ApplicationListItem, {
      props: { application: readyApplication },
    })
    const route = wrapper.get('a')

    expect(route.attributes('href')).toBe(
      `/applications/${readyApplication.id}`,
    )
    expect(route.attributes('aria-label')).toBe(
      'Open Senior Frontend Engineer at Northstar Labs',
    )
    expect(wrapper.text()).toContain('N')
    expect(wrapper.text()).toContain(readyApplication.role)
    expect(wrapper.text()).toContain(readyApplication.company)
    expect(wrapper.text()).toContain('Draft')
    expect(wrapper.text()).toContain('Ready for tailoring')
    expect(wrapper.get('time').attributes('datetime')).toBe(
      readyApplication.updatedAt,
    )
  })

  it('shows the first deterministic missing requirement without fabricating tailoring state', async () => {
    const wrapper = await mountSuspended(ApplicationListItem, {
      props: { application: incompleteApplication },
    })

    expect(wrapper.text()).toContain('Add a job description')
    expect(wrapper.text()).not.toContain('Select an active base resume')
    expect(wrapper.text()).not.toContain('Ready for tailoring')
  })
})

describe('Applications page content', () => {
  it('renders recent-first summaries with one creation action', async () => {
    const wrapper = await mountSuspended(ApplicationsPageContent, {
      props: { applications: populatedApplications },
    })

    expect(wrapper.get('h1').text()).toBe('Applications')
    expect(wrapper.text()).toContain('Most recently updated first')
    expect(wrapper.text()).toContain('2 applications')

    const applicationRoutes = wrapper.findAll('li a')

    expect(applicationRoutes).toHaveLength(2)
    expect(applicationRoutes[0]?.attributes('href')).toBe(
      `/applications/${readyApplication.id}`,
    )
    expect(applicationRoutes[1]?.attributes('href')).toBe(
      `/applications/${incompleteApplication.id}`,
    )

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('create-requested')).toHaveLength(1)
  })

  it('treats zero applications as useful guidance with a creation path', async () => {
    const wrapper = await mountSuspended(ApplicationsPageContent, {
      props: { applications: { applications: [] } },
    })

    expect(wrapper.text()).toContain('Create your first application')
    expect(wrapper.text()).toContain(
      'Company and role are all you need to begin.',
    )
    expect(wrapper.find('ul').exists()).toBe(false)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('create-requested')).toHaveLength(1)
  })
})
