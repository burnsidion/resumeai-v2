import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ApplicationEditingForm from '~/components/applications/ApplicationEditingForm.vue'
import type { ApplicationEditingState } from '~/composables/useApplicationEditing'
import type { UpdateApplicationRequest } from '~~/shared/applications/management'
import type { ApplicationDetailViewModel } from '~~/shared/applications/view-model'
import type { BaseResumeManagementItemViewModel } from '~~/shared/base-resumes/view-model'

const applicationId = '4120cbac-ebf4-4580-8988-3fbc65ca9449'
const resume: BaseResumeManagementItemViewModel = {
  activeSlot: 1,
  createdAt: '2026-09-01T18:00:00+00:00',
  fileSizeLabel: '482 KiB',
  filename: 'Frontend Engineering.pdf',
  id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
  sizeBytes: 493_568,
  slotLabel: 'Slot 1',
  statusLabel: 'Active',
  uploadedLabel: 'Uploaded September 1, 2026',
}
const application: ApplicationDetailViewModel = {
  appliedOn: null,
  company: 'Northstar Labs',
  createdAt: '2026-09-07T18:00:00.000Z',
  createdLabel: 'Sep 7, 2026',
  id: applicationId,
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
const idleState: ApplicationEditingState = { status: 'idle' }
const wrappers: VueWrapper[] = []
type ApplicationEditingSubmit = (
  input: UpdateApplicationRequest,
) => Promise<ApplicationDetailViewModel | null>

const mountForm = (
  props: Partial<{
    application: ApplicationDetailViewModel
    baseResumes: ReadonlyArray<BaseResumeManagementItemViewModel>
    baseResumesStatus: 'error' | 'pending' | 'success'
    editingState: ApplicationEditingState
    submit: ApplicationEditingSubmit
  }> = {},
) =>
  mountSuspended(ApplicationEditingForm, {
    attachTo: document.body,
    props: {
      application,
      baseResumes: [resume],
      baseResumesStatus: 'success',
      editingState: idleState,
      submit: vi.fn<ApplicationEditingSubmit>().mockResolvedValue(null),
      ...props,
    },
  }).then((wrapper) => {
    wrappers.push(wrapper)
    return wrapper
  })

const getButton = (wrapper: VueWrapper, label: string) => {
  const button = wrapper
    .findAll('button')
    .find((candidate) => candidate.text().trim() === label)

  if (!button) {
    throw new Error(`Expected a ${label} button.`)
  }

  return button
}

describe('application editing form', () => {
  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  })

  it('starts from trusted details with no unsaved changes', async () => {
    const wrapper = await mountForm()

    expect(
      wrapper.get<HTMLInputElement>('#application-company').element.value,
    ).toBe('Northstar Labs')
    expect(
      wrapper.get<HTMLInputElement>('#application-role').element.value,
    ).toBe('Senior Frontend Engineer')
    expect(
      wrapper.get<HTMLSelectElement>('#application-status').element.value,
    ).toBe('draft')
    expect(wrapper.get('#application-applied-on').attributes('type')).toBe(
      'date',
    )
    expect(
      wrapper.get('#application-applied-on').attributes('required'),
    ).toBeUndefined()
    expect(wrapper.text()).toContain('No changes to save')
    expect(getButton(wrapper, 'Save changes').attributes('disabled')).toBe('')
    expect(wrapper.emitted('dirty-changed')).toEqual([[false]])
  })

  it('submits normalized complete details with the loaded version', async () => {
    const submit = vi.fn<ApplicationEditingSubmit>().mockResolvedValue(null)
    const wrapper = await mountForm({ submit })

    await wrapper
      .get('#application-company')
      .setValue('  Northstar Labs, Inc.  ')
    await wrapper
      .get('#application-role')
      .setValue('  Staff Frontend Engineer  ')
    await wrapper.get('#application-status').setValue('interviewing')
    await wrapper.get('#application-applied-on').setValue('2026-09-13')
    await wrapper
      .get('#application-job-description')
      .setValue('  Build accessible Vue experiences.  ')
    await wrapper.get('#application-posting-url').setValue('   ')
    await wrapper.get('#application-notes').setValue('  Follow up Friday.  ')
    await wrapper
      .get<HTMLInputElement>(`input[value="${resume.id}"]`)
      .setValue()

    expect(wrapper.text()).toContain('Unsaved changes')
    expect(
      getButton(wrapper, 'Save changes').attributes('disabled'),
    ).toBeUndefined()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(submit).toHaveBeenCalledWith({
      appliedOn: '2026-09-13',
      company: 'Northstar Labs, Inc.',
      expectedUpdatedAt: application.updatedAt,
      jobDescription: 'Build accessible Vue experiences.',
      notes: 'Follow up Friday.',
      postingUrl: null,
      role: 'Staff Frontend Engineer',
      selectedBaseResumeId: resume.id,
      status: 'interviewing',
    })
  })

  it('summarizes required-field errors and moves focus to the summary', async () => {
    const submit = vi.fn<ApplicationEditingSubmit>()
    const wrapper = await mountForm({ submit })

    await wrapper.get('#application-company').setValue('   ')
    await wrapper.get('#application-role').setValue('   ')
    await wrapper.get('form').trigger('submit')

    const summary = wrapper.get<HTMLElement>('[role="alert"]')
    expect(summary.text()).toContain('2 details need your attention')
    expect(summary.text()).toContain('Company: Enter a company name.')
    expect(summary.text()).toContain('Role: Enter a role or position title.')
    expect(document.activeElement).toBe(summary.element)
    expect(submit).not.toHaveBeenCalled()
  })

  it('keeps status and applied date independent while updating readiness', async () => {
    const wrapper = await mountForm()

    await wrapper.get('#application-status').setValue('applied')
    expect(
      wrapper.get<HTMLInputElement>('#application-applied-on').element.value,
    ).toBe('')

    await wrapper
      .get('#application-job-description')
      .setValue('Build an accessible Vue product.')
    await wrapper
      .get<HTMLInputElement>(`input[value="${resume.id}"]`)
      .setValue()

    expect(wrapper.text()).toContain('Ready after saving')
    expect(wrapper.text()).toContain('Job description added')
    expect(wrapper.text()).toContain('Base resume selected')
    expect(wrapper.text()).toContain('only when you explicitly request it')
  })

  it('prevents duplicate submission and disables controls while unresolved', async () => {
    let finishSubmission: () => void = () => undefined
    const submit = vi.fn<ApplicationEditingSubmit>(
      () =>
        new Promise<null>((resolve) => {
          finishSubmission = () => resolve(null)
        }),
    )
    const wrapper = await mountForm({ submit })

    await wrapper.get('#application-role').setValue('Staff Engineer')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')

    expect(submit).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('Saving changes…')
    expect(wrapper.get('#application-company').attributes('disabled')).toBe('')
    expect(wrapper.get('#application-status').attributes('disabled')).toBe('')
    expect(getButton(wrapper, 'Saving changes…').attributes('disabled')).toBe(
      '',
    )

    finishSubmission()
    await flushPromises()
  })

  it('preserves a retired historical selection until the user changes it', async () => {
    const retiredSelection = {
      availabilityLabel: 'Unavailable' as const,
      filename: 'Retired Frontend Resume.pdf',
      id: 'edab48cd-9d8b-4d51-bc6f-21315ca5a90e',
      isAvailable: false as const,
    }
    const submit = vi.fn<ApplicationEditingSubmit>().mockResolvedValue(null)
    const wrapper = await mountForm({
      application: {
        ...application,
        selectedBaseResume: retiredSelection,
      },
      submit,
    })

    expect(wrapper.text()).toContain('Retired Frontend Resume.pdf')
    expect(wrapper.text()).toContain(
      'Unavailable · Preserved for this application',
    )
    expect(
      wrapper
        .get<HTMLInputElement>(`input[value="${retiredSelection.id}"]`)
        .attributes('disabled'),
    ).toBe('')
    expect(wrapper.text()).toContain('Choose a base resume')

    await wrapper.get('#application-notes').setValue('Keep historical source.')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ selectedBaseResumeId: retiredSelection.id }),
    )

    await wrapper
      .get<HTMLInputElement>(`input[value="${resume.id}"]`)
      .setValue()
    expect(wrapper.text()).not.toContain('Retired Frontend Resume.pdf')
  })

  it('preserves edits and emits mapped recovery after a failed save', async () => {
    const wrapper = await mountForm()

    await wrapper
      .get('#application-notes')
      .setValue('Ask about team ownership.')
    await wrapper.setProps({
      editingState: {
        applicationId,
        failure: {
          code: 'application-update-conflict',
          message:
            'This application changed after you opened it. Reload the latest version before editing again.',
          recovery: 'refresh-application',
          retryable: false,
        },
        status: 'failure',
      },
    })

    expect(
      wrapper.get<HTMLTextAreaElement>('#application-notes').element.value,
    ).toBe('Ask about team ownership.')
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'This application changed after you opened it',
    )
    expect(getButton(wrapper, 'Save changes').attributes('disabled')).toBe('')

    await getButton(wrapper, 'Reload application').trigger('click')
    expect(wrapper.emitted('recovery-requested')).toEqual([
      ['refresh-application'],
    ])
  })
})
